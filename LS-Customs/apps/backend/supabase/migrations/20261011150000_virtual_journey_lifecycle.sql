-- A virtual journey ends when En route ends; a new dispatch gets a new clock.
create or replace function public.clear_booking_tracking() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.mechanic_id is distinct from old.mechanic_id or new.status not in ('assigned','en_route','in_progress') then
    delete from public.booking_locations where booking_id=new.id;
  end if;
  if new.mechanic_id is distinct from old.mechanic_id or new.status <> 'en_route' or old.status <> 'en_route' then
    delete from public.booking_route_cache where booking_id=new.id;
  end if;
  return new;
end $$;
