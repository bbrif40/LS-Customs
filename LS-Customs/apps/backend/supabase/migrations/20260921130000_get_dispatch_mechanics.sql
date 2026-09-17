-- =============================================================================
-- LS Customs — Dispatch Mechanics RPC with Live Coordinates
-- =============================================================================
-- Exposes available mechanics and their live coordinates for the customer
-- mobile mechanic booking flow to calculate distance and travel fees.
-- =============================================================================

create or replace function public.get_dispatch_mechanics()
returns table (
  id               uuid,
  full_name        text,
  rating_avg       numeric(3,2),
  rating_count     int,
  specialties      text[],
  years_experience int,
  current_lat      double precision,
  current_lng      double precision
)
language sql
security definer
set search_path = public
as $$
  select
    mp.id,
    p.full_name,
    mp.rating_avg,
    mp.rating_count,
    mp.specialties,
    mp.years_experience,
    coalesce(mp.current_lat, 14.5995)::double precision as current_lat,
    coalesce(mp.current_lng, 120.9842)::double precision as current_lng
  from public.mechanic_profiles mp
  join public.profiles p on p.id = mp.id
  where mp.is_available = true;
$$;

grant execute on function public.get_dispatch_mechanics() to public, anon, authenticated;
