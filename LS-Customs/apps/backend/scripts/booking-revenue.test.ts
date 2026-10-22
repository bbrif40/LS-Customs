import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createTestDatabase } from './test-database.ts'

const { db, customer, stranger, admin, vehicle, service, as, fails, isolated, rentalSql } = createTestDatabase(9)

async function bookedService(method = 'online') {
  await as('postgres')
  const checked = (await db.query(`insert into service_location_checks(customer_id,area_id,lat,lng)
    select '${customer}',id,14.6,121.0 from service_areas where city='Manila' returning id`)).rows[0].id
  await as('authenticated', customer)
  const request = randomUUID()
  await db.query(`select accept_transaction_terms('${request}','service','2026-10-21')`)
  return (await db.query(`select * from create_service_booking('${request}','${service}',
    (current_date+1+time '10:00') at time zone 'Asia/Manila',null,14.6,121.0,'Revenue test',null,null,'${method}','${checked}')`)).rows[0]
}

async function bookedRental() {
  await as('authenticated', customer)
  const request = randomUUID()
  await db.query(`select accept_transaction_terms('${request}','vehicle','2026-10-21')`)
  return (await db.query(rentalSql(request))).rows[0]
}

isolated('service and rental completion recognize booking price without changing payment or cash records', async () => {
  const serviceBooking = await bookedService('cash')
  const rentalBooking = await bookedRental()

  await as('authenticated', admin)
  await db.query(`update service_bookings set status='completed' where id='${serviceBooking.id}'`)
  await db.query(`update vehicle_bookings set payment_method='cash' where id='${rentalBooking.id}'`)
  await db.query(`update vehicle_bookings set status='in_progress' where id='${rentalBooking.id}'`)
  await db.query(`update vehicle_bookings set status='completed' where id='${rentalBooking.id}'`)

  const revenue = (await db.query(`select booking_type,booking_id,customer_id,amount,currency,source,status
    from financial_revenue where booking_id in ('${serviceBooking.id}','${rentalBooking.id}')`)).rows
  assert.equal(revenue.length, 2)
  assert.equal(revenue.find(row => row.booking_type === 'service').amount, serviceBooking.total_price)
  assert.equal(revenue.find(row => row.booking_type === 'vehicle').amount, rentalBooking.total_price)
  assert.ok(revenue.every(row => row.currency === 'PHP' && row.source === 'cash_completion' && row.status === 'recognized'))

  const cashBalance = (await db.query(`select amount,paid,waived from account_charges
    where booking_id='${serviceBooking.id}' and kind::text='service_base'`)).rows[0]
  assert.equal(cashBalance.amount, serviceBooking.total_price)
  assert.equal(cashBalance.paid, '0.00')
  assert.equal(cashBalance.waived, '0.00')
  assert.equal((await db.query('select count(*)::int as count from payments')).rows[0].count, 0)
  assert.equal((await db.query(`select count(*)::int as count from financial_collections
    where booking_id in ('${serviceBooking.id}','${rentalBooking.id}')`)).rows[0].count, 0)
})

isolated('recompletion is idempotent and raises recognition when the booking price increases', async () => {
  const booking = await bookedService('cash')
  await as('authenticated', admin)
  await db.query(`update service_bookings set status='completed' where id='${booking.id}'`)
  const first = (await db.query(`select * from booking_revenue_recognitions where booking_id='${booking.id}'`)).rows[0]

  await db.query(`update service_bookings set status='pending' where id='${booking.id}'`)
  await db.query(`update service_bookings set total_price=total_price+123.45,status='completed' where id='${booking.id}'`)
  await db.query(`update service_bookings set notes='replayed completion' where id='${booking.id}'`)
  const rows = (await db.query(`select * from booking_revenue_recognitions where booking_id='${booking.id}'`)).rows
  assert.equal(rows.length, 1)
  assert.equal(rows[0].amount, (Number(booking.total_price) + 123.45).toFixed(2))
  assert.equal(rows[0].recognized_at.toISOString(), first.recognized_at.toISOString())
  assert.equal((await db.query(`select count(*)::int as count from financial_revenue where booking_id='${booking.id}'`)).rows[0].count, 1)
  assert.equal((await db.query(`select count(*)::int as count from payments where booking_id='${booking.id}'`)).rows[0].count, 0)
})

