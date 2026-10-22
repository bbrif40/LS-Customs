import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createTestDatabase } from './test-database.ts'

const { db, customer, stranger, mechanic, admin, service, as, fails, isolated, rentalSql } = createTestDatabase(8)

async function verifiedServiceLocation() {
  await as('postgres')
  return (await db.query(`insert into service_location_checks(customer_id,area_id,lat,lng)
    select '${customer}',id,14.6,121.0 from service_areas where city='Manila' returning id`)).rows[0].id
}

async function bookedService(method = 'online') {
  const checked = await verifiedServiceLocation()
  await as('authenticated', customer)
  const request = randomUUID()
  await db.query(`select accept_transaction_terms('${request}','service','2026-10-21')`)
  return (await db.query(`select * from create_service_booking('${request}','${service}',
    (current_date+1+time '10:00') at time zone 'Asia/Manila',null,14.6,121.0,'Admin workflow test',null,null,'${method}','${checked}')`)).rows[0]
}

async function bookedRental(offset = 1) {
  await as('authenticated', customer)
  const request = randomUUID()
  await db.query(`select accept_transaction_terms('${request}','vehicle','2026-10-21')`)
  return (await db.query(rentalSql(request, offset))).rows[0]
}

isolated('only admins can skip service checkout and report requirements or reopen completed work', async () => {
  const booking = await bookedService()
  await fails(`update service_bookings set status='completed' where id='${booking.id}'`, /cannot be changed directly|Protected booking fields|row-level security/)
  await as('authenticated', stranger)
  assert.equal((await db.query(`select * from service_bookings where id='${booking.id}'`)).rows.length, 0)

  await as('authenticated', admin)
  await db.query(`update service_bookings set status='completed' where id='${booking.id}'`)
  await db.query(`update service_bookings set status='pending' where id='${booking.id}'`)
  const updated = (await db.query(`select status,checkout_state,mechanic_id from service_bookings where id='${booking.id}'`)).rows[0]
  assert.equal(updated.status, 'pending')
  assert.equal(updated.checkout_state, 'offering')
  assert.equal(updated.mechanic_id, null)
  assert.equal((await db.query('select * from booking_reports')).rows.length, 0)
  assert.equal((await db.query('select * from payments')).rows.length, 0)
})

isolated('admin completion of cash service preserves its unpaid balance without recording payment', async () => {
  const booking = await bookedService()
  await as('authenticated', admin)
  await db.query(`update service_bookings set payment_method='cash' where id='${booking.id}'`)
  await db.query(`update service_bookings set status='completed' where id='${booking.id}'`)

  const balance = (await db.query(`select kind,amount,paid,waived from account_charges where booking_id='${booking.id}'`)).rows[0]
  assert.equal(balance.kind, 'service_base')
  assert.equal(balance.amount, booking.total_price)
  assert.equal(balance.paid, '0.00')
  assert.equal(balance.waived, '0.00')
  assert.equal((await db.query(`select * from payments where booking_id='${booking.id}'`)).rows.length, 0)
})

isolated('admin rental progression skips handover and return prerequisites without changing payment or return accounting', async () => {
  const booking = await bookedRental()
  await fails(`update vehicle_bookings set status='in_progress' where id='${booking.id}'`, /cannot be changed directly|row-level security|permission denied/)

  await as('authenticated', admin)
  await db.query(`update vehicle_bookings set status='in_progress' where id='${booking.id}'`)
  await db.query(`update vehicle_bookings set status='completed' where id='${booking.id}'`)
  const updated = (await db.query(`select status,checkout_state,actual_return_at from vehicle_bookings where id='${booking.id}'`)).rows[0]
  assert.equal(updated.status, 'completed')
  assert.equal(updated.checkout_state, 'license_pending')
  assert.equal(updated.actual_return_at, null)
  assert.equal((await db.query('select * from booking_reports')).rows.length, 0)
  assert.equal((await db.query(`select * from payments where booking_id='${booking.id}'`)).rows.length, 0)
  assert.equal((await db.query(`select * from account_charges where booking_id='${booking.id}'`)).rows.length, 0)
})

isolated('admin mechanic assignment can reassign and reopen any status but preserves checkout and payment facts', async () => {
  const booking = await bookedService()
  await as('authenticated', admin)
  await db.query(`select admin_assign_mechanic('${booking.id}','${mechanic}')`)
  await as('postgres')
  await db.query(`update mechanic_profiles set is_available=false where id='${mechanic}'`)
  await db.query(`insert into payments(booking_type,booking_id,customer_id,amount,provider,status) values('service','${booking.id}','${customer}',${booking.total_price},'stripe','succeeded')`)
  await as('authenticated', admin)
  await db.query(`update service_bookings set status='completed' where id='${booking.id}'`)
  const status = (await db.query(`select admin_assign_mechanic('${booking.id}','${mechanic}') as status`)).rows[0].status
  const updated = (await db.query(`select status,checkout_state,mechanic_id from service_bookings where id='${booking.id}'`)).rows[0]
  assert.equal(status, 'assigned')
  assert.equal(updated.status, 'assigned')
  assert.equal(updated.checkout_state, 'confirmed')
  assert.equal(updated.mechanic_id, mechanic)
  assert.equal((await db.query(`select status from payments where booking_id='${booking.id}'`)).rows[0].status, 'succeeded')
  assert.ok((await db.query(`select * from admin_audit_logs where record_id='${booking.id}' and action_type='assign'`)).rows.length >= 2)
})

