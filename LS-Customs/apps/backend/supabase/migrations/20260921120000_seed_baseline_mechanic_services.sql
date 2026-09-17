-- =============================================================================
-- LS Customs — Seed baseline mechanic services for all 6 categories
-- =============================================================================
-- Ensures all 6 mechanic service categories from domain.types.ts / SPEC.md
-- (routine_fluid_service, tire_wheel_care, electrical_battery_care,
-- diagnostic_repair, lighting_visibility, quick_fixes) have active catalog
-- entries in the database.
--
-- Idempotent: ON CONFLICT (id) DO UPDATE.
-- =============================================================================

insert into public.mechanic_services
  (id, main_category, name, description, base_price, estimated_duration_minutes, is_active)
values
  -- 1. routine_fluid_service
  ('11111111-1111-1111-1111-111111111111', 'routine_fluid_service', 'Full Synthetic Oil Change', 'Complete oil change with premium synthetic blend', 89.99, 45, true),

  -- 2. tire_wheel_care
  ('22222222-2222-2222-2222-222222222222', 'tire_wheel_care', 'Tire Rotation', 'Four-wheel tire rotation and pressure check', 35.00, 30, true),

  -- 3. electrical_battery_care
  ('33333333-3333-3333-3333-333333333333', 'electrical_battery_care', 'Battery Diagnostics', 'Comprehensive battery health check', 45.00, 30, true),

  -- 4. diagnostic_repair
  ('d1111111-1111-1111-1111-111111111111', 'diagnostic_repair', 'Engine Diagnostics', 'OBD-II scan and root-cause analysis of check-engine codes.', 110.00, 75, true),

  -- 5. lighting_visibility
  ('e1111111-1111-1111-1111-111111111111', 'lighting_visibility', 'Headlight Restoration', 'Restore cloudy or yellowed headlight lenses.', 75.00, 60, true),

  -- 6. quick_fixes
  ('f1111111-1111-1111-1111-111111111111', 'quick_fixes', 'Windshield Wiper Service', 'Replace wiper blades and top up washer fluid.', 30.00, 20, true)
on conflict (id) do update set
  is_active = true,
  main_category = excluded.main_category,
  name = excluded.name,
  description = excluded.description,
  base_price = excluded.base_price,
  estimated_duration_minutes = excluded.estimated_duration_minutes;