isolated('completed service recognizes approved extras without changing their unpaid balance', async () => {
  const booking = await bookedService('cash')
  await as('postgres')
  await db.query(`insert into account_charges(customer_id,booking_type,booking_id,kind,description,amount,blocks_rentals,source_request)
    values('${customer}','service','${booking.id}','service_extra','Approved extra work',375,false,null)`)
  await as('authenticated', admin)
  await db.query(`update service_bookings set status='completed' where id='${booking.id}'`)

  const recognized = (await db.query(`select amount from financial_revenue where booking_id='${booking.id}'`)).rows[0]
  assert.equal(recognized.amount, (Number(booking.total_price) + 375).toFixed(2))
  const extra = (await db.query(`select id,amount,paid,waived from account_charges
    where booking_id='${booking.id}' and kind='service_extra'`)).rows[0]
  assert.equal(extra.amount, '375.00')
  assert.equal(extra.paid, '0.00')
  assert.equal(extra.waived, '0.00')
  assert.equal((await db.query(`select count(*)::int as count from payments where booking_id='${booking.id}'`)).rows[0].count, 0)

  await db.query(`select collect_service_extra_cash('${extra.id}','${randomUUID()}')`)
  assert.equal((await db.query(`select paid from account_charges where id='${extra.id}'`)).rows[0].paid, '375.00')
  assert.equal((await db.query(`select count(*)::int as count from financial_revenue where booking_id='${booking.id}'`)).rows[0].count, 1)
  assert.equal((await db.query(`select count(*)::int as count from financial_collections where booking_id='${booking.id}'`)).rows[0].count, 1)
})

isolated('later cash payment records remain separate and do not duplicate recognized base revenue', async () => {
  const booking = await bookedService('cash')
  await as('authenticated', admin)
  await db.query(`update service_bookings set status='completed' where id='${booking.id}'`)
  const request = randomUUID()
  await db.query(`select record_service_cash('${booking.id}','${request}')`)

  const revenue = (await db.query(`select amount,source,status from financial_revenue where booking_id='${booking.id}'`)).rows
  assert.equal(revenue.length, 1)
  assert.equal(revenue[0].amount, booking.total_price)
  assert.equal(revenue[0].source, 'cash_completion')
  assert.equal(revenue[0].status, 'recognized')
  assert.equal((await db.query(`select count(*)::int as count from financial_collections where booking_id='${booking.id}'`)).rows[0].count, 1)
  assert.equal((await db.query(`select count(*)::int as count from payments where id='${request}' and provider='cash'`)).rows[0].count, 1)
})

isolated('online completion waits for provider payment and does not create a cash recognition row', async () => {
  const booking = await bookedRental()
  await as('authenticated', admin)
  await db.query(`update vehicle_bookings set status='completed' where id='${booking.id}'`)
  assert.equal((await db.query(`select count(*)::int as count from booking_revenue_recognitions where booking_id='${booking.id}'`)).rows[0].count, 0)
  assert.equal((await db.query(`select count(*)::int as count from financial_revenue where booking_id='${booking.id}'`)).rows[0].count, 0)

  const payment = randomUUID()
  await as('postgres')
  await db.query(`insert into payments(id,booking_type,booking_id,customer_id,amount,provider,status)
    values('${payment}','vehicle','${booking.id}','${customer}',${booking.total_price},'stripe','succeeded')`)
  await as('authenticated', admin)
  const revenue = (await db.query(`select amount,source,status from financial_revenue where booking_id='${booking.id}'`)).rows
  assert.equal(revenue.length, 1)
  assert.equal(revenue[0].amount, booking.total_price)
  assert.equal(revenue[0].source, 'online_payment')
  assert.equal(revenue[0].status, 'succeeded')
})

