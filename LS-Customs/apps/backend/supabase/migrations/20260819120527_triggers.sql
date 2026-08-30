-- =============================================================================
-- LS Customs — Phase 1 Migration 4: Timestamps & Audit Triggers
-- =============================================================================
-- Creates the set_updated_at trigger function and attaches it to every
-- table that has an updated_at column.
-- Tables with updated_at: profiles, vehicles, vehicle_bookings,
--   mechanic_profiles, mechanic_services, service_bookings, payments
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Trigger function: auto-update updated_at on row modification
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Attach trigger to every table with an updated_at column
-- -----------------------------------------------------------------------------
create trigger trg_profiles_updated
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger trg_vehicles_updated
  before update on public.vehicles
  for each row execute function public.set_updated_at();

create trigger trg_vehicle_bookings_updated
  before update on public.vehicle_bookings
  for each row execute function public.set_updated_at();

create trigger trg_mechanic_profiles_updated
  before update on public.mechanic_profiles
  for each row execute function public.set_updated_at();

create trigger trg_mechanic_services_updated
  before update on public.mechanic_services
  for each row execute function public.set_updated_at();

create trigger trg_service_bookings_updated
  before update on public.service_bookings
  for each row execute function public.set_updated_at();

create trigger trg_payments_updated
  before update on public.payments
  for each row execute function public.set_updated_at();
