-- =============================================================================
-- LS Customs — Phase 2 Acceptance Test Suite
-- =============================================================================
-- Verifies PHASES.md Phase 2 acceptance criteria:
--   [58] Creating a user via auth.users INSERT results in one profiles row (trigger)
--   [59] Deleting a user cascades correctly (profile removed)
--   [60] Inserting reviews updates target rating_avg/rating_count (2+ reviews)
--   [61] Updating service_bookings.status produces a notifications row for user_id
--   [62] is_admin() returns true only for admin, false for customer/mechanic
--
-- Run as postgres superuser.
--
-- Usage:
--   cat apps/backend/tests/test_phase2_auth_triggers_ratings.sql \
--     | docker exec -i supabase_db_LS-Customs psql -U postgres -d postgres -h 127.0.0.1 -p 5432
-- =============================================================================

\set ON_ERROR_STOP on

-- -----------------------------------------------------------------------------
-- CLEANUP: Truncate all test tables (from prior Phase 1 test runs)
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
-- SETUP: Seed users, profiles, catalogs, bookings
-- -----------------------------------------------------------------------------
-- Auth users — the handle_new_user trigger auto-creates profiles rows.
-- We pass raw_user_meta_data so the trigger picks up full_name.
-- Roles are then corrected via UPDATE (trigger always sets role='customer').
insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, role, aud, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'alice@ls.test',  'hash_a', now(), now(), now(), 'authenticated', 'authenticated', '{"full_name":"Customer Alice"}'),
  ('22222222-2222-2222-2222-222222222222', 'bob@ls.test',   'hash_b', now(), now(), now(), 'authenticated', 'authenticated', '{"full_name":"Customer Bob"}'),
  ('33333333-3333-3333-3333-333333333333', 'admin@ls.test', 'hash_ad', now(), now(), now(), 'authenticated', 'authenticated', '{"full_name":"Admin User"}'),
  ('44444444-4444-4444-4444-444444444444', 'mech@ls.test',  'hash_m', now(), now(), now(), 'authenticated', 'authenticated', '{"full_name":"Mechanic Max"}');

-- Correct roles for admin and mechanic (trigger defaults to 'customer')
update public.profiles set role = 'admin' where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set role = 'mechanic' where id = '44444444-4444-4444-4444-444444444444';

insert into public.mechanic_profiles (id, specialties, is_available, years_experience) values
  ('44444444-4444-4444-4444-444444444444', ARRAY['routine_fluid_service'], true, 5);

insert into public.vehicles (id, category, sub_category, name, price_per_day, is_active) values
  ('aaaaaaaa-1111-1111-1111-111111111111', 'short_term', 'sedan', 'Toyota Camry', 1500.00, true);

insert into public.mechanic_services (id, main_category, name, base_price) values
  ('dddddddd-4444-4444-4444-444444444444', 'routine_fluid_service', 'Oil Change', 500.00);

-- Bookings for testing (use known UUIDs)
insert into public.service_bookings (id, customer_id, pin_lat, pin_lng, status, scheduled_at, total_price) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 14.5995, 121.0446, 'pending', '2026-09-10 10:00', 500.00);

insert into public.vehicle_bookings (id, vehicle_id, customer_id, start_date, end_date, status, total_price) values
  ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '2026-09-15', '2026-09-20', 'pending', 7500.00);

\echo '';
\echo '=== SETUP COMPLETE ===';

-- -----------------------------------------------------------------------------
-- TEST [58]: handle_new_user trigger — signup auto-creates profiles row
-- -----------------------------------------------------------------------------
\echo '=== TEST [58]: handle_new_user trigger ===';

-- Create a new user via auth.users INSERT (simulates signup)
-- The AFTER INSERT trigger should auto-create a profiles row
insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, role, aud)
values ('55555555-5555-5555-5555-555555555555', 'newuser@ls.test', 'hash', now(), now(), now(), 'authenticated', 'authenticated');

-- Check that exactly one profile row was created
select count(*) AS profile_count from public.profiles where id = '55555555-5555-5555-5555-555555555555';

