-- =============================================================================
-- LS Customs — Add emergency flag to service_bookings
-- =============================================================================
-- Allows mechanic bookings to be flagged as emergency for immediate dispatch.
-- Emergency bookings skip normal queue and are marked 'en_route' immediately.
-- =============================================================================

alter table public.service_bookings
  add column if not exists is_emergency boolean default false;

-- Index for fast lookup of emergency bookings (admin dashboard)
create index if not exists idx_service_bookings_is_emergency
  on public.service_bookings (is_emergency, created_at desc);
