import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createTestDatabase } from './test-database.ts'
const { db, customer, stranger, mechanic, admin, vehicle, service, as, fails, isolated, rentalSql, serviceSql } = createTestDatabase(3)

async function serviceBooking(method='online') {
  await as('authenticated',customer)
  const request=randomUUID()
  await db.query(`select accept_transaction_terms('${request}','service','2026-10-20')`)
  return (await db.query(`select * from create_service_booking('${request}','${service}',(current_date+1+time '10:00') at time zone 'Asia/Manila',null,14.6,121.0,'Confirmed location',null,null,'${method}')`)).rows[0]
}
async function accept(b) {
  await as('authenticated',mechanic)
  const offer=(await db.query(`select * from mechanic_offers where booking_id='${b.id}'`)).rows[0]
  await db.query(`select respond_mechanic_offer('${offer.id}',true)`)
  return offer
}
isolated('online service offers before payment and accepts with 10-minute capacity hold',async()=>{
  const b=await serviceBooking()
  assert.equal(b.checkout_state,'offering')
  await as('service_role'); await fails(`select require_payable_checkout('service','${b.id}')`,/Mechanic acceptance/)
  const offer=await accept(b)
  assert.equal(offer.expires_at.getTime()-b.created_at.getTime(),300000)
  await as('authenticated',customer)
  const next=(await db.query(`select * from service_bookings where id='${b.id}'`)).rows[0]
  assert.equal(next.checkout_state,'awaiting_payment'); assert.equal(next.status,'pending')
  assert.equal(next.hold_expires_at.getTime()-b.created_at.getTime(),600000)
})
isolated('cash confirms only on mechanic acceptance and collection follows completion',async()=>{
  const b=await serviceBooking('cash'); await accept(b)
  await fails(`select record_service_cash('${b.id}','${randomUUID()}')`,/after service completion/)
  await db.query(`update service_bookings set status='en_route' where id='${b.id}'`)
  await db.query(`update service_bookings set status='in_progress' where id='${b.id}'`)
  await db.query(`update service_bookings set status='completed' where id='${b.id}'`)
  await db.query(`select record_service_cash('${b.id}','${randomUUID()}')`)
  await db.query(`select record_service_cash('${b.id}','${randomUUID()}')`)
  await as('postgres')
  assert.equal((await db.query("select * from payments where provider='cash'")).rows.length,1)
  assert.equal((await db.query('select * from mechanic_capacity')).rows.length,0)
})
isolated('customers cannot accept offers and expired offers cannot win',async()=>{
  const b=await serviceBooking()
  const offer=(await db.query(`select * from mechanic_offers where booking_id='${b.id}'`)).rows[0]
  await fails(`select respond_mechanic_offer('${offer.id}',true)`,/Offer access denied/)
  await as('postgres'); await db.query(`update mechanic_offers set expires_at=now()-interval '1 second' where id='${offer.id}'`)
  await as('authenticated',mechanic); await fails(`select respond_mechanic_offer('${offer.id}',true)`,/no longer available/)
})
isolated('parallel offers have exactly one winner and other offers close',async()=>{
  const other=randomUUID()
  await as('postgres')
  await db.query(`insert into auth.users(id,email) values('${other}','second-mechanic@example.test')`)
  await db.query(`update profiles set role='mechanic' where id='${other}'`)
  await db.query(`insert into mechanic_profiles(id,is_available,current_lat,current_lng) values('${other}',true,14.6,121.0)`)
  const b=await serviceBooking('cash')
  const offers=(await db.query(`select * from mechanic_offers where booking_id='${b.id}'`)).rows
  assert.equal(offers.length,2)
  await accept(b)
  await as('authenticated',other)
  await fails(`select respond_mechanic_offer('${offers.find(o=>o.mechanic_id===other).id}',true)`,/no longer available/)
  await as('postgres')
  assert.equal((await db.query("select * from mechanic_offers where state='accepted'")).rows.length,1)
})
isolated('failed online payment can switch to cash but pending payment cannot',async()=>{
  const b=await serviceBooking(); await accept(b); await as('authenticated',customer)
  await db.query(`select accept_transaction_terms('${b.id}','payment','2026-10-20')`)
  await as('postgres')
  const payment=randomUUID()
  await db.query(`insert into payments(id,booking_type,booking_id,customer_id,amount,status) values('${payment}','service','${b.id}','${customer}',${b.total_price},'pending')`)
  await as('authenticated',customer); await fails(`select confirm_service_cash('${b.id}')`,/payment outcome/)
  await as('service_role'); await db.query(`select reconcile_payment('${payment}','failed')`)
  await as('authenticated',customer); await db.query(`select confirm_service_cash('${b.id}')`)
  assert.equal((await db.query(`select checkout_state from service_bookings where id='${b.id}'`)).rows[0].checkout_state,'confirmed')
})
isolated('late successful payment refunds instead of confirming expired mechanic capacity',async()=>{
  const b=await serviceBooking(); await accept(b); await as('postgres')
  await db.query(`update service_bookings set hold_expires_at=now()-interval '1 second' where id='${b.id}'`)
  const payment=randomUUID()
  await db.query(`insert into payments(id,booking_type,booking_id,customer_id,amount,status) values('${payment}','service','${b.id}','${customer}',${b.total_price},'pending')`)
  await as('service_role'); await db.query(`select reconcile_payment('${payment}','succeeded')`)
  assert.equal((await db.query(`select checkout_state from service_bookings where id='${b.id}'`)).rows[0].checkout_state,'expired')
  assert.equal((await db.query("select * from operations_queue where kind='refund_required'")).rows.length,1)
})

