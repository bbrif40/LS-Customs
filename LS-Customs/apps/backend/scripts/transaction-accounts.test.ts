import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createTestDatabase } from './test-database.ts'
const { db, customer, stranger, mechanic, admin, vehicle, service, as, fails, isolated, rentalSql, serviceSql } = createTestDatabase(1)


async function rental() {
  const request = randomUUID()
  await db.query(`select accept_transaction_terms('${request}','vehicle','2026-10-20')`)
  return db.query(rentalSql(request))
}

async function charge(ageHours = 0, amount = 250) {
  await as('postgres')
  return (await db.query(`insert into account_charges(customer_id,booking_type,booking_id,kind,description,amount,posted_at,due_at)
    values('${customer}','vehicle','${randomUUID()}','late_return','Late return',${amount},now()-interval '${ageHours} hours',now()+interval '${24-ageHours} hours') returning *`)).rows[0]
}

isolated('terms are versioned, idempotent and private; arbitrary versions are rejected', async () => {
  const transaction = randomUUID()
  await as('authenticated', customer)
  await fails(`select accept_transaction_terms('${transaction}','vehicle','old')`, /Terms have changed/)
  const sql = `select accept_transaction_terms('${transaction}','vehicle','2026-10-20') as id`
  const first = (await db.query(sql)).rows[0].id
  assert.equal((await db.query(sql)).rows[0].id, first)
  await fails(`update transaction_acceptances set customer_id='${stranger}'`, /permission denied/)
  await as('authenticated', stranger)
  assert.equal((await db.query('select * from transaction_acceptances')).rows.length, 0)
  await as('anon')
  await fails('select * from transaction_acceptances', /permission denied/)
})

isolated('flag at 24h, first penalty at 48h, no partial day and no duplicate penalties', async () => {
  await charge(23.9)
  await as('authenticated', customer)
  await db.query(`select refresh_customer_account('${customer}')`)
  assert.equal((await db.query('select flagged_at from account_flags')).rows[0].flagged_at, null)
  await as('postgres')
  await db.query(`update account_charges set posted_at=now()-interval '24 hours'`)
  await as('authenticated', customer)
  await db.query(`select refresh_customer_account('${customer}')`)
  assert.ok((await db.query('select flagged_at from account_flags')).rows[0].flagged_at)
  assert.equal((await db.query('select * from account_charges')).rows.length, 1)
  await as('postgres'); await db.query(`update account_charges set posted_at=now()-interval '71 hours 59 minutes'`)
  await as('authenticated', customer)
  await db.exec(`select refresh_customer_account('${customer}'); select refresh_customer_account('${customer}')`)
  assert.equal((await db.query("select * from account_charges where kind='daily_penalty'")).rows.length, 1)
  await as('postgres'); await db.query(`update account_charges set posted_at=now()-interval '72 hours' where kind='late_return'`)
  await as('authenticated', customer); await db.query(`select refresh_customer_account('${customer}')`)
  assert.equal((await db.query("select * from account_charges where kind='daily_penalty'")).rows.length, 2)
})

isolated('customers cannot settle, waive, forge charges, see other balances or invoke provider settlement', async () => {
  const c = await charge()
  await as('authenticated', customer)
  await fails(`select adjust_account_charge('${c.id}',250,'cash','test cash','${randomUUID()}')`, /Administrator access/)
  await fails(`insert into account_charges(customer_id,booking_type,booking_id,kind,description,amount) values('${customer}','vehicle','${randomUUID()}','damage','fake',1)`, /permission denied/)
  await fails(`select settle_account_quote('${randomUUID()}','${randomUUID()}')`, /permission denied/)
  await as('authenticated', stranger)
  assert.equal((await db.query('select * from account_charges')).rows.length,0)
  await fails(`select refresh_customer_account('${customer}')`, /Account access denied/)
})

