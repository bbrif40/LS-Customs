import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createTestDatabase } from './test-database.ts'

const { db, customer, as, isolated } = createTestDatabase(9)

isolated('PayMongo account balance settles only after success and repeated webhook delivery credits once', async () => {
  const bookingId = randomUUID()
  await as('postgres')
  const charge = (await db.query(`insert into account_charges(customer_id,booking_type,booking_id,kind,description,amount)
    values('${customer}','vehicle','${bookingId}','late_return','Late return',250) returning id`)).rows[0]

  await as('authenticated', customer)
  const quote = (await db.query('select * from create_account_quote()')).rows[0]
  await as('postgres')
  const payment = (await db.query(`insert into payments(booking_type,booking_id,customer_id,amount,currency,provider,provider_reference,status,account_quote_id)
    values('vehicle','${bookingId}','${customer}',${quote.amount},'PHP','paymongo','cs_test','pending','${quote.id}') returning id`)).rows[0]

  await as('service_role')
  assert.equal((await db.query(`select paid from account_charges where id='${charge.id}'`)).rows[0].paid, '0.00')
  assert.equal((await db.query(`select settled_at from account_quotes where id='${quote.id}'`)).rows[0].settled_at, null)

  await db.query(`select reconcile_payment('${payment.id}','failed')`)
  assert.equal((await db.query(`select paid from account_charges where id='${charge.id}'`)).rows[0].paid, '0.00')
  assert.equal((await db.query(`select settled_at from account_quotes where id='${quote.id}'`)).rows[0].settled_at, null)
  assert.equal((await db.query("select count(*)::int as count from account_events where kind='online'")).rows[0].count, 0)

  await db.exec(`select reconcile_payment('${payment.id}','succeeded'); select reconcile_payment('${payment.id}','succeeded')`)
  assert.equal((await db.query(`select paid from account_charges where id='${charge.id}'`)).rows[0].paid, '250.00')
  assert.ok((await db.query(`select settled_at from account_quotes where id='${quote.id}'`)).rows[0].settled_at)
  assert.equal((await db.query("select count(*)::int as count from account_events where kind='online'")).rows[0].count, 1)

  await db.query(`select reconcile_payment('${payment.id}','failed')`)
  assert.equal((await db.query(`select status from payments where id='${payment.id}'`)).rows[0].status, 'succeeded')
})
