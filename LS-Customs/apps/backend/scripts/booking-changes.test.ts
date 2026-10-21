import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createTestDatabase } from './test-database.ts'
const { db, customer, stranger, mechanic, admin, vehicle, service, as, fails, isolated } = createTestDatabase(5)

async function checkedLocation(lat=14.6,lng=121) {
  await as('postgres')
  return (await db.query(`insert into service_location_checks(customer_id,area_id,lat,lng)
    select '${customer}',id,$1,$2 from service_areas where city='Manila' returning id`,[lat,lng])).rows[0].id
}
async function serviceBooking(method='cash') {
  const checked=await checkedLocation()
  await as('authenticated',customer)
  const request=randomUUID()
  await db.query(`select accept_transaction_terms('${request}','service','2026-10-20')`)
  const b=(await db.query(`select * from create_service_booking('${request}','${service}',(current_date+1+time '10:00') at time zone 'Asia/Manila',null,14.6,121.0,'Confirmed location',null,null,'${method}','${checked}')`)).rows[0]
  await as('authenticated',mechanic)
  const offer=(await db.query(`select id from mechanic_offers where booking_id='${b.id}'`)).rows[0]
  await db.query(`select respond_mechanic_offer('${offer.id}',true)`)
  if (method==='online') {
    await as('postgres')
    const payment=randomUUID()
    await db.query(`insert into payments(id,booking_type,booking_id,customer_id,amount,status) values('${payment}','service','${b.id}','${customer}',${b.total_price},'pending')`)
    await as('service_role'); await db.query(`select reconcile_payment('${payment}','succeeded')`)
  }
  return b
}
async function rental() {
  await as('authenticated',customer)
  const request=randomUUID()
  await db.query(`select accept_transaction_terms('${request}','vehicle','2026-10-20')`)
  const b=(await db.query(`select * from create_vehicle_booking('${request}','${vehicle}',current_date+1,current_date+3,null,'10:00','10:00','cash')`)).rows[0]
  const path=`${customer}/${randomUUID()}.jpg`
  await as('postgres'); await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['driver-licenses',path])
  await as('authenticated',customer); await db.query(`select submit_rental_license('${b.id}',$1)`,[path])
  await as('authenticated',admin)
  await db.query(`select review_rental_license('${b.id}','approved',current_date+365,'Valid matching license')`)
  await db.query(`select record_rental_cash('${b.id}','${randomUUID()}','Cash collected before handover')`)
  return b
}
isolated('coverage checks are owner and pin bound; customers cannot forge provider verification',async()=>{
  const checked=await checkedLocation()
  await as('authenticated',stranger)
  assert.equal((await db.query('select * from service_location_checks')).rows.length,0)
  await fails(`insert into service_location_checks(customer_id,area_id,lat,lng) select '${stranger}',id,14.6,121 from service_areas limit 1`,/permission denied/)
  await as('authenticated',customer)
  const request=randomUUID()
  await db.query(`select accept_transaction_terms('${request}','service','2026-10-20')`)
  await fails(`select * from create_service_booking('${request}','${service}',(current_date+1+time '10:00') at time zone 'Asia/Manila',null,20,121,'Wrong pin',null,null,'cash','${checked}')`,/supported service location/)
})
isolated('rental extension keeps original deadline until payment, at daily rate per started extra day',async()=>{
  const b=await rental()
  await as('authenticated',customer)
  const request=randomUUID()
  await db.query(`select accept_transaction_terms('${request}','vehicle','2026-10-20')`)
  const change=(await db.query(`select * from request_rental_extension('${request}','${b.id}',$1)`,[new Date(b.return_at.getTime()+6*3600000)])).rows[0]
  assert.equal(change.amount,'1000.00')
  await as('authenticated',admin); await db.query(`select approve_rental_extension('${change.id}',true,'Available and license verified')`)
  assert.equal((await db.query(`select return_at from vehicle_bookings where id='${b.id}'`)).rows[0].return_at.getTime(),b.return_at.getTime())
  const charge=(await db.query(`select * from account_charges where source_request='${change.id}'`)).rows[0]
  await db.query(`select adjust_account_charge('${charge.id}',1000,'cash','Extension payment collected','${randomUUID()}')`)
  assert.equal((await db.query(`select return_at from vehicle_bookings where id='${b.id}'`)).rows[0].return_at.getTime(),b.return_at.getTime()+6*3600000)
})
isolated('reschedule preserves original until fresh acceptance and customer confirmation',async()=>{
  const b=await serviceBooking()
  await as('authenticated',customer)
  const request=randomUUID()
  await db.query(`select accept_transaction_terms('${request}','service','2026-10-20')`)
  await db.query(`select request_mechanic_reschedule('${request}','${b.id}',(current_date+2+time '10:00') at time zone 'Asia/Manila')`)
  assert.equal((await db.query(`select scheduled_at from service_bookings where id='${b.id}'`)).rows[0].scheduled_at.getTime(),b.scheduled_at.getTime())
  await as('authenticated',mechanic)
  const offer=(await db.query(`select * from mechanic_change_offers where request_id='${request}'`)).rows[0]
  await db.query(`select respond_mechanic_change_offer('${offer.id}',true)`)
  await as('authenticated',customer)
  await db.query(`select accept_transaction_terms('${request}','payment','2026-10-20')`)
  await db.query(`select confirm_mechanic_reschedule('${request}')`)
  assert.notEqual((await db.query(`select scheduled_at from service_bookings where id='${b.id}'`)).rows[0].scheduled_at.getTime(),b.scheduled_at.getTime())
})
isolated('expired unpaid change never extends rental and late money enters full-refund processing',async()=>{
  const b=await rental(); await as('authenticated',customer)
  const request=randomUUID()
  await db.query(`select accept_transaction_terms('${request}','vehicle','2026-10-20')`)
  await db.query(`select request_rental_extension('${request}','${b.id}',$1)`,[new Date(b.return_at.getTime()+6*3600000)])
  await as('authenticated',admin); await db.query(`select approve_rental_extension('${request}',true,'Available extension')`)
  await as('authenticated',customer)
  const quote=(await db.query('select * from create_account_quote()')).rows[0]
  await as('postgres')
  await db.query(`update booking_requests set payload=payload||jsonb_build_object('payment_deadline',now()-interval '1 second') where id='${request}'`)
  const payment=randomUUID()
  await db.query(`insert into payments(id,booking_type,booking_id,customer_id,amount,status,account_quote_id) values('${payment}','vehicle','${b.id}','${customer}',1000,'pending','${quote.id}')`)
  await as('service_role'); await db.query(`select reconcile_payment('${payment}','succeeded')`)
  assert.equal((await db.query(`select return_at from vehicle_bookings where id='${b.id}'`)).rows[0].return_at.getTime(),b.return_at.getTime())
  assert.equal((await db.query(`select * from workflow_refunds where payment_id='${payment}'`)).rows.length,1)
})
isolated('linked support contains owner context and reopening is restricted to seven days',async()=>{
  const b=await serviceBooking(); await as('authenticated',customer)
  const ticket=(await db.query(`select create_booking_support('service','${b.id}','The same issue persists') as id`)).rows[0].id
  await as('authenticated',admin)
  assert.ok((await db.query(`select booking_context from support_tickets where id='${ticket}'`)).rows[0].booking_context.payments)
  await db.query(`update support_tickets set status='resolved' where id='${ticket}'`)
  await as('authenticated',customer); await db.query(`select reopen_customer_ticket('${ticket}')`)
  await as('postgres'); await db.query(`update support_tickets set status='resolved',resolved_at=now()-interval '8 days' where id='${ticket}'`)
  await db.query(`update support_tickets set resolved_at=now()-interval '8 days' where id='${ticket}'`)
  await as('authenticated',customer); await fails(`select reopen_customer_ticket('${ticket}')`,/Reopening window/)
  await as('authenticated',stranger); await fails(`select reopen_customer_ticket('${ticket}')`,/access denied/)
})
isolated('cash correction is append-only, reverses once and restores debt',async()=>{
  await as('postgres')
  const charge=(await db.query(`insert into account_charges(customer_id,booking_type,booking_id,kind,description,amount) values('${customer}','vehicle','${randomUUID()}','damage','Damage charge',100) returning id`)).rows[0].id
  await as('authenticated',admin); await db.query(`select adjust_account_charge('${charge}',100,'cash','Cash recorded','${randomUUID()}')`)
  const event=(await db.query('select id from account_events')).rows[0].id
  await db.query(`select reverse_account_collection('${event}','Incorrect cash entry','${randomUUID()}')`)
  await db.query(`select reverse_account_collection('${event}','Replay correction','${randomUUID()}')`)
  assert.equal((await db.query(`select paid from account_charges where id='${charge}'`)).rows[0].paid,'0.00')
  assert.equal((await db.query('select * from account_events')).rows.length,2)
})

