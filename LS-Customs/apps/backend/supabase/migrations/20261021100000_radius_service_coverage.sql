-- Coordinate-based coverage needs no third-party geocoding API key.
insert into public.service_areas(id,city,region,region_aliases)
  values('cf000000-0000-4000-8000-000000000001','Manila service radius','NCR, Bulacan and Cavite','{}');
create table public.service_coverage (
  id boolean primary key default true check(id),
  area_id uuid not null references public.service_areas(id),
  center_lat double precision not null default 14.5995 check(center_lat between -90 and 90),
  center_lng double precision not null default 120.9842 check(center_lng between -180 and 180),
  radius_km numeric not null default 100 check(radius_km between 1 and 300),
  active boolean not null default true
);
insert into public.service_coverage(id,area_id) values(true,'cf000000-0000-4000-8000-000000000001');
alter table public.service_coverage enable row level security;
create policy coverage_read on public.service_coverage for select using(true);
create policy coverage_admin on public.service_coverage for update to authenticated using(public.is_admin()) with check(public.is_admin());
grant select on public.service_coverage to anon,authenticated;
grant update(center_lat,center_lng,radius_km,active) on public.service_coverage to authenticated;
grant all on public.service_coverage to service_role;

create function public.verify_service_pin(p_lat double precision,p_lng double precision)
returns jsonb language plpgsql security definer set search_path=public as $$
declare coverage service_coverage; checked service_location_checks; distance numeric;
begin
  if auth.uid() is null then raise exception 'Sign in to verify your service location' using errcode='42501'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Choose a valid map location' using errcode='22023'; end if;
  select c.* into coverage from service_coverage c join service_areas a on a.id=c.area_id and a.active where c.id and c.active;
  if not found then raise exception 'New service requests are temporarily unavailable. Contact support' using errcode='22023'; end if;
  distance:=public.distance_km(coverage.center_lat,coverage.center_lng,p_lat,p_lng);
  if distance>coverage.radius_km then raise exception 'This pin is outside the % km service radius. Choose a closer location or contact support',coverage.radius_km using errcode='22023'; end if;
  insert into service_location_checks(customer_id,area_id,lat,lng) values(auth.uid(),coverage.area_id,p_lat,p_lng) returning * into checked;
  return jsonb_build_object('id',checked.id,'expires_at',checked.expires_at,'radius_km',coverage.radius_km,'distance_km',round(distance,1),
    'city','Manila service radius','region','NCR, Bulacan and Cavite');
end $$;
revoke all on function public.verify_service_pin(double precision,double precision) from public,anon;
grant execute on function public.verify_service_pin(double precision,double precision) to authenticated;

create function public.expire_changed_coverage_checks() returns trigger language plpgsql security definer set search_path=public as $$
begin
  update service_location_checks set expires_at=least(expires_at,now()) where expires_at>now();
  insert into admin_audit_logs(admin_id,action_type,record_type,record_id,details)
    values(auth.uid(),'coverage_changed','service_coverage','true',jsonb_build_object('before',to_jsonb(old),'after',to_jsonb(new)));
  return new;
end $$;
create trigger coverage_changed after update on public.service_coverage for each row execute function public.expire_changed_coverage_checks();

-- Publish updated geographic coverage without rewriting accepted history.
insert into public.transaction_terms(version,content)
  select '2026-10-21',replace(content,'service coverage is NCR.','service coverage follows the configured radius (initially 100 km from Manila, reaching Bulacan and Cavite).')
  from public.transaction_terms where active order by created_at desc limit 1;
update public.transaction_terms set active=false where version<>'2026-10-21';