isolated('admin reoffer can reopen any service status and clears assignment while retaining payments', async () => {
  const booking = await bookedService()
  await as('authenticated', admin)
  await db.query(`select admin_assign_mechanic('${booking.id}','${mechanic}')`)
  const payment = randomUUID()
  await as('postgres')
  await db.query(`insert into payments(id,booking_type,booking_id,customer_id,amount,provider,status) values('${payment}','service','${booking.id}','${customer}',${booking.total_price},'stripe','succeeded')`)
  await as('authenticated', admin)
  await db.query(`update service_bookings set status='completed' where id='${booking.id}'`)
  await db.query(`select admin_reoffer_mechanics('${booking.id}')`)

  const updated = (await db.query(`select status,checkout_state,mechanic_id,offer_deadline from service_bookings where id='${booking.id}'`)).rows[0]
  assert.equal(updated.status, 'pending')
  assert.equal(updated.checkout_state, 'offering')
  assert.equal(updated.mechanic_id, null)
  assert.ok(updated.offer_deadline)
  assert.equal((await db.query(`select status from payments where id='${payment}'`)).rows[0].status, 'succeeded')
  assert.equal((await db.query(`select * from mechanic_capacity where booking_id='${booking.id}'`)).rows.length, 0)
  assert.equal((await db.query(`select * from admin_audit_logs where record_id='${booking.id}' and action_type='reoffer'`)).rows.length, 1)

  await as('postgres')
  const offered = (await db.query(`select id from mechanic_offers where booking_id='${booking.id}' and state='pending' limit 1`)).rows[0]
  assert.ok(offered)
  await as('authenticated', mechanic)
  await db.query(`select respond_mechanic_offer('${offered.id}',true)`)
  await as('postgres')
  const accepted = (await db.query(`select status,checkout_state,mechanic_id from service_bookings where id='${booking.id}'`)).rows[0]
  assert.equal(accepted.status, 'assigned')
  assert.equal(accepted.checkout_state, 'confirmed')
  assert.equal(accepted.mechanic_id, mechanic)
  assert.equal((await db.query(`select status from payments where id='${payment}'`)).rows[0].status, 'succeeded')
})

isolated('admin mechanic assignment keeps true capacity conflicts enforced', async () => {
  const checkA = await verifiedServiceLocation()
  const checkB = await verifiedServiceLocation()
  await as('authenticated', customer)
  const requestA = randomUUID()
  const requestB = randomUUID()
  const schedule = `(current_date+1+time '10:00') at time zone 'Asia/Manila'`
  await db.query(`select accept_transaction_terms('${requestA}','service','2026-10-21')`)
  const first = (await db.query(`select * from create_service_booking('${requestA}','${service}',${schedule},null,14.6,121.0,'Capacity test A',null,null,'cash','${checkA}')`)).rows[0]
  await db.query(`select accept_transaction_terms('${requestB}','service','2026-10-21')`)
  const second = (await db.query(`select * from create_service_booking('${requestB}','${service}',${schedule},null,14.6,121.0,'Capacity test B',null,null,'cash','${checkB}')`)).rows[0]

  await as('authenticated', admin)
  await db.query(`select admin_assign_mechanic('${first.id}','${mechanic}')`)
  await fails(`select admin_assign_mechanic('${second.id}','${mechanic}')`, /capacity|booking during this appointment/)
  await db.query(`update service_bookings set status='in_progress' where id='${second.id}'`)
  assert.equal((await db.query(`select status,mechanic_id from service_bookings where id='${second.id}'`)).rows[0].status, 'in_progress')
  assert.equal((await db.query(`select mechanic_id from service_bookings where id='${second.id}'`)).rows[0].mechanic_id, null)
})

async function rentalWithLicense(offset = 1) {
  const booking = await bookedRental(offset)
  const path = `${customer}/${randomUUID()}.jpg`
  await as('postgres')
  await db.query(`insert into storage.objects(bucket_id,name) values('driver-licenses','${path}')`)
  await as('authenticated', customer)
  const license = (await db.query(`select submit_rental_license('${booking.id}','${path}') as id`)).rows[0].id
  return { booking, license, path }
}

