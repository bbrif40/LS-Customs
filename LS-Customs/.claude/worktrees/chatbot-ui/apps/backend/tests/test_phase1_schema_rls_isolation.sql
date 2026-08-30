-- =============================================================================
-- LS Customs — Phase 1 Acceptance Test Suite
-- =============================================================================
-- Verifies PHASES.md Phase 1 acceptance criteria:
--   [37] db reset applies all migrations cleanly from empty  — verified during db reset step
--   [38] pg_tables rowsecurity query returns zero rows      — verified during db reset step
--   [39] Anon: vehicles and mechanic_services return published rows only
--   [40] Customer Alice sees only her vehicle_bookings rows
--   [41] Overlapping confirmed booking on same vehicle is rejected
--   [42] Customer cannot set service_booking status to 'completed'
--
-- Run as postgres superuser. Switches role to test RLS policies.
--
-- Usage:
--   cat apps/backend/tests/test_phase1_schema_rls_isolation.sql \
--     | docker exec -i supabase_db_LS-Customs psql -U postgres -d postgres -h 127.0.0.1 -p 5432
-- =============================================================================

\set ON_ERROR_STOP on

-- -----------------------------------------------------------------------------
-- CLEANUP: Remove any leftover test data from prior runs
-- -----------------------------------------------------------------------------
TRUNCATE TABLE
  public.notifications,
  public.reviews,
  public.payments,
  public.service_booking_items,
  public.service_bookings,
  public.vehicle_bookings,
  public.mechanic_profiles,
  public.mechanic_services,
  public.vehicles,
  public.addresses,
  public.profiles,
  auth.users
CASCADE;

-- -----------------------------------------------------------------------------
-- SETUP: Insert test data (as superuser, bypasses RLS)
-- -----------------------------------------------------------------------------
-- The handle_new_user trigger (Phase 2 migration) auto-creates profiles rows
-- when auth.users rows are inserted. We pass raw_user_meta_data so the trigger
-- picks up full_name. All test users default to role='customer'.
insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, role, aud, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'alice@ls.test', 'hash', now(), now(), now(), 'authenticated', 'authenticated', '{"full_name":"Customer Alice"}'),
  ('22222222-2222-2222-2222-222222222222', 'bob@ls.test', 'hash', now(), now(), now(), 'authenticated', 'authenticated', '{"full_name":"Customer Bob"}');

insert into public.vehicles (id, category, sub_category, name, price_per_day, is_active) values
  ('aaaaaaaa-1111-1111-1111-111111111111', 'short_term', 'sedan', 'Toyota Camry', 1500.00, true),
  ('bbbbbbbb-2222-2222-2222-222222222222', 'premium', 'suv', 'BMW X5', 5000.00, true),
  ('cccccccc-3333-3333-3333-333333333333', 'short_term', 'sedan', 'Honda City (inactive)', 1200.00, false);

insert into public.mechanic_services (id, main_category, name, base_price) values
  ('dddddddd-4444-4444-4444-444444444444', 'routine_fluid_service', 'Oil Change', 500.00);

-- Alice's booking: Sep 1-5, confirmed (for overlap test)
insert into public.vehicle_bookings (vehicle_id, customer_id, start_date, end_date, status, total_price) values
  ('aaaaaaaa-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '2026-09-01', '2026-09-05', 'confirmed', 6000.00);

-- Bob's booking: different vehicle Sep 1-5, pending
insert into public.vehicle_bookings (vehicle_id, customer_id, start_date, end_date, status, total_price) values
  ('bbbbbbbb-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '2026-09-01', '2026-09-05', 'pending', 25000.00);

-- Service booking (for status transition test) — needs pin_lat/pin_lng
insert into public.service_bookings (customer_id, pin_lat, pin_lng, status, scheduled_at, total_price) values
  ('11111111-1111-1111-1111-111111111111', 14.5995, 121.0446, 'pending', '2026-09-10 10:00', 500.00);

\echo '';
\echo '=== SETUP COMPLETE: 2 customers, 3 vehicles, 1 service, 2 vehicle bookings, 1 service booking ===';

-- -----------------------------------------------------------------------------
-- TEST [39]: Anon — vehicles and mechanic_services are public, others blocked
-- -----------------------------------------------------------------------------
reset role;
set role anon;

\echo '';
\echo '=== TEST [39]: Anonymous (anon) catalog access ===';

\echo '--- Anon: vehicles (expect 2 active rows, inactive hidden) ---';
select name, is_active from public.vehicles order by name;

\echo '--- Anon: mechanic_services (expect 1 row) ---';
select name from public.mechanic_services;

\echo '--- Anon: profiles (expect 0 rows: blocked by RLS) ---';
select count(*) as profile_count from public.profiles;

\echo '--- Anon: vehicle_bookings (expect 0 rows: blocked by RLS) ---';
select count(*) as booking_count from public.vehicle_bookings;

-- -----------------------------------------------------------------------------
-- TEST [40]: Customer isolation — Alice sees only her vehicle_bookings
-- -----------------------------------------------------------------------------
reset role;
SET request.jwt.claim.sub TO '11111111-1111-1111-1111-111111111111';
SET ROLE authenticated;

\echo '';
\echo '=== TEST [40]: Customer Alice: vehicle_bookings (expect 1 row: Alice only) ===';
select id, customer_id, status from public.vehicle_bookings order by id;

-- -----------------------------------------------------------------------------
-- TEST [41]: Double-booking — overlapping confirmed booking should fail
-- -----------------------------------------------------------------------------
-- Disable ON_ERROR_STOP for expected-error blocks, then re-enable.
\set ON_ERROR_STOP off
reset role;
\echo '';
\echo '=== TEST [41]: Double-booking constraint ===';
\echo '--- Alice has confirmed Sep 1-5 on vehicle aaaaaaaa ---';
\echo '--- Attempt: Bob inserts Sep 3-7 on same vehicle (should FAIL) ---';
BEGIN;
insert into public.vehicle_bookings (vehicle_id, customer_id, start_date, end_date, status, total_price)
values ('aaaaaaaa-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '2026-09-03', '2026-09-07', 'confirmed', 4000.00);
ROLLBACK;
\echo '--- (Above ERROR = exclusion constraint correctly blocked the insert) ---';

\echo '--- Attempt: Bob on same vehicle, non-overlapping Sep 6-10 (should succeed) ---';
insert into public.vehicle_bookings (vehicle_id, customer_id, start_date, end_date, status, total_price)
values ('aaaaaaaa-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '2026-09-06', '2026-09-10', 'confirmed', 4000.00);
\set ON_ERROR_STOP on

-- -----------------------------------------------------------------------------
-- TEST [42]: Status transition — customer cannot mark service_booking completed
-- -----------------------------------------------------------------------------
\set ON_ERROR_STOP off
SET request.jwt.claim.sub TO '11111111-1111-1111-1111-111111111111';
SET ROLE authenticated;

\echo '';
\echo '=== TEST [42]: Status transition guard ===';
\echo '--- Alice (customer) tries to set her service_booking to completed (should FAIL) ---';
BEGIN;
update public.service_bookings set status = 'completed' where customer_id = '11111111-1111-1111-1111-111111111111';
ROLLBACK;
\echo '--- (Above ERROR or 0 rows = RLS policy correctly blocked the update) ---';
\set ON_ERROR_STOP on

\echo '';
\echo '=== ALL PHASE 1 ACCEPTANCE TESTS COMPLETE ===';
