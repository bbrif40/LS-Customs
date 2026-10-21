import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'


export function createTestDatabase(stage: number = 0) {
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
    '20261008141000_notification_delivery.sql', '20261008142000_address_coordinate_integrity.sql',
    '20261011120000_booking_tracking.sql',
    '20261011150000_virtual_journey_lifecycle.sql',
    '20261011170000_mechanic_details.sql',
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
  const apply = async (file: string) => {
    try { await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8')) }
    catch (error) { throw new Error(`Migration ${file}: ${error.message}`, { cause: error }) }
  }
  if (stage >= 1) await apply('20261020120000_transaction_accounts.sql')
  if (stage >= 2) {
    await db.exec(`create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema storage to anon,authenticated,service_role;
      grant select,insert,update,delete on storage.objects to authenticated,service_role;
      create function storage.foldername(p text) returns text[] language sql immutable as $$ select (string_to_array(p,'/'))[1:array_length(string_to_array(p,'/'),1)-1] $$;`)
    for (const file of ['20260924130000_admin_audit_logs.sql','20260924140000_fix_audit_trigger_booking_ref.sql',
      '20260924150000_fix_audit_trigger_nested_if.sql','20260924170000_fix_audit_trigger_remove_booking_reference.sql',
      '20261020130000_rental_license_checkout.sql','20261020131000_private_driver_license_storage.sql']) await apply(file)
  }
  if (stage >= 3) for (const file of ['20261020140000_mechanic_offers_and_cash.sql','20261021130000_admin_mechanic_assignment.sql']) await apply(file)
  if (stage >= 4) for (const file of ['20261020150000_booking_requests_refunds.sql','20261020160000_reports_quotes_and_damage.sql',
    '20261020161000_private_booking_evidence.sql']) await apply(file)
  if (stage >= 5) for (const file of ['20261020170000_service_coverage_and_gps.sql',
    '20260828120000_add_support_tickets.sql','20260830120000_ticket_enums_and_tracking.sql',
    '20260830120002_grant_authenticated_on_support_tickets.sql','20261020180000_booking_support.sql',
    '20261020190000_booking_changes.sql','20261020200000_location_change_and_corrections.sql',
    '20261020210000_operations_integrity.sql','20261020220000_cash_service_balances.sql','20261020230000_workflow_recovery.sql']) await apply(file)

  if (stage >= 5) await apply('20261021140000_assignment_contact_and_queue_claims.sql')
  if (stage >= 6) await apply('20261021100000_radius_service_coverage.sql')
  if (stage >= 7) await apply('20261021110000_customer_website_text.sql')
})

after(async () => { await db.close() })
return { db, customer, stranger, mechanic, admin, vehicle, service, as, fails, isolated, rentalSql, serviceSql }
}