-- Verify the profile has default role
select id, full_name, role from public.profiles where id = '55555555-5555-5555-5555-555555555555';

-- -----------------------------------------------------------------------------
-- TEST [59]: Cascade on user deletion
-- -----------------------------------------------------------------------------
\echo '';
\echo '=== TEST [59]: Cascade on user deletion ===';

-- Delete the user created in Test 1
delete from auth.users where id = '55555555-5555-5555-5555-555555555555';

-- Profile should be cascade-deleted
select count(*) AS remaining_profile from public.profiles where id = '55555555-5555-5555-5555-555555555555';

-- -----------------------------------------------------------------------------
-- TEST [60]: Rating rollup — review inserts update target rating_avg / rating_count
-- -----------------------------------------------------------------------------
\echo '';
\echo '=== TEST [60]: Rating rollup on reviews ===';

-- Insert 2 reviews for the vehicle (target_vehicle_id set)
insert into public.reviews (booking_type, booking_id, customer_id, target_vehicle_id, rating, comment)
values
  ('vehicle', 'aaaaaaaa-0000-0000-0000-000000000002'::uuid, '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-1111-1111-1111-111111111111', 5, 'Great car!'),
  ('vehicle', 'aaaaaaaa-0000-0000-0000-000000000002'::uuid, '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-1111-1111-1111-111111111111', 3, 'Okay ride');

select name, rating_avg, rating_count from public.vehicles where id = 'aaaaaaaa-1111-1111-1111-111111111111';

-- Insert 2 reviews for the mechanic
insert into public.reviews (booking_type, booking_id, customer_id, target_mechanic_id, rating, comment)
values
  ('service', 'aaaaaaaa-0000-0000-0000-000000000001'::uuid, '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 5, 'Fast service'),
  ('service', 'aaaaaaaa-0000-0000-0000-000000000001'::uuid, '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', 4, 'Good work');

select p.full_name, mp.rating_avg, mp.rating_count
from public.mechanic_profiles mp join public.profiles p on p.id = mp.id
where mp.id = '44444444-4444-4444-4444-444444444444';

-- -----------------------------------------------------------------------------
-- TEST [61]: Notification on service_booking status change
-- -----------------------------------------------------------------------------
RESET ROLE;
SET request.jwt.claim.sub TO '33333333-3333-3333-3333-333333333333';
SET ROLE authenticated;

\echo '';
\echo '=== TEST [61]: Notification on service_booking status change ===';

-- Admin updates service booking: pending → assigned, assigns mechanic
update public.service_bookings
  set status = 'assigned', mechanic_id = '44444444-4444-4444-4444-444444444444'
  where id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- Reset to superuser so RLS doesn't filter the notification queries
reset role;
reset request.jwt.claim.sub;

-- Check notification for customer (expect 1 row)
select count(*) AS customer_notif
from public.notifications
where user_id = '11111111-1111-1111-1111-111111111111';

-- Check notification for mechanic (expect 1 row: booking assigned)
select count(*) AS mechanic_notif
from public.notifications
where user_id = '44444444-4444-4444-4444-444444444444';

-- Show notification details for verification
select user_id, type, title, body from public.notifications order by created_at;

-- -----------------------------------------------------------------------------
-- TEST [62]: is_admin() returns correct values
-- -----------------------------------------------------------------------------
RESET ROLE;
\echo '';
\echo '=== TEST [62]: is_admin() role check ===';

-- Admin session
SET request.jwt.claim.sub TO '33333333-3333-3333-3333-333333333333';
SET ROLE authenticated;
select public.is_admin() AS admin_should_be_true;

-- Customer session
RESET ROLE;
SET request.jwt.claim.sub TO '11111111-1111-1111-1111-111111111111';
SET ROLE authenticated;
select public.is_admin() AS admin_should_be_false;

-- Mechanic session
RESET ROLE;
SET request.jwt.claim.sub TO '44444444-4444-4444-4444-444444444444';
SET ROLE authenticated;
select public.is_admin() AS admin_should_be_false;

RESET ROLE;
\echo '';
\echo '=== ALL PHASE 2 ACCEPTANCE TESTS COMPLETE ===';
