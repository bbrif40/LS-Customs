import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createTestDatabase } from './test-database.ts'

const { db, customer, stranger, admin, as, fails, isolated } = createTestDatabase(10)

isolated('admin cash settlement applies only remaining quote allocations and supersedes overlapping pending attempts', async () => {
  const vehicleBooking = randomUUID()
  const serviceBooking = randomUUID()
  const firstCharge = (await db.query(`insert into account_charges(customer_id,booking_type,booking_id,kind,description,amount,paid)
    values('${customer}','vehicle','${vehicleBooking}','late_return','Late return',150,80) returning id`)).rows[0]
  const secondCharge = (await db.query(`insert into account_charges(customer_id,booking_type,booking_id,kind,description,amount,waived)
    values('${customer}','service','${serviceBooking}','service_extra','Approved extra work',130,30) returning id`)).rows[0]
  const quoteId = randomUUID()
  const overlapQuoteId = randomUUID()
  const quoteAmount = 200
  await db.exec(`insert into account_quotes(id,customer_id,allocations,amount,expires_at) values
    ('${quoteId}','${customer}',jsonb_build_array(jsonb_build_object('charge_id','${firstCharge.id}','amount',100),jsonb_build_object('charge_id','${secondCharge.id}','amount',100)),${quoteAmount},now()-interval '1 hour'),
    ('${overlapQuoteId}','${customer}',jsonb_build_array(jsonb_build_object('charge_id','${firstCharge.id}','amount',100),jsonb_build_object('charge_id','${secondCharge.id}','amount',100)),${quoteAmount},now()+interval '5 minutes')`)
  const payment = (await db.query(`insert into payments(booking_type,booking_id,customer_id,amount,currency,provider,provider_reference,status,account_quote_id)
    values('vehicle','${vehicleBooking}','${customer}',${quoteAmount},'PHP','paymongo','cs_admin_test','pending','${quoteId}') returning id`)).rows[0]
  const overlapPayment = (await db.query(`insert into payments(booking_type,booking_id,customer_id,amount,currency,provider,provider_reference,status,account_quote_id)
    values('vehicle','${vehicleBooking}','${customer}',${quoteAmount},'PHP','paymongo','cs_overlap_test','pending','${overlapQuoteId}') returning id`)).rows[0]
  await db.exec(`insert into payment_checkout_sessions(payment_id,client_secret,checkout_url) values
    ('${payment.id}','secret-one','https://paymongo.test/one'),('${overlapPayment.id}','secret-two','https://paymongo.test/two')`)

  await as('authenticated', customer)
  await fails(`select complete_admin_transaction('${payment.id}','${randomUUID()}','Collected at the counter',null,null)`, /Administrator access required/)

  const requestId = randomUUID()
  await as('authenticated', admin)
  const result = (await db.query(`select complete_admin_transaction('${payment.id}','${requestId}','Collected and receipt verified',null,null) as result`)).rows[0].result
  assert.equal(result.status, 'settled')
  assert.equal(result.mode, 'account_quote')
  assert.equal(result.amount, 170)
  assert.equal(result.request_id, requestId)
  const retry = (await db.query(`select complete_admin_transaction('${payment.id}','${requestId}','Collected and receipt verified',null,null) as result`)).rows[0].result
  assert.equal(retry.status, 'already_settled')
  assert.equal(retry.amount, 170)

  await as('postgres')
  const balances = (await db.query(`select id,amount,paid,waived from account_charges where id in ('${firstCharge.id}','${secondCharge.id}')`)).rows
  assert.equal(balances.find((row) => row.id === firstCharge.id)?.paid, '150.00')
  assert.equal(balances.find((row) => row.id === secondCharge.id)?.paid, '100.00')
  assert.equal(balances.find((row) => row.id === firstCharge.id)?.waived, '0.00')
  assert.equal(balances.find((row) => row.id === secondCharge.id)?.waived, '30.00')
  assert.equal((await db.query(`select sum(amount)::numeric(10,2) as amount,count(*)::int as count from admin_cash_settlements where source_payment_id='${payment.id}'`)).rows[0].amount, '170.00')
  assert.equal((await db.query(`select count(*)::int as count from admin_cash_settlements where source_payment_id='${payment.id}'`)).rows[0].count, 2)
  assert.equal((await db.query(`select count(*)::int as count from account_events where request_id='${requestId}' and kind='cash' and payment_id is null`)).rows[0].count, 2)
  assert.equal((await db.query(`select status from payments where id='${payment.id}'`)).rows[0].status, 'failed')
  assert.equal((await db.query(`select status from payments where id='${overlapPayment.id}'`)).rows[0].status, 'failed')
  assert.equal((await db.query(`select count(*)::int as count from payments where id in ('${payment.id}','${overlapPayment.id}')`)).rows[0].count, 2)
  assert.equal((await db.query(`select count(*)::int as count from payment_checkout_sessions where payment_id in ('${payment.id}','${overlapPayment.id}')`)).rows[0].count, 0)
  assert.equal((await db.query(`select count(*)::int as count from account_quotes where id in ('${quoteId}','${overlapQuoteId}') and expires_at<=now() and settled_at is null`)).rows[0].count, 2)
  assert.equal((await db.query(`select count(*)::int as count from admin_audit_logs where action_type='admin_cash_settlement' and record_id='${quoteId}'`)).rows[0].count, 1)
  const receiptRows = (await db.query(`select provider,source_payment_id,account_quote_id,settlement_request_id,allocation_count
    from financial_collections where provider='admin_cash_settlement' and source_payment_id='${payment.id}' order by booking_id`)).rows
  assert.equal(receiptRows.length, 2)
  assert.deepEqual(receiptRows.map((row) => row.allocation_count), [2, 2])
  assert.equal((await db.query(`select count(*)::int as count from financial_collections where provider='cash_ledger' and id in (select account_event_id from admin_cash_settlements where source_payment_id='${payment.id}')`)).rows[0].count, 0)

  // A real late webhook is still honored. The original quote remains unsettled
  // until the provider outcome arrives, so the existing allocator records the
  // actual provider collection for overpayment review without double-crediting.
  await as('service_role')
  await db.query(`select reconcile_payment('${overlapPayment.id}','succeeded')`)
  const settledBalances = (await db.query(`select id,paid from account_charges where id in ('${firstCharge.id}','${secondCharge.id}')`)).rows
  assert.equal(settledBalances.find((row) => row.id === firstCharge.id)?.paid, '150.00')
  assert.equal(settledBalances.find((row) => row.id === secondCharge.id)?.paid, '100.00')
  assert.equal((await db.query(`select status from payments where id='${overlapPayment.id}'`)).rows[0].status, 'succeeded')
  assert.ok((await db.query(`select settled_at from account_quotes where id='${overlapQuoteId}'`)).rows[0].settled_at)
  const overpayment = (await db.query(`select details from operations_queue where source_key='overpayment:${overlapPayment.id}'`)).rows[0]
  assert.equal(overpayment.details.unallocated_amount, 200)
  assert.equal((await db.query(`select count(*)::int as count from account_events where kind='online' and customer_id='${customer}'`)).rows[0].count, 0)
})

