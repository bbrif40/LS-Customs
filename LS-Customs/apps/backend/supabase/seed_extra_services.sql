-- Seed the full mechanic services catalog so the customer and admin
-- apps read the same rows. The original 3 were inserted in 20260819120527
-- (or seed.sql) with deterministic UUIDs; we mirror that pattern for the
-- remaining 9 entries that lived only in apps/web/src/data/services.ts.
--
-- Idempotent: ON CONFLICT (id) DO NOTHING. Re-running is a no-op.

insert into public.mechanic_services
  (id, main_category, name, description, base_price, estimated_duration_minutes, is_active)
values
  -- routine_fluid_service
  ('a1111111-1111-1111-1111-111111111111', 'routine_fluid_service', 'Coolant Flush',                 'Full cooling-system flush and refill with fresh coolant.', 120.00,  60, true),
  ('a2222222-2222-2222-2222-222222222222', 'routine_fluid_service', 'Air Filter Replacement',        'Replace the engine air filter for better airflow and mileage.', 40.00,  25, true),

  -- tire_wheel_care
  ('b1111111-1111-1111-1111-111111111111', 'tire_wheel_care',       'Brake Pad Replacement',         'Replace front or rear brake pads and inspect rotors.',       180.00,  90, true),
  ('b2222222-2222-2222-2222-222222222222', 'tire_wheel_care',       'Wheel Alignment',               'Four-wheel alignment to spec for even tire wear.',           95.00,   60, true),
  ('b3333333-3333-3333-3333-333333333333', 'tire_wheel_care',       'Suspension Inspection',         'Visual check of shocks, struts, and bushings.',              85.00,   50, true),

  -- electrical_battery_care
  ('c1111111-1111-1111-1111-111111111111', 'electrical_battery_care','Alternator Check',              'Test alternator output and charging system voltage.',        65.00,  45, true),

  -- diagnostic_repair
  ('d1111111-1111-1111-1111-111111111111', 'diagnostic_repair',     'Engine Diagnostics',            'OBD-II scan and root-cause analysis of check-engine codes.', 110.00, 75, true),

  -- lighting_visibility
  ('e1111111-1111-1111-1111-111111111111', 'lighting_visibility',    'Headlight Restoration',         'Restore cloudy or yellowed headlight lenses.',               75.00,  60, true),

  -- quick_fixes
  ('f1111111-1111-1111-1111-111111111111', 'quick_fixes',           'Windshield Wiper Service',      'Replace wiper blades and top up washer fluid.',              30.00,  20, true)
on conflict (id) do nothing;
