import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createTestDatabase } from './test-database.ts'
const { db, customer, stranger, mechanic, admin, vehicle, service, as, fails, isolated, rentalSql, serviceSql } = createTestDatabase(2)


async function rental(method='online') {
  await as('authenticated', customer)
  const request=randomUUID()
  await db.query(`select accept_transaction_terms('${request}','vehicle','2026-10-20')`)
  return (await db.query(`select * from create_vehicle_booking('${request}','${vehicle}',current_date+1,current_date+3,null,'10:00','12:00','${method}')`)).rows[0]
}
async function upload(booking) {
  const path=`${customer}/${randomUUID()}.jpg`
  await as('postgres'); await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['driver-licenses',path])
  await as('authenticated', customer)
  return (await db.query(`select submit_rental_license('${booking.id}',$1) as id`,[path])).rows[0].id
}
async function approve(booking) {
  await upload(booking); await as('authenticated', admin)
  await db.query(`select review_rental_license('${booking.id}','approved',current_date+365,'Valid matching license')`)
}

isolated('rental requires accepted terms, timestamps, 24-hour rounded price and review hold',async()=>{
  await as('authenticated', customer)
  await fails(rentalSql(), /accept the transaction terms/)
  const b=await rental()
  assert.equal(b.total_price,'3000.00')
  assert.equal(b.checkout_state,'license_pending')
  assert.equal(new Date(b.review_deadline)-new Date(b.created_at),3600000)
  await fails(`select * from create_vehicle_booking('${randomUUID()}','${vehicle}',current_date+1,current_date+2,null,'07:00','08:00','cash')`,/8 AM to 6 PM/)
  assert.equal((await db.query('select * from operations_queue')).rows.length,0)
})

isolated('private upload verifies owner, stored object and active original deadline',async()=>{
  const b=await rental()
  await fails(`select submit_rental_license('${b.id}','${stranger}/fake.jpg')`,/Invalid license upload/)
  await fails(`select submit_rental_license('${b.id}','${customer}/missing.jpg')`,/Upload the license first/)
  await upload(b)
  await as('authenticated', stranger)
  assert.equal((await db.query('select * from driver_licenses')).rows.length,0)
  await fails(`select submit_rental_license('${b.id}','${stranger}/fake.jpg')`,/access denied/)
  await as('authenticated', customer)
  await fails("update driver_licenses set state='approved'",/permission denied/)
})

isolated('unreadable reupload keeps original hold; invalid rejection releases reservation',async()=>{
  const b=await rental(); await upload(b)
  await as('authenticated', admin)
  await db.query(`select review_rental_license('${b.id}','unreadable',null,'Image is blurry')`)
  await upload(b)
  assert.equal((await db.query(`select review_deadline from vehicle_bookings where id='${b.id}'`)).rows[0].review_deadline.getTime(),b.review_deadline.getTime())
  await as('authenticated', admin)
  await db.query(`select review_rental_license('${b.id}','rejected',null,'License expired')`)
  assert.equal((await db.query(`select status from vehicle_bookings where id='${b.id}'`)).rows[0].status,'cancelled')
})

isolated('approval precedes online checkout and starts 3-hour window with notification',async()=>{
  const b=await rental()
  await as('service_role')
  await fails(`select require_payable_checkout('vehicle','${b.id}')`,/approved valid license/)
  await approve(b)
  const next=(await db.query(`select * from vehicle_bookings where id='${b.id}'`)).rows[0]
  assert.equal(next.checkout_state,'awaiting_payment')
  assert.equal(next.hold_expires_at.getTime()-b.created_at.getTime(),10800000)
  assert.equal((await db.query("select * from notifications where title='Driver license approved'")).rows.length,1)
  await as('service_role'); await db.query(`select require_payable_checkout('vehicle','${b.id}')`)
})

isolated('license must remain valid through return and customers cannot approve themselves',async()=>{
  const b=await rental(); await upload(b)
  await fails(`select review_rental_license('${b.id}','approved',current_date+365,'Approve myself')`,/Administrator access/)
  await as('authenticated', admin)
  await fails(`select review_rental_license('${b.id}','approved',current_date+1,'Valid license')`,/valid through return/)
})

isolated('cash confirms after approval, needs collection before handover, and cannot be customer-cancelled',async()=>{
  const b=await rental('cash'); await approve(b)
  assert.equal((await db.query(`select status from vehicle_bookings where id='${b.id}'`)).rows[0].status,'confirmed')
  await fails(`update vehicle_bookings set status='in_progress' where id='${b.id}'`,/collected payment/)
  await as('authenticated', customer)
  await fails(`select cancel_customer_booking('vehicle','${b.id}')`,/no longer be cancelled/)
  await as('authenticated', admin)
  const request=randomUUID()
  await db.query(`select record_rental_cash('${b.id}','${request}','Cash collected at pickup')`)
  await db.query(`select record_rental_cash('${b.id}','${request}','Retry cash collection')`)
  assert.equal((await db.query("select * from payments where provider='cash'")).rows.length,1)
  await db.query(`update vehicle_bookings set status='in_progress' where id='${b.id}'`)
})

isolated('successful payment after hold expiry never resurrects reservation and queues full refund',async()=>{
  const b=await rental(); await approve(b); await as('postgres')
  await db.query(`update vehicle_bookings set hold_expires_at=now()-interval '1 second' where id='${b.id}'`)
  const payment=randomUUID()
  await db.query(`insert into payments(id,booking_type,booking_id,customer_id,amount,status) values('${payment}','vehicle','${b.id}','${customer}',${b.total_price},'pending')`)
  await as('service_role'); await db.query(`select reconcile_payment('${payment}','succeeded')`)
  const next=(await db.query(`select * from vehicle_bookings where id='${b.id}'`)).rows[0]
  assert.equal(next.status,'cancelled'); assert.equal(next.checkout_state,'expired')
  assert.equal((await db.query("select * from operations_queue where kind='refund_required'")).rows.length,1)
})

isolated('maintenance expires overdue license review but cannot be invoked by customers',async()=>{
  const b=await rental(); await as('postgres')
  await db.query(`update vehicle_bookings set hold_expires_at=now()-interval '1 second' where id='${b.id}'`)
  await as('authenticated', customer); await fails('select run_account_maintenance()',/permission denied/)
  await as('service_role'); await db.query('select run_account_maintenance()')
  assert.equal((await db.query(`select checkout_state from vehicle_bookings where id='${b.id}'`)).rows[0].checkout_state,'expired')
})



