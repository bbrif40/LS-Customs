-- One current fix per booking; no cross-booking GPS history.
create table public.booking_locations (
  booking_id uuid primary key references public.service_bookings(id) on delete cascade,
  mechanic_id uuid not null references public.mechanic_profiles(id),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_m double precision not null check (accuracy_m between 0 and 150),
  heading_deg double precision check (heading_deg >= 0 and heading_deg < 360),
  speed_mps double precision check (speed_mps between 0 and 70),
  recorded_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp()
);
alter table public.booking_locations enable row level security;
revoke all on public.booking_locations from anon, authenticated;
grant select on public.booking_locations to authenticated;
create policy "active booking location readers" on public.booking_locations for select to authenticated
using (public.is_admin() or exists (
  select 1 from public.service_bookings b where b.id=booking_id and b.mechanic_id=booking_locations.mechanic_id
  and b.status in ('assigned','en_route','in_progress') and (b.customer_id=auth.uid() or b.mechanic_id=auth.uid())
));

create function public.publish_booking_location(p_booking_id uuid,p_lat double precision,p_lng double precision,
  p_accuracy double precision,p_recorded_at timestamptz,p_heading double precision default null,p_speed double precision default null)
returns public.booking_locations language plpgsql security definer set search_path=public as $$
declare b public.service_bookings; previous public.booking_locations; result public.booking_locations;
begin
  select * into b from public.service_bookings where id=p_booking_id for update;
  if auth.uid() is null or b.mechanic_id is distinct from auth.uid() or b.status not in ('assigned','en_route') then
    raise exception 'Only the assigned travelling mechanic can publish GPS' using errcode='42501';
  end if;
  if p_lat is null or p_lng is null or p_accuracy is null or p_recorded_at is null
    or not (p_lat between -90 and 90) or not (p_lng between -180 and 180)
    or not (p_accuracy between 0 and 150)
    or p_recorded_at < clock_timestamp()-interval '30 seconds' or p_recorded_at > clock_timestamp()+interval '5 seconds'
    or (p_heading is not null and not (p_heading >= 0 and p_heading < 360))
    or (p_speed is not null and not (p_speed between 0 and 70)) then raise exception 'Invalid or stale GPS fix'; end if;
  select * into previous from public.booking_locations where booking_id=p_booking_id;
  if found and previous.mechanic_id=b.mechanic_id then
    if p_recorded_at <= previous.recorded_at then raise exception 'Out-of-order GPS fix'; end if;
    if previous.received_at > clock_timestamp()-interval '4 seconds' then raise exception 'GPS update rate exceeded'; end if;
    if 6371000 * 2 * asin(least(1.0,sqrt(power(sin(radians(p_lat-previous.lat)/2),2)
      +cos(radians(previous.lat))*cos(radians(p_lat))*power(sin(radians(p_lng-previous.lng)/2),2))))
      > 70*extract(epoch from (p_recorded_at-previous.recorded_at))+p_accuracy+previous.accuracy_m then
      raise exception 'GPS jump exceeds travel limit';
    end if;
  end if;
  insert into public.booking_locations values(p_booking_id,b.mechanic_id,p_lat,p_lng,p_accuracy,p_heading,p_speed,p_recorded_at,clock_timestamp())
  on conflict (booking_id) do update set mechanic_id=excluded.mechanic_id,lat=excluded.lat,lng=excluded.lng,
    accuracy_m=excluded.accuracy_m,heading_deg=excluded.heading_deg,speed_mps=excluded.speed_mps,
    recorded_at=excluded.recorded_at,received_at=excluded.received_at returning * into result;
  return result;
end $$;
revoke all on function public.publish_booking_location(uuid,double precision,double precision,double precision,timestamptz,double precision,double precision) from public,anon;
grant execute on function public.publish_booking_location(uuid,double precision,double precision,double precision,timestamptz,double precision,double precision) to authenticated;

create function public.clear_booking_tracking() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.mechanic_id is distinct from old.mechanic_id or new.status not in ('assigned','en_route','in_progress') then
    delete from public.booking_locations where booking_id=new.id;
  end if;
  return new;
end $$;
create trigger clear_booking_tracking after update of mechanic_id,status on public.service_bookings
for each row execute function public.clear_booking_tracking();
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.booking_locations;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='service_bookings') then
      alter publication supabase_realtime add table public.service_bookings;
    end if;
  end if;
end $$;

-- Server-side route cache and throttle, never client writable.
create table public.booking_route_cache (
  booking_id uuid primary key references public.service_bookings(id) on delete cascade,
  requested_at timestamptz not null default clock_timestamp(), route jsonb
);
alter table public.booking_route_cache enable row level security;
revoke all on public.booking_route_cache from anon,authenticated;
grant all on public.booking_route_cache to service_role;
create or replace function public.clear_booking_tracking() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.mechanic_id is distinct from old.mechanic_id or new.status not in ('assigned','en_route','in_progress') then
    delete from public.booking_locations where booking_id=new.id;
    delete from public.booking_route_cache where booking_id=new.id;
  end if;
  return new;
end $$;
create function public.claim_booking_route(p_booking_id uuid) returns boolean
language sql security definer set search_path=public as $$
  with claimed as (
    insert into public.booking_route_cache(booking_id) values(p_booking_id)
    on conflict(booking_id) do update set requested_at=clock_timestamp()
    where booking_route_cache.requested_at < clock_timestamp()-interval '20 seconds'
    returning booking_id
  ) select exists(select 1 from claimed);
$$;
revoke all on function public.claim_booking_route(uuid) from public,anon,authenticated;
grant execute on function public.claim_booking_route(uuid) to service_role;
