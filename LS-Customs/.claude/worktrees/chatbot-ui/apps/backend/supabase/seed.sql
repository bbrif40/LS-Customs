-- =============================================================================
-- LS Customs — Seed Data
-- =============================================================================
-- Minimal seed data for local development.
-- Runs with the postgres superuser (bypasses RLS) during `supabase db reset`.
-- In production, seed via the dashboard or API with a service_role key.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Vehicles (fleet catalog)
-- -----------------------------------------------------------------------------
-- Insert with deterministic UUIDs so tests can reference them reliably.

insert into public.vehicles (id, category, sub_category, name, description, seats, transmission, fuel_type, price_per_day, image_url, is_active, rating_avg, rating_count)
values
  ('aaaaaaaa-1111-1111-1111-111111111111', 'premium', 'Grand Tourer', 'Audi A4 Premium', 'Executive sedan with 5 seats', 5, 'Automatic', 'Gasoline', 4500, 'https://images.unsplash.com/photo-1606664515524', true, 4.9, 128),
  ('bbbbbbbb-2222-2222-2222-222222222222', 'premium', 'Luxury Sedan', 'Mercedes-Benz C-Class', 'Luxury grand tourer with 5 seats', 5, 'Automatic', 'Gasoline', 12000, 'https://images.unsplash.com/photo-1618843479313', true, 4.8, 89),
  ('cccccccc-3333-3333-3333-333333333333', 'short_term', 'Electric Performance', 'Pfister Neon', 'Premium electric performance with 2 seats', 2, 'Automatic', 'Electric', 410, 'https://images.unsplash.com/photo-1593941707882', true, 5.0, 42)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Mechanic services (catalog)
-- -----------------------------------------------------------------------------

insert into public.mechanic_services (id, main_category, name, description, base_price, estimated_duration_minutes, is_active)
values
  ('11111111-1111-1111-1111-111111111111', 'routine_fluid_service', 'Full Synthetic Oil Change', 'Complete oil change with premium synthetic blend', 89.99, 45, true),
  ('22222222-2222-2222-2222-222222222222', 'tire_wheel_care', 'Tire Rotation', 'Four-wheel tire rotation and pressure check', 35.00, 30, true),
  ('33333333-3333-3333-3333-333333333333', 'electrical_battery_care', 'Battery Diagnostics', 'Comprehensive battery health check', 45.00, 30, true)
on conflict (id) do nothing;