isolated('online refunds stay visible as payment history but are netted from revenue metrics', async () => {
  const booking = await bookedRental()
  const payment = randomUUID()
  await as('postgres')
  await db.query(`insert into payments(id,booking_type,booking_id,customer_id,amount,provider,status)
    values('${payment}','vehicle','${booking.id}','${customer}',${booking.total_price},'stripe','succeeded')`)
  await as('authenticated', admin)
  await db.query(`update vehicle_bookings set status='completed' where id='${booking.id}'`)

  await as('postgres')
  await db.query(`update payments set refunded_amount=amount/2 where id='${payment}'`)
  await as('authenticated', admin)
  assert.equal((await db.query(`select amount,status from financial_revenue where booking_id='${booking.id}'`)).rows[0].amount,
    (Number(booking.total_price) / 2).toFixed(2))
  await as('postgres')
  await db.query(`update payments set status='refunded',refunded_amount=amount where id='${payment}'`)
  await as('authenticated', admin)
  const refunded = (await db.query(`select amount,status,source from financial_revenue where booking_id='${booking.id}'`)).rows[0]
  assert.equal(refunded.status, 'refunded')
  assert.equal(refunded.source, 'online_payment')
  assert.equal((await db.query(`select count(*)::int as count from booking_revenue_recognitions where booking_id='${booking.id}'`)).rows[0].count, 0)
  assert.equal((await db.query(`select count(*)::int as count from payments where booking_id='${booking.id}'`)).rows[0].count, 1)
})

isolated('account quote revenue follows per-charge allocations and nets partial refunds', async () => {
  const bookingId = randomUUID()
  await as('postgres')
  await db.query(`insert into account_charges(customer_id,booking_type,booking_id,kind,description,amount)
    values('${customer}','vehicle','${bookingId}','late_return','Late return fee',250)`)
  await as('authenticated', customer)
  const quote = (await db.query('select * from create_account_quote()')).rows[0]
  const payment = randomUUID()
  await as('service_role')
  await db.query(`insert into payments(id,booking_type,booking_id,customer_id,amount,provider,status,account_quote_id)
    values('${payment}','vehicle','${bookingId}','${customer}',${quote.amount},'stripe','succeeded','${quote.id}')`)
  await db.query(`select settle_account_quote('${quote.id}','${payment}')`)

  await as('authenticated', admin)
  const rows = (await db.query(`select id,payment_id,booking_id,amount,source,status from financial_revenue
    where booking_id='${bookingId}'`)).rows
  assert.equal(rows.length, 1)
  assert.equal(rows[0].payment_id, payment)
  assert.notEqual(rows[0].id, payment)
  assert.equal(rows[0].amount, '250.00')
  assert.equal(rows[0].source, 'account_charge_online')
  assert.equal(rows[0].status, 'succeeded')
  assert.equal((await db.query(`select count(*)::int as count from financial_collections where id='${payment}'`)).rows[0].count, 1)

  await as('postgres')
  await db.query(`update payments set refunded_amount=amount/2 where id='${payment}'`)
  await as('authenticated', admin)
  assert.equal((await db.query(`select amount from financial_revenue where booking_id='${bookingId}'`)).rows[0].amount, '125.00')
})

isolated('recognition rows are private to the owner and admins and read-only to authenticated users', async () => {
  const booking = await bookedService('cash')
  await as('authenticated', admin)
  await db.query(`update service_bookings set status='completed' where id='${booking.id}'`)

  await as('authenticated', customer)
  assert.equal((await db.query(`select count(*)::int as count from financial_revenue where booking_id='${booking.id}'`)).rows[0].count, 1)
  await fails(`insert into booking_revenue_recognitions(booking_type,booking_id,customer_id,amount,recognized_at)
    values('service','${booking.id}','${customer}',1,now())`, /permission denied/)
  await fails(`update booking_revenue_recognitions set amount=0 where booking_id='${booking.id}'`, /permission denied/)
  await fails(`delete from booking_revenue_recognitions where booking_id='${booking.id}'`, /permission denied/)

  await as('authenticated', stranger)
  assert.equal((await db.query(`select count(*)::int as count from financial_revenue where booking_id='${booking.id}'`)).rows[0].count, 0)
  await as('authenticated', admin)
  assert.equal((await db.query(`select count(*)::int as count from financial_revenue where booking_id='${booking.id}'`)).rows[0].count, 1)
  await as('anon')
  await fails('select * from financial_revenue', /permission denied/)
})
