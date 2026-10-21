create table public.service_areas (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  aliases text[] not null default '{}',
  region text not null default 'Metro Manila',
  region_aliases text[] not null default array['NCR','National Capital Region'],
  active boolean not null default true,
  unique(city,region)
);
alter table public.service_areas enable row level security;
create policy area_read on public.service_areas for select using(active or public.is_admin());
create policy area_admin on public.service_areas for all to authenticated using(public.is_admin()) with check(public.is_admin());
grant select on public.service_areas to anon,authenticated;
grant insert,update,delete on public.service_areas to authenticated;
grant all on public.service_areas to service_role;
insert into public.service_areas(city) select unnest(array['Manila','Quezon City','Caloocan','Las Piñas','Makati','Malabon','Mandaluyong','Marikina','Muntinlupa','Navotas','Parañaque','Pasay','Pasig','Pateros','San Juan','Taguig','Valenzuela']);

create table public.service_location_checks (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  area_id uuid not null references public.service_areas(id),
  lat double precision not null check(lat between -90 and 90),
  lng double precision not null check(lng between -180 and 180),
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '10 minutes'
);
alter table public.service_location_checks enable row level security;
create policy location_check_read on public.service_location_checks for select to authenticated using(customer_id=auth.uid() or public.is_admin());
grant select on public.service_location_checks to authenticated;
grant all on public.service_location_checks to service_role;
alter table public.service_bookings add column confirmed_lat double precision;
alter table public.service_bookings add column confirmed_lng double precision;
alter table public.service_bookings add column service_area_id uuid references public.service_areas(id);
alter table public.service_bookings add column confirmed_travel_fee numeric(10,2) not null default 0;
update public.service_bookings b set confirmed_lat=coalesce(b.pin_lat,a.lat),confirmed_lng=coalesce(b.pin_lng,a.lng)
  from public.addresses a where a.id=b.address_id;
update public.service_bookings set confirmed_lat=pin_lat,confirmed_lng=pin_lng where confirmed_lat is null;

alter function public.create_service_booking(uuid,uuid,timestamptz,uuid,double precision,double precision,text,text,text,text) rename to create_service_booking_hours;
revoke all on function public.create_service_booking_hours(uuid,uuid,timestamptz,uuid,double precision,double precision,text,text,text,text) from public,anon,authenticated;
create function public.create_service_booking(p_request_id uuid,p_service_id uuid,p_scheduled_at timestamptz,
  p_address_id uuid default null,p_lat double precision default null,p_lng double precision default null,
  p_notes text default null,p_promo_code text default null,p_emergency text default null,p_payment_method text default 'online',p_location_check uuid default null)
returns public.service_bookings language plpgsql security definer set search_path=public as $$
declare b service_bookings; checked service_location_checks; location_lat double precision:=p_lat; location_lng double precision:=p_lng; travel numeric;
begin
  select * into b from service_bookings where customer_id=auth.uid() and request_id=p_request_id;
  if found then return b; end if;
  if p_address_id is not null then select a.lat,a.lng into location_lat,location_lng from addresses a where id=p_address_id and customer_id=auth.uid(); end if;
  select c.* into checked from service_location_checks c join service_areas a on a.id=c.area_id and a.active
    where c.id=p_location_check and c.customer_id=auth.uid() and c.expires_at>now() and abs(c.lat-location_lat)<0.000001 and abs(c.lng-location_lng)<0.000001;
  if not found then raise exception 'Verify a supported service location before booking'; end if;
  b:=public.create_service_booking_hours(p_request_id,p_service_id,p_scheduled_at,p_address_id,p_lat,p_lng,p_notes,p_promo_code,p_emergency,p_payment_method);
  select travel_fee into travel from public.get_dispatch_quote(location_lat,location_lng);
  update service_bookings set confirmed_lat=location_lat,confirmed_lng=location_lng,service_area_id=checked.area_id,confirmed_travel_fee=case when p_emergency is not null then 0 else coalesce(travel,0) end where id=b.id returning * into b;
  return b;
end $$;
revoke all on function public.create_service_booking(uuid,uuid,timestamptz,uuid,double precision,double precision,text,text,text,text,uuid) from public,anon;
grant execute on function public.create_service_booking(uuid,uuid,timestamptz,uuid,double precision,double precision,text,text,text,text,uuid) to authenticated;

create function public.report_booking_gps_failure(p_booking uuid,p_reason text) returns void language plpgsql security definer set search_path=public as $$
declare b service_bookings;
begin
  select * into b from service_bookings where id=p_booking and mechanic_id=auth.uid() and status='en_route';
  if not found then raise exception 'Tracking access denied' using errcode='42501'; end if;
  insert into operations_queue(source_key,kind,customer_id,booking_id,title,details)
    values('gps:'||b.id,'gps_unavailable',b.customer_id,b.id,'Mechanic live location unavailable',jsonb_build_object('reason',left(p_reason,200)))
    on conflict(source_key) do update set closed_at=null,details=excluded.details;
end $$;
revoke all on function public.report_booking_gps_failure(uuid,text) from public,anon;
grant execute on function public.report_booking_gps_failure(uuid,text) to authenticated;
create function public.resolve_gps_alert() returns trigger language plpgsql security definer set search_path=public as $$
begin update operations_queue set closed_at=now() where source_key='gps:'||new.booking_id and closed_at is null; return new; end $$;
create trigger gps_alert_resolved after insert or update on public.booking_locations for each row execute function public.resolve_gps_alert();