isolated('custom pickup times allow an adjacent rental without a temporary infinite date range',async()=>{
  const b=await rental()
  await as('authenticated',customer)
  const request=randomUUID()
  await db.query(`select accept_transaction_terms('${request}','vehicle','2026-10-20')`)
  const next=(await db.query(`select * from create_vehicle_booking('${request}','${vehicle}',current_date+3,current_date+4,null,'11:00','11:00','online')`)).rows[0]
  assert.ok(next.pickup_at.getTime()>b.return_at.getTime())
})

isolated('license objects are private to owner and admins; public reads and forged owner paths fail',async()=>{
  const path=`${customer}/${randomUUID()}.jpg`
  await as('authenticated',customer)
  await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['driver-licenses',path])
  await fails(`insert into storage.objects(bucket_id,name) values('driver-licenses','${stranger}/fake.jpg')`,/row-level security/)
  await as('authenticated',stranger)
  assert.equal((await db.query("select * from storage.objects where bucket_id='driver-licenses'")).rows.length,0)
  await as('authenticated',admin)
  assert.equal((await db.query("select * from storage.objects where bucket_id='driver-licenses'")).rows.length,1)
  await as('anon'); await fails('select * from storage.objects',/permission denied/)
})

isolated('handover requires acknowledgement of the latest immutable report version',async()=>{
  const b=await rental()
  const path=`vehicle/${b.id}/${randomUUID()}.jpg`
  await as('postgres'); await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['booking-evidence',path])
  await as('authenticated',admin)
  const first=randomUUID()
  await db.query(`select create_booking_report('${first}','vehicle','${b.id}','handover','Original condition','',array[$1])`,[path])
  await as('authenticated',customer); await db.query(`select acknowledge_handover_report('${first}')`)
  await as('authenticated',admin)
  const latest=randomUUID()
  await db.query(`select create_booking_report('${latest}','vehicle','${b.id}','handover','Corrected condition','',array[$1])`,[path])
  await fails(`update vehicle_bookings set status='in_progress' where id='${b.id}'`,/latest handover report/)
  await as('authenticated',customer); await db.query(`select acknowledge_handover_report('${latest}')`)
  await as('authenticated',admin); await db.query(`update vehicle_bookings set status='in_progress' where id='${b.id}'`)
})

