-- =============================================================================
-- LS Customs — Seed extra mechanic services categories
-- =============================================================================
-- Adds the 3 remaining categories (diagnostic_repair, lighting_visibility,
-- quick_fixes) on top of the 3 from seed.sql so the customer sees all 6
-- categories in the mechanic booking flow.
-- Idempotent: ON CONFLICT (id) DO NOTHING. Re-running is a no-op.
-- =============================================================================

insert into public.mechanic_services
  (id, main_category, name, description, base_price, estimated_duration_minutes, is_active)
values
  -- diagnostic_repair
  ('d1111111-1111-1111-1111-111111111111', 'diagnostic_repair', 'Engine Diagnostics', 'OBD-II scan and root-cause analysis of check-engine codes.', 110.00, 75, true),

  -- lighting_visibility
  ('e1111111-1111-1111-1111-111111111111', 'lighting_visibility', 'Headlight Restoration', 'Restore cloudy or yellowed headlight lenses.', 75.00, 60, true),

  -- quick_fixes
  ('f1111111-1111-1111-1111-111111111111', 'quick_fixes', 'Windshield Wiper Service', 'Replace wiper blades and top up washer fluid.', 30.00, 20, true)
on conflict (id) do nothing;
