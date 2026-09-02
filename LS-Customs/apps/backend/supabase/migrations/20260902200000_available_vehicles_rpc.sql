-- Returns the vehicle_ids that have NO active booking overlapping
-- the [p_start, p_end] window. The customer rentals UI uses this
-- to mark a vehicle "unavailable for these dates" before the user
-- clicks Book, instead of discovering the overlap only at INSERT
-- time when the `no_overlapping_bookings` exclusion constraint
-- fires.
--
-- A booking counts as occupying the vehicle when its status is in
-- (pending, confirmed, in_progress) — the same set the exclusion
-- constraint uses. Cancelled and completed bookings don't block.
--
-- Returns vehicle_id + the conflicting booking id, so the UI can
-- show "Already booked from <date>" with a deep-link to the
-- customer's own booking if they have one.
create or replace function public.available_vehicles(
  p_start date,
  p_end   date
) returns table (
  vehicle_id   uuid,
  busy         boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select v.id, false
    from public.vehicles v
   where v.is_active = true
     and not exists (
       select 1
         from public.vehicle_bookings b
        where b.vehicle_id = v.id
          and b.status in ('pending', 'confirmed', 'in_progress')
          and daterange(b.start_date, b.end_date, '[]') && daterange(p_start, p_end, '[)')
     );
$$;

grant execute on function public.available_vehicles(date, date) to anon, authenticated;

-- Same shape, but inverted: which active vehicles are NOT available
-- for the window. The rentals UI calls this and marks each result
-- as "unavailable for these dates". Equivalent to the query above
-- but easier to read on the receiving end.
create or replace function public.unavailable_vehicles(
  p_start date,
  p_end   date
) returns table (
  vehicle_id   uuid
)
language sql
security definer
stable
set search_path = public
as $$
  select v.id
    from public.vehicles v
   where v.is_active = true
     and exists (
       select 1
         from public.vehicle_bookings b
        where b.vehicle_id = v.id
          and b.status in ('pending', 'confirmed', 'in_progress')
          and daterange(b.start_date, b.end_date, '[]') && daterange(p_start, p_end, '[)')
     );
$$;

grant execute on function public.unavailable_vehicles(date, date) to anon, authenticated;