isolated('destination stays fixed until approved and customer accepts the new price',async()=>{
  const b=await serviceBooking()
  const check=await checkedLocation(14.61,121.01)
  await as('authenticated',customer)
  const request=randomUUID()
  await db.query(`select accept_transaction_terms('${request}','service','2026-10-20')`)
  await db.query(`select request_service_location_change('${request}','${b.id}','${check}')`)
  await as('authenticated',admin); await db.query(`select approve_service_location_change('${request}',true,'Supported location and capacity')`)
  assert.equal((await db.query(`select confirmed_lat from service_bookings where id='${b.id}'`)).rows[0].confirmed_lat,14.6)
  await as('authenticated',customer)
  await db.query(`select accept_transaction_terms('${request}','payment','2026-10-20')`)
  await db.query(`select confirm_service_location_change('${request}')`)
  assert.equal((await db.query(`select confirmed_lat from service_bookings where id='${b.id}'`)).rows[0].confirmed_lat,14.61)
})

isolated('prepaid reschedule price increase is collected before switching the appointment',async()=>{
  const b=await serviceBooking('online')
  await as('postgres'); await db.query(`update mechanic_services set base_price=1100 where id='${service}'`)
  await as('authenticated',customer)
  const request=randomUUID()
  await db.query(`select accept_transaction_terms('${request}','service','2026-10-20')`)
  await db.query(`select request_mechanic_reschedule('${request}','${b.id}',(current_date+2+time '10:00') at time zone 'Asia/Manila')`)
  await as('authenticated',mechanic)
  const offer=(await db.query(`select id from mechanic_change_offers where request_id='${request}'`)).rows[0]
  await db.query(`select respond_mechanic_change_offer('${offer.id}',true)`)
  await as('authenticated',customer); await db.query(`select accept_transaction_terms('${request}','payment','2026-10-20')`)
  await db.query(`select confirm_mechanic_reschedule('${request}')`)
  const charge=(await db.query(`select * from account_charges where source_request='${request}'`)).rows[0]
  assert.equal(charge.amount,'100.00')
  assert.equal((await db.query(`select scheduled_at from service_bookings where id='${b.id}'`)).rows[0].scheduled_at.getTime(),b.scheduled_at.getTime())
  await as('authenticated',admin); await db.query(`select adjust_account_charge('${charge.id}',100,'cash','Price increase collected','${randomUUID()}')`)
  assert.notEqual((await db.query(`select scheduled_at from service_bookings where id='${b.id}'`)).rows[0].scheduled_at.getTime(),b.scheduled_at.getTime())
})