isolated('admin cash completion clears only the unpaid service base charge with an audited reason', async () => {
  const bookingId = randomUUID()
  await db.exec(`insert into service_bookings(id,customer_id,pin_lat,pin_lng,scheduled_at,total_price,payment_method)
    values('${bookingId}','${customer}',14.6,121.0,now()-interval '1 day',1200,'cash')`)
  await db.exec(`update service_bookings set status='completed' where id='${bookingId}'`)
  const charge = (await db.query(`select id from account_charges where booking_type='service' and booking_id='${bookingId}' and kind='service_base'`)).rows[0]
  assert.ok(charge)

  await as('authenticated', admin)
  const requestId = randomUUID()
  const result = (await db.query(`select complete_admin_transaction(null,'${requestId}','Customer handed cash to mechanic','service','${bookingId}') as result`)).rows[0].result
  assert.equal(result.mode, 'service_base')
  assert.equal(result.amount, 1200)

  await as('postgres')
  assert.equal((await db.query(`select paid from account_charges where id='${charge.id}'`)).rows[0].paid, '1200.00')
  const event = (await db.query(`select kind,reason,payment_id from account_events where charge_id='${charge.id}' and request_id='${requestId}'`)).rows[0]
  assert.equal(event.kind, 'cash')
  assert.match(event.reason, /Customer handed cash to mechanic/)
  assert.equal(event.payment_id, null)
  assert.equal((await db.query(`select count(*)::int as count from admin_audit_logs where action_type='admin_cash_settlement' and record_id='${bookingId}'`)).rows[0].count, 1)
  assert.equal((await db.query(`select count(*)::int as count from account_charges where booking_id='${bookingId}' and amount>paid+waived`)).rows[0].count, 0)
  const revenue = (await db.query(`select sum(amount)::numeric(10,2) as amount from financial_revenue where booking_type='service' and booking_id='${bookingId}' and status='recognized'`)).rows[0].amount
  assert.equal(revenue, '1200.00')
  assert.equal((await db.query(`select count(*)::int as count from financial_collections where provider='admin_cash_settlement' and settlement_request_id='${requestId}'`)).rows[0].count, 1)

  await as('authenticated', admin)
  const repeat = (await db.query(`select complete_admin_transaction(null,'${randomUUID()}','Retry after refresh','service','${bookingId}') as result`)).rows[0].result
  assert.equal(repeat.status, 'already_settled')
  assert.equal(repeat.amount, 0)
  await as('postgres')
  assert.equal((await db.query(`select count(*)::int as count from account_events where charge_id='${charge.id}' and kind='cash'`)).rows[0].count, 1)
})

isolated('admin cash settlement rejects mismatched quote allocations and unsupported direct payments', async () => {
  const bookingId = randomUUID()
  const foreignCharge = (await db.query(`insert into account_charges(customer_id,booking_type,booking_id,kind,description,amount)
    values('${stranger}','vehicle','${bookingId}','late_return','Foreign charge',100) returning id`)).rows[0]
  const quoteId = randomUUID()
  await db.query(`insert into account_quotes(id,customer_id,allocations,amount) values
    ('${quoteId}','${customer}',jsonb_build_array(jsonb_build_object('charge_id','${foreignCharge.id}','amount',100)),100)`)
  const quotePayment = (await db.query(`insert into payments(booking_type,booking_id,customer_id,amount,provider,status,account_quote_id)
    values('vehicle','${bookingId}','${customer}',100,'paymongo','pending','${quoteId}') returning id`)).rows[0]
  const directPayment = (await db.query(`insert into payments(booking_type,booking_id,customer_id,amount,provider,status)
    values('vehicle','${bookingId}','${customer}',100,'paymongo','pending') returning id`)).rows[0]

  await as('authenticated', admin)
  await fails(`select complete_admin_transaction('${quotePayment.id}','${randomUUID()}','Cash received',null,null)`, /allocation is unavailable/)
  await fails(`select complete_admin_transaction('${directPayment.id}','${randomUUID()}','Cash received',null,null)`, /pending account quote payment/)
  await fails(`select complete_admin_transaction(null,'${randomUUID()}','Cash received','vehicle','${bookingId}')`, /completed cash service booking/)
  await as('postgres')
  assert.equal((await db.query(`select paid from account_charges where id='${foreignCharge.id}'`)).rows[0].paid, '0.00')
})