isolated('admin may approve sample license uploads with no expiry or an expired date, even after the review deadline', async () => {
  const noExpiry = await rentalWithLicense()
  await as('postgres')
  await db.query(`update vehicle_bookings set review_deadline=now()-interval '1 day' where id='${noExpiry.booking.id}'`)
  await as('authenticated', admin)
  await db.query(`select review_rental_license('${noExpiry.booking.id}','approved',null,'Approved sample upload')`)
  const approvedNoExpiry = (await db.query(`select state,expires_on from driver_licenses where id='${noExpiry.license}'`)).rows[0]
  assert.equal(approvedNoExpiry.state, 'approved')
  assert.equal(approvedNoExpiry.expires_on, null)

  const expiredDate = await rentalWithLicense(4)
  await as('authenticated', admin)
  await db.query(`select review_rental_license('${expiredDate.booking.id}','approved','2000-01-01','Approved demo license')`)
  const approvedExpired = (await db.query(`select state,expires_on from driver_licenses where id='${expiredDate.license}'`)).rows[0]
  assert.equal(approvedExpired.state, 'approved')
  assert.equal(approvedExpired.expires_on.toISOString().slice(0, 10), '2000-01-01')
  assert.equal((await db.query(`select status from payments where booking_id='${expiredDate.booking.id}'`)).rows.length, 0)
})

isolated('license review remains admin-only and a customer cannot replace another rental upload', async () => {
  const { booking, path } = await rentalWithLicense()
  await as('authenticated', customer)
  await fails(`select review_rental_license('${booking.id}','approved',null,'Customer approval')`, /Administrator access required/)
  await fails(`select submit_rental_license('${booking.id}','${stranger}/${randomUUID()}.jpg')`, /Invalid license upload/)
  assert.equal((await db.query(`select state from driver_licenses where object_path='${path}'`)).rows[0].state, 'pending')
})

isolated('license replacement and review preserve terminal paid rental state and payment ledger', async () => {
  const { booking, license } = await rentalWithLicense()
  await as('authenticated', admin)
  await db.query(`select review_rental_license('${booking.id}','approved','2099-12-31','Approved first upload')`)
  const payment = randomUUID()
  await as('postgres')
  await db.query(`insert into payments(id,booking_type,booking_id,customer_id,amount,provider,status) values('${payment}','vehicle','${booking.id}','${customer}',${booking.total_price},'stripe','succeeded')`)
  await as('authenticated', admin)
  await db.query(`update vehicle_bookings set status='completed' where id='${booking.id}'`)
  await as('authenticated', customer)
  const replacementPath = `${customer}/${randomUUID()}.jpg`
  await as('postgres')
  await db.query(`insert into storage.objects(bucket_id,name) values('driver-licenses','${replacementPath}')`)
  await as('authenticated', customer)
  const replacement = (await db.query(`select submit_rental_license('${booking.id}','${replacementPath}') as id`)).rows[0].id

  const linked = (await db.query(`select checkout_state,status,license_id,review_deadline from vehicle_bookings where id='${booking.id}'`)).rows[0]
  const newLicense = (await db.query(`select state,expires_on,reviewed_by,reviewed_at from driver_licenses where id='${replacement}'`)).rows[0]
  const oldLicense = (await db.query(`select superseded_at from driver_licenses where id='${license}'`)).rows[0]
  await as('postgres')
  const queue = (await db.query(`select closed_at,due_at,details from operations_queue where source_key='license:${booking.id}'`)).rows[0]
  assert.equal(linked.checkout_state, 'paid')
  assert.equal(linked.status, 'completed')
  assert.equal(linked.license_id, replacement)
  assert.ok(linked.review_deadline)
  assert.equal(newLicense.state, 'pending')
  assert.equal(newLicense.expires_on, null)
  assert.equal(newLicense.reviewed_by, null)
  assert.equal(newLicense.reviewed_at, null)
  assert.equal(oldLicense.superseded_at, null)
  assert.equal(queue.closed_at, null)
  assert.equal(queue.details.license_id, replacement)
  assert.equal((await db.query(`select status from payments where id='${payment}'`)).rows[0].status, 'succeeded')
  assert.equal((await db.query(`select * from payments where booking_id='${booking.id}'`)).rows.length, 1)
  assert.equal((await db.query(`select * from account_charges where booking_id='${booking.id}'`)).rows.length, 0)

  await as('postgres')
  await db.query(`update driver_licenses set identity_name='Sample Demo Name' where id='${replacement}'`)
  await as('authenticated', admin)
  await db.query(`select review_rental_license('${booking.id}','approved','2000-01-01','Demo upload approved regardless of dates')`)
  const reviewed = (await db.query(`select status,checkout_state,license_id from vehicle_bookings where id='${booking.id}'`)).rows[0]
  assert.equal(reviewed.status, 'completed')
  assert.equal(reviewed.checkout_state, 'paid')
  assert.equal(reviewed.license_id, replacement)
  assert.equal((await db.query(`select superseded_at from driver_licenses where id='${license}'`)).rows[0].superseded_at !== null, true)
  assert.equal((await db.query(`select exists(select 1 from admin_audit_logs
    where record_id='${booking.id}' and action_type='license_review'
      and (details->>'identity_override')::boolean and (details->>'expiry_override')::boolean) as logged_override`)).rows[0].logged_override, true)
  assert.equal((await db.query(`select status from payments where id='${payment}'`)).rows[0].status, 'succeeded')
  assert.equal((await db.query(`select count(*)::int as count from payments where booking_id='${booking.id}'`)).rows[0].count, 1)
})