isolated('customer may decline a provider time change for a full refund',async()=>{
  const b=await serviceBooking('online')
  await as('authenticated',admin)
  const request=randomUUID()
  await db.query(`select request_mechanic_reschedule('${request}','${b.id}',(current_date+2+time '10:00') at time zone 'Asia/Manila')`)
  await as('authenticated',customer); await db.query(`select decline_provider_reschedule('${request}')`)
  assert.equal((await db.query(`select status from service_bookings where id='${b.id}'`)).rows[0].status,'cancelled')
  const refund=(await db.query('select * from workflow_refunds')).rows[0]
  assert.equal(Number(refund.amount),Number(b.total_price))
})

isolated('selected charge and pay-all quotes cannot silently exchange allocations',async()=>{
  await as('postgres')
  const first=(await db.query(`insert into account_charges(customer_id,booking_type,booking_id,kind,description,amount) values('${customer}','vehicle','${randomUUID()}','damage','First charge',100) returning id`)).rows[0].id
  await db.query(`insert into account_charges(customer_id,booking_type,booking_id,kind,description,amount) values('${customer}','vehicle','${randomUUID()}','damage','Second charge',100)`)
  await as('authenticated',customer)
  const quote=(await db.query(`select * from create_account_quote(array['${first}'::uuid])`)).rows[0]
  await fails('select * from create_account_quote()',/cancel the current quote/)
  await db.query(`select cancel_account_quote('${quote.id}')`)
  assert.equal((await db.query('select * from create_account_quote()')).rows[0].amount,'200.00')
})