isolated('admin cash and waiver are idempotent, audited, cannot overpay; all debt gates rentals', async () => {
  const c = await charge()
  await as('authenticated', customer)
  const blockedRequest = randomUUID()
  await db.query(`select accept_transaction_terms('${blockedRequest}','vehicle','2026-10-20')`)
  await fails(rentalSql(blockedRequest), /Settle outstanding/)
  await as('authenticated', admin)
  const request = randomUUID()
  const settle = `select adjust_account_charge('${c.id}',100,'cash','Cash received','${request}')`
  await db.query(settle); await db.query(settle)
  assert.equal((await db.query(`select paid from account_charges where id='${c.id}'`)).rows[0].paid, '100.00')
  assert.equal((await db.query('select * from account_events')).rows.length,1)
  await fails(`select adjust_account_charge('${c.id}',151,'waiver','Approved waiver','${randomUUID()}')`, /exceeds outstanding/)
  await db.query(`select adjust_account_charge('${c.id}',150,'waiver','Approved waiver','${randomUUID()}')`)
  await fails('delete from account_events', /permission denied/)
  await as('authenticated', customer)
  await rental()
})

isolated('paying original fee leaves penalties and flag active until full settlement', async () => {
  const c = await charge(48)
  await as('authenticated', admin)
  await db.query(`select adjust_account_charge('${c.id}',250,'cash','Cash received','${randomUUID()}')`)
  assert.ok((await db.query('select flagged_at from account_flags')).rows[0].flagged_at)
  const penalty = (await db.query("select id from account_charges where kind='daily_penalty'")).rows[0]
  await db.query(`select adjust_account_charge('${penalty.id}',1000,'waiver','Approved waiver','${randomUUID()}')`)
  assert.equal((await db.query('select flagged_at from account_flags')).rows[0].flagged_at,null)
})

isolated('quotes protect the total for 10 minutes and settlement is provider-only and replay safe', async () => {
  await charge(47.99)
  await as('authenticated', customer)
  const q = (await db.query('select * from create_account_quote()')).rows[0]
  assert.equal(q.amount,'250.00')
  assert.equal((await db.query('select * from create_account_quote()')).rows[0].id,q.id)
  await as('postgres'); await db.query(`update account_charges set posted_at=now()-interval '48 hours'`)
  await as('service_role')
  const request = randomUUID()
  await db.exec(`select settle_account_quote('${q.id}','${request}'); select settle_account_quote('${q.id}','${request}')`)
  assert.equal((await db.query('select * from account_events')).rows.length,1)
  assert.equal((await db.query("select * from account_charges where kind='daily_penalty'")).rows.length,0)
})

isolated('late quote payment credits original debt and leaves elapsed daily penalties outstanding', async () => {
  await charge(47)
  await as('authenticated', customer)
  const q = (await db.query('select * from create_account_quote()')).rows[0]
  await as('postgres')
  await db.exec(`update account_quotes set expires_at=now()-interval '1 second'; update account_charges set posted_at=now()-interval '48 hours'`)
  await as('service_role'); await db.query(`select settle_account_quote('${q.id}','${randomUUID()}')`)
  assert.equal((await db.query("select paid from account_charges where kind='late_return'")).rows[0].paid,'250.00')
  assert.equal((await db.query("select amount-paid-waived as remaining from account_charges where kind='daily_penalty'")).rows[0].remaining,'1000.00')
})

isolated('return fee uses completed hours only and requires admin authority', async () => {
  await as('authenticated', customer)
  const b = (await rental()).rows[0]
  await as('postgres')
  await db.query(`update vehicle_bookings set status='in_progress', pickup_at=now()-interval '3 days',return_at=now()-interval '1 hour 59 minutes' where id='${b.id}'`)
  await as('authenticated', customer)
  await fails(`select record_vehicle_return('${b.id}',now(),'Vehicle returned','${randomUUID()}')`, /Administrator access/)
  await as('authenticated', admin)
  assert.equal((await db.query(`select record_vehicle_return('${b.id}',now(),'Vehicle returned','${randomUUID()}') as fee`)).rows[0].fee,'250')
})
