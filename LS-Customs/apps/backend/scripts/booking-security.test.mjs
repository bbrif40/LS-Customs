import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

// Real PostgreSQL engine; Supabase auth/Vault/network services are fixtures.
const db = new PGlite({ extensions: { btree_gist, pgcrypto } })
const customer = '10000000-0000-0000-0000-000000000001'
const stranger = '10000000-0000-0000-0000-000000000002'
const mechanic = '10000000-0000-0000-0000-000000000003'
const admin = '10000000-0000-0000-0000-000000000004'
const vehicle = '20000000-0000-0000-0000-000000000001'
const service = '20000000-0000-0000-0000-000000000002'
async function as(role, id = '') {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${id}',false); set role ${role}`)
}
async function fails(sql, pattern) {
  await db.exec('savepoint expected_failure')
  try { await assert.rejects(db.query(sql), pattern) }
  finally { await db.exec('rollback to savepoint expected_failure; release savepoint expected_failure') }
}
function isolated(name, work) {
  test(name, async () => { await db.exec('begin'); try { await work() } finally { await db.exec('rollback') } })
}
const rentalSql = (request = randomUUID(), offset = 1, promo = 'null') =>
  `select * from create_vehicle_booking('${request}','${vehicle}',current_date+${offset},current_date+${offset + 2},${promo})`
