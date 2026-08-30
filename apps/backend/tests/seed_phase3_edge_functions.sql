-- =============================================================================
-- LS Customs — Phase 3 Edge Function Seed Data
-- =============================================================================
-- Not an acceptance test itself, but seed data used to manually verify
-- PHASES.md Phase 3 acceptance criteria:
--   [79]  supabase functions serve runs all functions without error
--   [80]  assign-mechanic with valid pending booking + available mechanic → assigned
--   [81]  assign-mechanic with no available mechanics → 409, status stays pending
--   [82]  create-payment-intent returns client secret, payments row created
--   [83]  Signed webhook payload flips payments.status → succeeded
--   [84]  Unsigned/invalid webhook → 401/400, no DB changes
--
-- Run as postgres superuser after Phase 3 migrations are applied, before
-- testing the Edge Functions listed above.
--
-- Usage:
--   cat apps/backend/tests/seed_phase3_edge_functions.sql \
--     | docker exec -i supabase_db_LS-Customs psql -U postgres -d postgres -h 127.0.0.1 -p 5432
-- =============================================================================

\set ON_ERROR_STOP on

-- Clean slate
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

-- Auth users (trigger auto-creates profiles)
insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, role, aud, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'alice@ls.test',  'hash_a', now(), now(), now(), 'authenticated', 'authenticated', '{"full_name":"Customer Alice"}'),
  ('22222222-2222-2222-2222-222222222222', 'bob@ls.test',   'hash_b', now(), now(), now(), 'authenticated', 'authenticated', '{"full_name":"Customer Bob"}'),
  ('33333333-3333-3333-3333-333333333333', 'admin@ls.test', 'hash_ad', now(), now(), now(), 'authenticated', 'authenticated', '{"full_name":"Admin User"}'),
  ('44444444-4444-4444-4444-444444444444', 'mech@ls.test',  'hash_m', now(), now(), now(), 'authenticated', 'authenticated', '{"full_name":"Mechanic Max"}'),
  ('55555555-5555-5555-5555-555555555555', 'mech2@ls.test', 'hash_m2', now(), now(), now(), 'authenticated', 'authenticated', '{"full_name":"Mechanic Sam"}');

-- Correct roles
update public.profiles set role = 'admin'   where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set role = 'mechanic' where id = '44444444-4444-4444-4444-444444444444';
update public.profiles set role = 'mechanic' where id = '55555555-5555-5555-5555-555555555555';

-- Mechanic profiles with locations (~Manila area)
insert into public.mechanic_profiles (id, specialties, is_available, current_lat, current_lng, years_experience, rating_avg, rating_count) values
  ('44444444-4444-4444-4444-444444444444', ARRAY['routine_fluid_service'], true,  14.5995, 121.0446, 5, 4.50, 2),
  ('55555555-5555-5555-5555-555555555555', ARRAY['diagnostic_repair'],     true,  14.6090, 121.0785, 3, 4.00, 1);

-- Vehicle catalog
insert into public.vehicles (id, category, sub_category, name, price_per_day, is_active) values
  ('aaaaaaaa-1111-1111-1111-111111111111', 'short_term', 'sedan', 'Toyota Camry', 1500.00, true);

-- Mechanic service catalog
insert into public.mechanic_services (id, main_category, name, base_price) values
  ('dddddddd-4444-4444-4444-444444444444', 'routine_fluid_service', 'Oil Change', 500.00);

-- Service booking: pending (for assign-mechanic test)
-- Location: Manila (14.5995, 121.0446)
insert into public.service_bookings (id, customer_id, pin_lat, pin_lng, status, scheduled_at, total_price) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 14.5995, 121.0446, 'pending', '2026-09-10 10:00', 500.00);

-- Vehicle booking: pending (for payment-intent test)
insert into public.vehicle_bookings (id, vehicle_id, customer_id, start_date, end_date, status, total_price) values
  ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '2026-09-15', '2026-09-20', 'pending', 7500.00);

\echo '';
\echo '=== PHASE 3 SEED COMPLETE ===';
\echo 'Users: Alice(customer), Bob(customer), Admin(admin), Max(mechanic), Sam(mechanic)';
\echo 'Bookings: 1 service(pending), 1 vehicle(pending)';