async function completeCashService() {
  const b=await serviceBooking()
  const photo=`service/${b.id}/${randomUUID()}.jpg`
  await as('postgres'); await db.query(`insert into storage.objects(bucket_id,name) values('booking-evidence',$1)`,[photo])
  await as('authenticated',mechanic)
  await db.query(`select create_booking_report('${randomUUID()}','service','${b.id}','service','Completed original work','No parts',array['${photo}'])`)
  await db.query(`update service_bookings set status='en_route' where id='${b.id}'`)
  await db.query(`update service_bookings set status='in_progress' where id='${b.id}'`)
  await db.query(`update service_bookings set status='completed' where id='${b.id}'`)
  return b
}
isolated('completed cash service is payable once through account or mechanic collection, with net audited revenue',async()=>{
  const b=await completeCashService()
  await db.query(`select record_service_cash('${b.id}','${randomUUID()}')`)
  await db.query(`select record_service_cash('${b.id}','${randomUUID()}')`)
  await as('authenticated',admin)
  const c=(await db.query(`select * from account_charges where booking_id='${b.id}' and kind='service_base'`)).rows[0]
  assert.equal(Number(c.paid),Number(b.total_price))
  assert.equal(Number((await db.query(`select sum(amount) as total from financial_collections where status='succeeded' and booking_id='${b.id}'`)).rows[0].total),Number(b.total_price))
  const event=(await db.query(`select id from account_events where charge_id='${c.id}'`)).rows[0]
  await db.query(`select reverse_account_collection('${event.id}','Cash entry was a mistake','${randomUUID()}')`)
  assert.equal(Number((await db.query(`select sum(amount) as total from financial_collections where status='succeeded' and booking_id='${b.id}'`)).rows[0].total),0)
})
isolated('customers cannot forge linked support context or online payment outcomes',async()=>{
  const b=await serviceBooking()
  await as('authenticated',customer)
  await fails(`insert into support_tickets(customer_id,subject,description,booking_type,booking_id,booking_context) values('${customer}','Issue','Description','service','${b.id}','{}')`,/verified booking context/)
  await as('authenticated',admin)
  await fails(`insert into payments(booking_type,booking_id,customer_id,amount,provider,status) values('service','${b.id}','${customer}',1000,'stripe','succeeded')`,/verified provider outcomes/)
})
isolated('cash refund recovery requires admin and receipt, then settles exactly once',async()=>{
  const b=await completeCashService()
  const payment=randomUUID()
  await db.query(`select record_service_cash('${b.id}','${payment}')`)
  await as('authenticated',admin)
  const refund=(await db.query(`select * from queue_admin_refund('${payment}','Provider exception full refund')`)).rows[0]
  await as('authenticated',customer)
  await fails(`select recover_workflow_refund('${refund.id}','cash_paid','Cash returned','receipt1')`,/Administrator/)
  await as('authenticated',admin)
  await fails(`select recover_workflow_refund('${refund.id}','cash_paid','Cash returned',null)`,/receipt/)
  await db.query(`select recover_workflow_refund('${refund.id}','cash_paid','Cash returned','receipt1')`)
  await db.query(`select recover_workflow_refund('${refund.id}','cash_paid','Cash returned','receipt1')`)
  assert.equal((await db.query(`select status from payments where id='${payment}'`)).rows[0].status,'refunded')
})

isolated('settling a completed cash service online prevents a second mechanic collection',async()=>{
  const b=await completeCashService()
  await as('authenticated',customer)
  const q=(await db.query('select * from create_account_quote()')).rows[0]
  await db.query(`select accept_transaction_terms('${q.id}','balance','2026-10-20')`)
  await as('service_role'); await db.query(`select settle_account_quote('${q.id}','${randomUUID()}')`)
  await as('authenticated',mechanic)
  await db.query(`select record_service_cash('${b.id}','${randomUUID()}')`)
  await as('postgres')
  assert.equal((await db.query(`select * from payments where booking_id='${b.id}' and provider='cash'`)).rows.length,0)
})
isolated('provider cancellation withdraws unpaid extension and releases its capacity',async()=>{
  const b=await rental()
  await as('authenticated',customer)
  const request=randomUUID(); await db.query(`select accept_transaction_terms('${request}','vehicle','2026-10-20')`)
  const change=(await db.query(`select * from request_rental_extension('${request}','${b.id}',$1)`,[new Date(b.return_at.getTime()+86400000)])).rows[0]
  await as('authenticated',admin)
  await db.query(`select approve_rental_extension('${change.id}',true,'Availability verified')`)
  await db.query(`select provider_cancel_booking('vehicle','${b.id}','Vehicle unavailable')`)
  assert.equal((await db.query(`select * from rental_change_capacity where booking_id='${b.id}'`)).rows.length,0)
  const charge=(await db.query(`select * from account_charges where source_request='${change.id}'`)).rows[0]
  assert.equal(charge.amount,charge.waived)
})
isolated('admin after-hours arrangement preserves duration and price while checking license and audit',async()=>{
  const b=await rental()
  const pickup=new Date(b.pickup_at.getTime()+10*3600000)
  await as('authenticated',customer)
  await fails(`select arrange_rental_pickup('${b.id}','${pickup.toISOString()}','Customer request')`,/Administrator/)
  await as('authenticated',admin)
  await db.query(`select arrange_rental_pickup('${b.id}','${pickup.toISOString()}','Agreed after-hours collection')`)
  const changed=(await db.query(`select * from vehicle_bookings where id='${b.id}'`)).rows[0]
  assert.equal(changed.return_at.getTime()-changed.pickup_at.getTime(),b.return_at.getTime()-b.pickup_at.getTime())
  assert.equal(changed.total_price,b.total_price)
})