const serviceSql = (request = randomUUID(), emergency = 'null') =>
  `select * from create_service_booking('${request}','${service}',now()+interval '2 days',null,14.6,121.0,'Confirmed location',null,${emergency})`

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema extensions; create schema vault; create schema net;
    create table auth.users(id uuid primary key,email text,phone text,encrypted_password text,updated_at timestamptz,raw_user_meta_data jsonb default '{}');
    create table auth.sessions(user_id uuid);
    create table auth.refresh_tokens(user_id text);
    create extension pgcrypto with schema extensions;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;
    create table vault.decrypted_secrets(name text,decrypted_secret text);
    create function net.http_post(url text,headers jsonb,body jsonb) returns bigint language sql as $$ select 1::bigint $$;
  `)
  for (const file of [
    '20260819120516_init_enums.sql','20260819120520_init_schema.sql',
    '20260819120524_rls_policies.sql','20260819120527_triggers.sql',
    '20260819120535_grants.sql','20260819120540_phase2_triggers.sql',
    '20260901120000_service_bookings_live_location.sql',
    '20260902180000_profiles_read_for_assigned_mechanic.sql',
    '20260902190000_mechanic_profiles_read_for_assigned_customer.sql',
    '20260902200000_available_vehicles_rpc.sql','20260909170000_add_emergency_flag.sql',
    '20260921130000_get_dispatch_mechanics.sql','20261006120000_qa_booking_security.sql',
  ]) {
    try { await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8')) }
    catch (error) { throw new Error(`Migration ${file}: ${error.message}`, { cause: error }) }
  }
  await db.exec(`
    insert into auth.users(id,email) values('${customer}','qa@example.test'),('${stranger}','other@example.test'),('${mechanic}','mechanic@example.test'),('${admin}','admin@example.test');
    update profiles set role='mechanic' where id='${mechanic}'; update profiles set role='admin' where id='${admin}';
    insert into mechanic_profiles(id,is_available,current_lat,current_lng) values('${mechanic}',true,14.6,121.0);
    insert into vehicles(id,category,sub_category,name,price_per_day) values('${vehicle}','short_term','sedan','QA car',1000);
    insert into mechanic_services(id,main_category,name,base_price,estimated_duration_minutes) values('${service}','quick_fixes','QA service',1000,60);
  `)
})
after(async () => { await db.close() })

isolated('customer cannot promote their profile; admin can change roles', async () => {
  await as('authenticated', customer)
  await fails(`update profiles set role='admin' where id='${customer}'`, /administrator/)
  await as('authenticated', admin)
  await db.exec(`update profiles set role='mechanic' where id='${customer}'`)
})
isolated('rental uses catalog price, server discount and idempotent request', async () => {
  await as('authenticated', customer)
  const id = randomUUID()
  const first = (await db.query(rentalSql(id, 1, "'ESCAPE20'"))).rows[0]
  const second = (await db.query(rentalSql(id, 1, "'ESCAPE20'"))).rows[0]
  assert.equal(Number(first.total_price), 1600); assert.equal(second.id, first.id)
  await fails(`update vehicle_bookings set total_price=1,status='cancelled' where id='${first.id}'`, /Protected booking fields/)
  await fails(`insert into vehicle_bookings(vehicle_id,customer_id,start_date,end_date,total_price) values('${vehicle}','${customer}',current_date+10,current_date+12,1)`, /booking transaction|row-level security/)
})
isolated('half-open rental dates allow adjacent trips and reject overlaps', async () => {
  await as('authenticated', customer)
  await db.query(rentalSql(undefined, 1)); await db.query(rentalSql(undefined, 3))
  await fails(rentalSql(undefined, 2), /no_overlapping_bookings|conflicting key/)
})
isolated('expired unpaid hold is reclaimed before a replacement booking', async () => {
  await as('authenticated', customer)
  const first = (await db.query(rentalSql())).rows[0]
  await as('postgres')
  await db.exec(`update vehicle_bookings set hold_expires_at=now()-interval '1 minute' where id='${first.id}'`)
  await as('authenticated', stranger)
  const replacement = (await db.query(rentalSql())).rows[0]
  assert.notEqual(replacement.id, first.id)
})
isolated('service creation persists catalog item and server travel quote atomically', async () => {
  await as('authenticated', customer)
  const booking = (await db.query(serviceSql())).rows[0]
  assert.equal(Number(booking.total_price), 1085)
  assert.equal((await db.query(`select * from service_booking_items where service_booking_id='${booking.id}'`)).rows.length, 1)
  await fails(serviceSql(undefined, "'unsupported'"), /supported emergency/)
  await as('authenticated', stranger)
  assert.equal((await db.query(`select * from service_bookings where id='${booking.id}'`)).rows.length, 0)
  await fails(`select cancel_customer_booking('service','${booking.id}')`, /Booking not found/)
})
isolated('customer cannot alter active booking money, mechanic or live timestamp', async () => {
  await as('authenticated', customer)
  const booking = (await db.query(serviceSql(undefined, "'battery'"))).rows[0]
  await as('service_role')
  await db.query(`select assign_booking_mechanic('${booking.id}')`)
  await as('authenticated', customer)
  await fails(`update service_bookings set total_price=1,current_lat=14.7,current_lng=121.1 where id='${booking.id}'`, /Protected booking fields/)
  await db.exec(`update service_bookings set current_lat=14.7,current_lng=121.1,location_updated_at='2099-01-01' where id='${booking.id}'`)
  const row = (await db.query(`select * from service_bookings where id='${booking.id}'`)).rows[0]
  assert.ok(new Date(row.location_updated_at).getFullYear() < 2099)
})
isolated('service dispatch requires confirmed payment and respects mechanic capacity', async () => {
  await as('authenticated', customer)
  const unpaid = (await db.query(serviceSql())).rows[0]
  await as('service_role')
  await fails(`select assign_booking_mechanic('${unpaid.id}')`, /Payment must be confirmed/)
  await as('authenticated', customer)
  const first = (await db.query(serviceSql(undefined, "'battery'"))).rows[0]
  const second = (await db.query(serviceSql(undefined, "'tire'"))).rows[0]
  await as('service_role')
  await db.query(`select assign_booking_mechanic('${first.id}')`)
  await fails(`select assign_booking_mechanic('${second.id}')`, /No mechanic/)
})
isolated('cancellation is persisted, ownership scoped, and paid bookings require support', async () => {
  await as('authenticated', customer)
  const booking = (await db.query(rentalSql())).rows[0]
  await db.query(`select cancel_customer_booking('vehicle','${booking.id}')`)
  assert.equal((await db.query(`select status from vehicle_bookings where id='${booking.id}'`)).rows[0].status, 'cancelled')
  const paid = (await db.query(rentalSql(undefined, 5))).rows[0]
  await as('service_role')
  await db.exec(`insert into payments(booking_type,booking_id,customer_id,amount,currency,status) values('vehicle','${paid.id}','${customer}',2000,'PHP','succeeded')`)
  await as('authenticated', customer)
  await fails(`select cancel_customer_booking('vehicle','${paid.id}')`, /paid/)
})
isolated('payment replay reconciles booking and rejects stale failure after success', async () => {
  await as('authenticated', customer)
  const booking = (await db.query(rentalSql())).rows[0]
  await as('service_role')
  const payment = (await db.query(`insert into payments(booking_type,booking_id,customer_id,amount,currency,status) values('vehicle','${booking.id}','${customer}',2000,'PHP','pending') returning id`)).rows[0]
  await db.query(`select reconcile_payment('${payment.id}','succeeded')`)
  await db.query(`select reconcile_payment('${payment.id}','succeeded')`)
  await db.query(`select reconcile_payment('${payment.id}','failed')`)
  assert.equal((await db.query(`select status from vehicle_bookings where id='${booking.id}'`)).rows[0].status, 'confirmed')
  assert.equal((await db.query(`select status from payments where id='${payment.id}'`)).rows[0].status, 'succeeded')
})
isolated('anonymous discovery cannot obtain exact mechanic coordinates or private checkout data', async () => {
  await as('anon')
  await fails('select * from get_dispatch_mechanics()', /permission denied/)
  await fails('select * from payment_checkout_sessions', /permission denied/)
  const quote = (await db.query('select * from get_dispatch_quote(14.6,121.0)')).rows[0]
  assert.deepEqual(Object.keys(quote).sort(), ['distance_km', 'travel_fee'])
  assert.equal((await db.query('select * from get_public_mechanics()')).rows.length, 1)
  await fails(rentalSql(), /permission denied/)
})
isolated('promotion writes require admin and exact GPS is limited to active assigned customers', async () => {
  await as('authenticated', customer)
  await fails("insert into booking_promotions(code,category,amount_off) values('FORGED','all',999)", /row-level security/)
  assert.equal((await db.query('select * from mechanic_profiles')).rows.length, 0)
  const booking = (await db.query(serviceSql(undefined, "'battery'"))).rows[0]
  await as('service_role'); await db.query(`select assign_booking_mechanic('${booking.id}')`)
  await as('authenticated', customer)
  assert.equal((await db.query('select * from mechanic_profiles')).rows.length, 1)
  await db.query(`select cancel_customer_booking('service','${booking.id}')`)
  assert.equal((await db.query('select * from mechanic_profiles')).rows.length, 0)
  await as('authenticated', admin)
  await db.exec("insert into booking_promotions(code,category,amount_off) values('QAADMIN','all',10)")
})

isolated('checkout leases serialize requests and only their token can release them', async () => {
  await as('service_role')
  const first = randomUUID(), second = randomUUID()
  const acquire = token => `select acquire_checkout_lock('vehicle','${vehicle}','${token}') as acquired`
  assert.equal((await db.query(acquire(first))).rows[0].acquired, true)
  assert.equal((await db.query(acquire(second))).rows[0].acquired, false)
  await db.query(`select release_checkout_lock('vehicle','${vehicle}','${second}')`)
  assert.equal((await db.query(acquire(second))).rows[0].acquired, false)
  await db.query(`select release_checkout_lock('vehicle','${vehicle}','${first}')`)
  assert.equal((await db.query(acquire(second))).rows[0].acquired, true)
  await as('authenticated', customer)
  await fails(acquire(first), /permission denied/)
  await fails('select * from payment_checkout_locks', /permission denied/)
  await fails('select * from payment_receipt_deliveries', /permission denied/)
})
isolated('admins retain booking/item insert access and receipts cannot be requested repeatedly', async () => {
  await as('authenticated', admin)
  const booking = (await db.query(`insert into vehicle_bookings(vehicle_id,customer_id,start_date,end_date,total_price) values('${vehicle}','${customer}',current_date+1,current_date+3,2000) returning id`)).rows[0]
  const serviceBooking = (await db.query(`insert into service_bookings(customer_id,pin_lat,pin_lng,scheduled_at,total_price) values('${customer}',14.6,121.0,now()+interval '2 days',1085) returning id`)).rows[0]
  await db.exec(`insert into service_booking_items(service_booking_id,mechanic_service_id,quantity,price_at_booking) values('${serviceBooking.id}','${service}',1,1000)`)
  await as('service_role')
  const payment = (await db.query(`insert into payments(booking_type,booking_id,customer_id,amount,currency,status) values('vehicle','${booking.id}','${customer}',2000,'PHP','succeeded') returning id`)).rows[0]
  assert.equal((await db.query(`select reserve_receipt_delivery('${payment.id}') as allowed`)).rows[0].allowed, true)
  assert.equal((await db.query(`select reserve_receipt_delivery('${payment.id}') as allowed`)).rows[0].allowed, false)
  await as('authenticated', customer)
  await fails(`select reserve_receipt_delivery('${payment.id}')`, /permission denied/)
})
isolated('full-value discounts fail before leaving an unpayable reservation', async () => {
  await as('postgres')
  await db.exec("insert into booking_promotions(code,category,percent_off) values('QA100','all',100)")
  await as('authenticated', customer)
  await fails(rentalSql(undefined, 1, "'QA100'"), /complimentary booking/)
  assert.equal((await db.query('select * from vehicle_bookings')).rows.length, 0)
})
isolated('manual admin assignment cannot bypass mechanic capacity', async () => {
  await as('authenticated', customer)
  const first = (await db.query(serviceSql(undefined, "'battery'"))).rows[0]
  const second = (await db.query(serviceSql(undefined, "'tire'"))).rows[0]
  await as('service_role'); await db.query(`select assign_booking_mechanic('${first.id}')`)
  await as('authenticated', admin)
  await fails(`update service_bookings set mechanic_id='${mechanic}',status='assigned' where id='${second.id}'`, /already has a booking/)
})
isolated('late payment does not resurrect cancellation and notifies admin exactly once', async () => {
  await as('authenticated', customer)
  const booking = (await db.query(serviceSql())).rows[0]
  await db.query(`select cancel_customer_booking('service','${booking.id}')`)
  await as('service_role')
  const payment = (await db.query(`insert into payments(booking_type,booking_id,customer_id,amount,currency,status) values('service','${booking.id}','${customer}',1085,'PHP','pending') returning id`)).rows[0]
  const result = (await db.query(`select reconcile_payment('${payment.id}','succeeded') as result`)).rows[0].result
  assert.equal(result.requires_refund, true)
  await db.query(`select reconcile_payment('${payment.id}','succeeded')`)
  assert.equal((await db.query(`select status from service_bookings where id='${booking.id}'`)).rows[0].status, 'cancelled')
  assert.equal((await db.query("select * from notifications where type='payment_attention'")).rows.length, 1)
})
isolated('published seeded-admin password is disabled while a rotated password is preserved', async () => {
  await as('postgres')
  const seed = await readFile('supabase/migrations/20260909160000_seed_admin_account.sql', 'utf8')
  const email = seed.match(/email_admin\s+(?:constant\s+)?text\s*:=\s*'([^']+)'/)[1]
  const compromisedPassword = seed.match(/crypt\(\s*'([^']+)'/)[1]
  const exposed = randomUUID(), rotated = randomUUID()
  await db.query("insert into auth.users(id,email,encrypted_password) values($1,$2,extensions.crypt($3,extensions.gen_salt('bf'))),($4,$2,extensions.crypt($5,extensions.gen_salt('bf')))", [exposed,email,compromisedPassword,rotated,randomUUID()])
  await db.query("update profiles set role='admin' where id in ($1,$2)", [exposed,rotated])
  await db.query('insert into auth.sessions(user_id) values($1),($2)', [exposed,rotated])
  await db.query('insert into auth.refresh_tokens(user_id) values($1),($2)', [exposed,rotated])
  await db.exec(await readFile('supabase/migrations/20261006120100_disable_seeded_admin_passwords.sql','utf8'))
  const disabled = (await db.query('select encrypted_password from auth.users where id=$1', [exposed])).rows[0]
  const kept = (await db.query('select encrypted_password from auth.users where id=$1', [rotated])).rows[0]
  assert.equal(disabled.encrypted_password, '')
  assert.equal((await db.query('select role from profiles where id=$1', [exposed])).rows[0].role, 'customer')
  assert.equal((await db.query('select role from profiles where id=$1', [rotated])).rows[0].role, 'admin')
  assert.ok(kept.encrypted_password.length > 20)
  assert.equal((await db.query('select * from auth.sessions where user_id=$1', [exposed])).rows.length, 0)
  assert.equal((await db.query('select * from auth.refresh_tokens where user_id=$1', [exposed])).rows.length, 0)
  assert.equal((await db.query('select * from auth.sessions where user_id=$1', [rotated])).rows.length, 1)
})
isolated('promotion reads hide disabled/expired offers from public customers but retain admin management access', async () => {
  await as('postgres')
  await db.exec("insert into booking_promotions(code,category,amount_off,is_active,expires_at) values('QAINACTIVE','all',1,false,null),('QAEXPIRED','all',1,true,now()-interval '1 day')")
  for (const [role, id] of [['anon',''], ['authenticated',customer]]) {
    await as(role,id)
    assert.equal((await db.query("select * from booking_promotions where code in ('QAINACTIVE','QAEXPIRED')")).rows.length, 0)
    assert.equal((await db.query("select * from booking_promotions where code='ESCAPE20'")).rows.length, 1)
  }
  await as('authenticated',admin)
  assert.equal((await db.query("select * from booking_promotions where code in ('QAINACTIVE','QAEXPIRED')")).rows.length, 2)
})
