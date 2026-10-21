import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createTestDatabase } from './test-database.ts'
const { db, customer, stranger, mechanic, admin, vehicle, service, as, fails, isolated, rentalSql, serviceSql } = createTestDatabase(4)

async function bookedService(method='online') {
  await as('authenticated',customer)
  const request=randomUUID()
  await db.query(`select accept_transaction_terms('${request}','service','2026-10-20')`)
  const b=(await db.query(`select * from create_service_booking('${request}','${service}',(current_date+1+time '10:00') at time zone 'Asia/Manila',null,14.6,121.0,'Confirmed location',null,null,'${method}')`)).rows[0]
  await as('authenticated',mechanic)
  const offer=(await db.query(`select id from mechanic_offers where booking_id='${b.id}'`)).rows[0]
  await db.query(`select respond_mechanic_offer('${offer.id}',true)`)
  if(method==='online') {
    await as('postgres')
    const payment=randomUUID()
    await db.query(`insert into payments(id,booking_type,booking_id,customer_id,amount,status) values('${payment}','service','${b.id}','${customer}',${b.total_price},'pending')`)
    await as('service_role'); await db.query(`select reconcile_payment('${payment}','succeeded')`)
  }
  await as('authenticated',customer)
  return b
}
async function evidence(type,booking) {
  const path=`${type}/${booking}/${randomUUID()}.jpg`
  await as('postgres'); await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['booking-evidence',path]); return path
}
isolated('customer cancellation before travel quotes full refund; approval keeps refund pending until provider confirms',async()=>{
  const b=await bookedService()
  const quote=(await db.query(`select cancellation_quote('service','${b.id}') as quote`)).rows[0].quote
  assert.equal(Number(quote.refund_amount),Number(b.total_price))
  const r=(await db.query(`select * from request_booking_cancellation('service','${b.id}','Change of plans')`)).rows[0]
  assert.equal((await db.query(`select status from service_bookings where id='${b.id}'`)).rows[0].status,'assigned')
  await as('authenticated',admin); await db.query(`select review_booking_cancellation('${r.id}',true,'Approved before travel')`)
  const refund=(await db.query('select * from workflow_refunds')).rows[0]
  assert.equal(refund.state,'pending')
  await as('service_role'); await db.query(`select settle_workflow_refund('${refund.id}','refund_test','succeeded')`)
  await db.query(`select settle_workflow_refund('${refund.id}','refund_test','succeeded')`)
  assert.equal((await db.query(`select refunded_amount from payments where id='${refund.payment_id}'`)).rows[0].refunded_amount,b.total_price)
})
isolated('during travel customer cancellation refunds 45% without marking full payment refunded',async()=>{
  const b=await bookedService(); await as('authenticated',mechanic)
  await db.query(`update service_bookings set status='en_route' where id='${b.id}'`)
  await as('authenticated',customer)
  const r=(await db.query(`select * from request_booking_cancellation('service','${b.id}','Cancel during travel')`)).rows[0]
  assert.equal(Number(r.amount),Math.round(Number(b.total_price)*45)/100)
  await as('authenticated',admin); await db.query(`select review_booking_cancellation('${r.id}',true,'Approved during travel')`)
  const refund=(await db.query('select * from workflow_refunds')).rows[0]
  await as('service_role'); await db.query(`select settle_workflow_refund('${refund.id}','refund_partial','succeeded')`)
  assert.equal((await db.query(`select status from payments where id='${refund.payment_id}'`)).rows[0].status,'succeeded')
})
isolated('three customer cash cancellations create review without unpaid-debt flags',async()=>{
  for(let i=0;i<3;i++) {
    const b=await bookedService('cash')
    await db.query(`select request_booking_cancellation('service','${b.id}','Cash cancellation')`)
  }
  await as('authenticated',admin)
  assert.equal((await db.query("select * from operations_queue where kind='cancellation_review'")).rows.length,1)
  assert.equal((await db.query('select * from account_flags where flagged_at is not null')).rows.length,0)
})
isolated('unapproved extras never create debt; customer acceptance records exact itemized amount',async()=>{
  const b=await bookedService('cash'); const path=await evidence('service',b.id)
  await as('authenticated',mechanic)
  const q=(await db.query(`select propose_booking_charge('service','${b.id}','service_extra','[{"description":"Replacement part","amount":500}]',array[$1],'Repair quote') as id`,[path])).rows[0].id
  await as('authenticated',customer)
  assert.equal((await db.query('select * from account_charges')).rows.length,0)
  await fails(`select respond_booking_quote('${q}',true)`,/accept the transaction terms/)
  await db.query(`select accept_transaction_terms('${q}','payment','2026-10-20')`)
  await db.query(`select respond_booking_quote('${q}',true)`)
  const charge=(await db.query('select * from account_charges')).rows[0]
  assert.equal(charge.amount,'500.00'); assert.equal(charge.blocks_rentals,false)
})
isolated('completed work requires a report and reports remain customer visible',async()=>{
  const b=await bookedService('cash'); const path=await evidence('service',b.id)
  await as('authenticated',mechanic)
  await db.query(`update service_bookings set status='en_route' where id='${b.id}'`)
  await db.query(`update service_bookings set status='in_progress' where id='${b.id}'`)
  await fails(`update service_bookings set status='completed' where id='${b.id}'`,/completion report/)
  await db.query(`select create_booking_report('${randomUUID()}','service','${b.id}','service','Original service completed','No extra parts',array[$1])`,[path])
  await db.query(`update service_bookings set status='completed' where id='${b.id}'`)
  await as('authenticated',customer)
  assert.equal((await db.query('select * from booking_reports')).rows.length,1)
  await as('authenticated',stranger)
  assert.equal((await db.query('select * from booking_reports')).rows.length,0)
})

isolated('damage proposals stay out of balance until response window and admin review, never attract daily penalty',async()=>{
  await as('authenticated',customer)
  const request=randomUUID()
  await db.query(`select accept_transaction_terms('${request}','vehicle','2026-10-20')`)
  const b=(await db.query(rentalSql(request))).rows[0]
  const path=await evidence('vehicle',b.id)
  await as('authenticated',admin)
  await db.query(`select create_booking_report('${randomUUID()}','vehicle','${b.id}','handover','Initial condition','',array[$1])`,[path])
  await db.query(`select create_booking_report('${randomUUID()}','vehicle','${b.id}','return','Returned condition','',array[$1])`,[path])
  const q=(await db.query(`select propose_booking_charge('vehicle','${b.id}','damage','[{"description":"Repair panel","amount":2000}]',array[$1],'Damage estimate') as id`,[path])).rows[0].id
  await fails(`select finalize_damage_charge('${q}',true,'Reviewed estimate')`,/response window/)
  assert.equal((await db.query('select * from account_charges')).rows.length,0)
  await as('authenticated',customer); await db.query(`select respond_booking_quote('${q}',false,'Damage existed at pickup')`)
  await as('authenticated',admin); await db.query(`select finalize_damage_charge('${q}',true,'Evidence reviewed')`)
  await as('postgres'); await db.query("update account_charges set posted_at=now()-interval '5 days'")
  await as('service_role'); await db.query(`select refresh_customer_account('${customer}')`)
  assert.equal((await db.query("select * from account_charges where kind='daily_penalty'")).rows.length,0)
})
