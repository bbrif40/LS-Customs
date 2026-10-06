-- Hosted QA remediation. Forward-only: apply before deploying the new frontend.
-- SECURITY DEFINER entry points derive the caller from auth.uid(); direct table
-- writes remain protected by RLS plus field-level triggers.

create or replace function public.protect_profile_role()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.role is distinct from old.role
     and current_user not in ('postgres', 'supabase_admin', 'service_role')
     and not coalesce(public.is_admin(), false) then
    raise exception 'Only an administrator can change account roles' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger protect_profile_role before update on public.profiles
for each row execute function public.protect_profile_role();

-- A short-lived unpaid rental reservation; expiry is also reclaimed atomically
-- by each new reservation. No browser timer is a source of truth.
alter table public.vehicle_bookings add column hold_expires_at timestamptz;
update public.vehicle_bookings set hold_expires_at = now() + interval '30 minutes'
where status = 'pending' and not exists (
  select 1 from public.payments p where p.booking_type = 'vehicle'
  and p.booking_id = vehicle_bookings.id and p.status = 'succeeded'
);
alter table public.vehicle_bookings add column request_id uuid;
alter table public.service_bookings add column request_id uuid;
create unique index vehicle_booking_request on public.vehicle_bookings(customer_id, request_id);
create unique index service_booking_request on public.service_bookings(customer_id, request_id);

create table public.booking_promotions (
  code text primary key,
  category text not null check (category in ('all', 'vehicle', 'service')),
  percent_off numeric check (percent_off between 0 and 100),
  amount_off numeric(10,2) check (amount_off >= 0),
  is_active boolean not null default true,
  expires_at timestamptz,
  check ((percent_off is not null)::int + (amount_off is not null)::int = 1)
);
alter table public.booking_promotions enable row level security;
create policy "promotions read active" on public.booking_promotions for select
to anon, authenticated using (is_active and (expires_at is null or expires_at > now()));
create policy "promotions admin" on public.booking_promotions for all
to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.booking_promotions to anon, authenticated;
grant insert, update, delete on public.booking_promotions to authenticated;
grant all on public.booking_promotions to service_role;
-- Existing advertised offers are configured on the server, never from browser values.
insert into public.booking_promotions(code, category, percent_off, amount_off) values
('ESCAPE20', 'all', 20, null), ('CARE500', 'service', null, 500),
('VIPLUXE', 'vehicle', 15, null), ('FREEOIL', 'service', null, 350);

create or replace function public.discounted_booking_total(p_total numeric, p_code text, p_type text)
returns numeric language plpgsql security definer set search_path = public as $$
declare offer public.booking_promotions; discounted numeric;
begin
  if p_code is null or trim(p_code) = '' then return round(p_total, 2); end if;
  select * into offer from public.booking_promotions where code = upper(trim(p_code))
    and is_active and (expires_at is null or expires_at > now())
    and category in ('all', p_type);
  if not found then raise exception 'Voucher is invalid, expired, or does not apply'; end if;
  discounted := greatest(0, round(p_total - case when offer.percent_off is not null
    then round(p_total * offer.percent_off / 100) else offer.amount_off end, 2));
  if discounted <= 0 then raise exception 'This voucher covers the full total. Contact support to arrange a complimentary booking'; end if;
  return discounted;
end;
$$;
revoke all on function public.discounted_booking_total(numeric,text,text) from public, anon, authenticated;

create or replace function public.distance_km(a double precision, b double precision, c double precision, d double precision)
returns double precision language sql immutable set search_path = public as $$
  select 6371 * 2 * asin(sqrt(least(1, power(sin(radians(c-a)/2),2)
    + cos(radians(a))*cos(radians(c))*power(sin(radians(d-b)/2),2))));
$$;

-- Discovery returns a distance/price only, not named mechanics' exact GPS fixes.
create or replace function public.get_dispatch_quote(p_lat double precision, p_lng double precision)
returns table(distance_km numeric, travel_fee numeric) language plpgsql
security definer set search_path = public as $$
declare dist numeric;
begin
  if p_lat is null or p_lng is null or not (p_lat between -90 and 90)
    or not (p_lng between -180 and 180) then raise exception 'A valid location is required'; end if;
  select round(min(public.distance_km(p_lat,p_lng,current_lat,current_lng))::numeric,1)
  into dist from public.mechanic_profiles where is_available
    and current_lat is not null and current_lng is not null;
  if dist is null then return; end if;
  return query select dist, greatest(1,ceil(greatest(0.1,dist)/5))*85;
end;
$$;
revoke all on function public.get_dispatch_quote(double precision,double precision) from public;
grant execute on function public.get_dispatch_quote(double precision,double precision) to anon, authenticated, service_role;
revoke all on function public.get_dispatch_mechanics() from public, anon, authenticated;

drop policy "mechanic_profiles read assigned customer" on public.mechanic_profiles;
create policy "mechanic_profiles read active customer" on public.mechanic_profiles for select
to authenticated using (exists (select 1 from public.service_bookings s
  where s.mechanic_id = mechanic_profiles.id and s.customer_id = auth.uid()
  and s.status in ('assigned','en_route','in_progress')));

-- Restrict direct updates to the documented fields. Triggers are SECURITY INVOKER
-- so a vetted SECURITY DEFINER transaction can carry out workflow transitions.
create or replace function public.protect_booking_fields()
returns trigger language plpgsql set search_path = public as $$
declare allowed text[];
begin
  if current_user in ('postgres','supabase_admin','service_role') or coalesce(public.is_admin(),false) then return new; end if;
  if tg_op = 'INSERT' then
    raise exception 'Create bookings using the booking transaction' using errcode = '42501';
  end if;
  if old.customer_id = auth.uid() then
    allowed := array['status','updated_at'];
    if tg_table_name = 'service_bookings' and new.status = old.status
       and old.status in ('assigned','en_route','in_progress') then
      allowed := array['current_lat','current_lng','location_updated_at','updated_at'];
      new.location_updated_at := now();
    elsif old.status != 'pending' or new.status != 'cancelled' then
      raise exception 'This booking cannot be changed directly' using errcode = '42501';
    end if;
    if new.status = 'cancelled' and exists (select 1 from public.payments p
      where p.booking_id = old.id and p.booking_type::text = case when tg_table_name='vehicle_bookings' then 'vehicle' else 'service' end
      and p.status = 'succeeded') then raise exception 'Contact support to cancel a paid booking'; end if;
  elsif tg_table_name = 'service_bookings' and public.is_mechanic()
      and to_jsonb(old)->>'mechanic_id' = auth.uid()::text then
    allowed := array['status','updated_at'];
  else raise exception 'Booking access denied' using errcode = '42501'; end if;
  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'Protected booking fields cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger protect_vehicle_booking before insert or update on public.vehicle_bookings
for each row execute function public.protect_booking_fields();
create trigger protect_service_booking before insert or update on public.service_bookings
for each row execute function public.protect_booking_fields();
drop policy "vehicle_bookings insert" on public.vehicle_bookings;
drop policy "service_bookings insert" on public.service_bookings;
drop policy "service_booking_items insert" on public.service_booking_items;
create policy "vehicle bookings admin insert" on public.vehicle_bookings for insert to authenticated with check(public.is_admin());
create policy "service bookings admin insert" on public.service_bookings for insert to authenticated with check(public.is_admin());
create policy "service items admin insert" on public.service_booking_items for insert to authenticated with check(public.is_admin());

-- Use consistent half-open intervals: the return date is available for the next trip.
alter table public.vehicle_bookings drop constraint no_overlapping_bookings;
alter table public.vehicle_bookings add constraint no_overlapping_bookings exclude using gist
  (vehicle_id with =, daterange(start_date,end_date,'[)') with &&)
  where (status in ('pending','confirmed','in_progress'));

create or replace function public.create_vehicle_booking(
  p_request_id uuid, p_vehicle_id uuid, p_start date, p_end date, p_promo_code text default null)
returns public.vehicle_bookings language plpgsql security definer set search_path = public as $$
declare result public.vehicle_bookings; rate numeric; caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Sign in to book' using errcode='42501'; end if;
  if p_request_id is null then raise exception 'A request ID is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text || p_request_id::text,0));
  select * into result from public.vehicle_bookings where customer_id=caller and request_id=p_request_id;
  if found then return result; end if;
  if p_start < (now() at time zone 'Asia/Manila')::date or p_end <= p_start or p_end-p_start > 30
    or p_start is null or p_end is null then raise exception 'Choose valid rental dates (1–30 days)'; end if;
  perform 1 from public.vehicles where id=p_vehicle_id and is_active for update;
  if not found then raise exception 'Vehicle is unavailable'; end if;
  update public.vehicle_bookings b set status='cancelled' where vehicle_id=p_vehicle_id
    and status='pending' and hold_expires_at < now()
    and not exists(select 1 from public.payments p where p.booking_id=b.id and p.booking_type='vehicle' and p.status='succeeded');
  if (select count(*) from public.vehicle_bookings where customer_id=caller and status='pending') >= 3 then
    raise exception 'Complete or cancel your existing reservations before booking again'; end if;
  select price_per_day into rate from public.vehicles where id=p_vehicle_id;
  insert into public.vehicle_bookings(vehicle_id,customer_id,start_date,end_date,status,total_price,pickup_location,hold_expires_at,request_id)
  values(p_vehicle_id,caller,p_start,p_end,'pending',public.discounted_booking_total(rate*(p_end-p_start),p_promo_code,'vehicle'),
    'Showroom Pickup' || case when p_promo_code is null then '' else ' | Voucher: '||upper(p_promo_code) end,
    now()+interval '30 minutes',p_request_id) returning * into result;
  return result;
end;
$$;

create or replace function public.create_service_booking(
  p_request_id uuid, p_service_id uuid, p_scheduled_at timestamptz,
  p_address_id uuid default null, p_lat double precision default null, p_lng double precision default null,
  p_notes text default null, p_promo_code text default null, p_emergency text default null)
returns public.service_bookings language plpgsql security definer set search_path = public as $$
declare result public.service_bookings; catalog public.mechanic_services; caller uuid:=auth.uid();
  lat double precision:=p_lat; lng double precision:=p_lng; fee numeric; price numeric;
begin
  if caller is null then raise exception 'Sign in to request a mechanic' using errcode='42501'; end if;
  if p_request_id is null then raise exception 'A request ID is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text||p_request_id::text,0));
  select * into result from public.service_bookings where customer_id=caller and request_id=p_request_id;
  if found then return result; end if;
  if length(coalesce(p_notes,'')) > 2000 then raise exception 'Location notes are too long'; end if;
  if (p_address_id is not null)::int + ((p_lat is not null) and (p_lng is not null))::int != 1
    then raise exception 'Choose a saved address or a confirmed map pin'; end if;
  if p_address_id is not null then
    select a.lat,a.lng into lat,lng from public.addresses a where id=p_address_id and customer_id=caller;
    if not found then raise exception 'Address access denied' using errcode='42501'; end if;
  end if;
  if not(lat between -90 and 90) or not(lng between -180 and 180) or lat is null or lng is null then raise exception 'Invalid map coordinates'; end if;
  if (select count(*) from public.service_bookings where customer_id=caller and status='pending') >= 5 then
    raise exception 'Complete or cancel your existing requests before booking again'; end if;
  if p_emergency is not null then
    price := case p_emergency when 'battery' then 1850 when 'tire' then 1250 when 'engine' then 2950
      when 'lockout' then 1650 when 'fuel' then 1200 when 'towing' then 3800 else null end;
    if price is null then raise exception 'Choose a supported emergency service'; end if;
  else
    if p_scheduled_at is null or p_scheduled_at <= now() or p_scheduled_at > now()+interval '100 days'
      then raise exception 'Choose a future appointment within 100 days'; end if;
    select * into catalog from public.mechanic_services where id=p_service_id and is_active;
    if not found then raise exception 'Service is unavailable'; end if;
    select travel_fee into fee from public.get_dispatch_quote(lat,lng);
    if fee is null then raise exception 'Travel pricing is unavailable; please try again or contact support'; end if;
    price := public.discounted_booking_total(catalog.base_price+fee,p_promo_code,'service');
  end if;
  insert into public.service_bookings(customer_id,address_id,pin_lat,pin_lng,scheduled_at,status,total_price,notes,is_emergency,request_id)
  values(caller,p_address_id,p_lat,p_lng,case when p_emergency is not null then now() else p_scheduled_at end,'pending',price,
    coalesce(p_notes,'') || case when p_emergency is not null then ' | Emergency: '||p_emergency
      else ' | Travel Fee: ₱'||fee::text||case when p_promo_code is null then '' else ' | Voucher: '||upper(p_promo_code) end end,
    p_emergency is not null,p_request_id) returning * into result;
  if p_emergency is null then
    insert into public.service_booking_items(service_booking_id,mechanic_service_id,quantity,price_at_booking)
    values(result.id,catalog.id,1,catalog.base_price);
  end if;
  return result;
end;
$$;
revoke all on function public.create_vehicle_booking(uuid,uuid,date,date,text) from public, anon;
revoke all on function public.create_service_booking(uuid,uuid,timestamptz,uuid,double precision,double precision,text,text,text) from public, anon;
grant execute on function public.create_vehicle_booking(uuid,uuid,date,date,text) to authenticated;
grant execute on function public.create_service_booking(uuid,uuid,timestamptz,uuid,double precision,double precision,text,text,text) to authenticated;

-- Preserve strict mechanic transitions and allow trusted transactions to cancel
-- emergency requests or expire a hold. Customer live-location writes do not alter status.
create or replace function public.enforce_service_status_transition()
returns trigger language plpgsql set search_path=public as $$
begin
  if current_user in ('postgres','supabase_admin','service_role') or coalesce(public.is_admin(),false) then return new; end if;
  if new.status = old.status then return new; end if;
  if public.current_role()='customer' and old.status='pending' and new.status='cancelled' then return new; end if;
  if public.is_mechanic() and ((old.status='assigned' and new.status='en_route')
    or (old.status='en_route' and new.status='in_progress') or (old.status='in_progress' and new.status='completed')) then return new; end if;
  raise exception 'Booking status transition is not allowed' using errcode='42501';
end;
$$;

create or replace function public.cancel_customer_booking(p_booking_type text,p_booking_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare caller uuid:=auth.uid(); result_id uuid;
begin
  if caller is null then raise exception 'Sign in to cancel' using errcode='42501'; end if;
  if p_booking_type='vehicle' then
    perform 1 from public.vehicle_bookings where id=p_booking_id and customer_id=caller for update;
  elsif p_booking_type='service' then
    perform 1 from public.service_bookings where id=p_booking_id and customer_id=caller for update;
  else raise exception 'Invalid booking type'; end if;
  if not found then raise exception 'Booking not found' using errcode='42501'; end if;
  if exists(select 1 from public.payments where booking_id=p_booking_id and booking_type::text=p_booking_type and status='succeeded') then
    raise exception 'This booking is paid. Contact support for cancellation and refund assistance'; end if;
  if p_booking_type='vehicle' then
    update public.vehicle_bookings set status='cancelled' where id=p_booking_id and status='pending' returning id into result_id;
  else
    update public.service_bookings set status='cancelled' where id=p_booking_id
      and (status='pending' or (is_emergency and status in ('assigned','en_route'))) returning id into result_id;
  end if;
  if result_id is null then raise exception 'This booking can no longer be cancelled online'; end if;
  return true;
end;
$$;
revoke all on function public.cancel_customer_booking(text,uuid) from public, anon;
grant execute on function public.cancel_customer_booking(text,uuid) to authenticated;

-- Serialize assignment on the booking and candidate mechanic. Capacity includes
-- booked duration plus a 30-minute travel buffer. Emergency is pay-on-arrival.
create or replace function public.assign_booking_mechanic(p_booking_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b public.service_bookings; m record; lat double precision; lng double precision; duration int;
begin
  select * into b from public.service_bookings where id=p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if auth.uid() is not null and b.customer_id!=auth.uid() and not coalesce(public.is_admin(),false) then
    raise exception 'Booking access denied' using errcode='42501'; end if;
  if b.status in ('cancelled','completed') then raise exception 'Booking is no longer active'; end if;
  if b.mechanic_id is not null then
    select mp.id,p.full_name,p.phone into m from public.mechanic_profiles mp join public.profiles p on p.id=mp.id where mp.id=b.mechanic_id;
    return jsonb_build_object('service_booking_id',b.id,'mechanic_id',m.id,'mechanic_name',m.full_name,'mechanic_phone',m.phone,'status',b.status);
  end if;
  if not b.is_emergency and not exists(select 1 from public.payments where booking_type='service' and booking_id=b.id and status='succeeded') then
    raise exception 'Payment must be confirmed before dispatch'; end if;
  lat:=b.pin_lat; lng:=b.pin_lng;
  if b.address_id is not null then select a.lat,a.lng into lat,lng from public.addresses a where id=b.address_id; end if;
  select greatest(30,coalesce(sum(s.estimated_duration_minutes*i.quantity),60))::int into duration
  from public.service_booking_items i join public.mechanic_services s on s.id=i.mechanic_service_id where i.service_booking_id=b.id;
  for m in select mp.id,p.full_name,p.phone from public.mechanic_profiles mp join public.profiles p on p.id=mp.id
    where mp.is_available and mp.current_lat is not null and mp.current_lng is not null
    order by public.distance_km(lat,lng,mp.current_lat,mp.current_lng) for update of mp skip locked
  loop
    if not exists(select 1 from public.service_bookings other where other.mechanic_id=m.id
      and other.id!=b.id and other.status in ('assigned','en_route','in_progress')
      and tstzrange(other.scheduled_at, greatest(other.scheduled_at + make_interval(mins => 30 + greatest(30,coalesce(
        (select sum(s.estimated_duration_minutes*i.quantity)::int from public.service_booking_items i
         join public.mechanic_services s on s.id=i.mechanic_service_id where i.service_booking_id=other.id),60))),
         case when other.status in ('en_route','in_progress') then now()+interval '30 minutes' else other.scheduled_at end), '[)')
        && tstzrange(b.scheduled_at,b.scheduled_at+make_interval(mins=>duration+30),'[)')) then
      update public.service_bookings set mechanic_id=m.id,status='assigned' where id=b.id;
      return jsonb_build_object('service_booking_id',b.id,'mechanic_id',m.id,'mechanic_name',m.full_name,'mechanic_phone',m.phone,'status','assigned');
    end if;
  end loop;
  raise exception 'No mechanic is available for this appointment';
end;
$$;
revoke all on function public.assign_booking_mechanic(uuid) from public, anon, authenticated;
grant execute on function public.assign_booking_mechanic(uuid) to service_role;

-- Enforce capacity for manual admin assignments as well as automatic dispatch.
create function public.enforce_mechanic_capacity()
returns trigger language plpgsql security definer set search_path=public as $$
declare duration int;
begin
  if new.mechanic_id is null or new.status not in ('assigned','en_route','in_progress') then return new; end if;
  perform 1 from public.mechanic_profiles where id=new.mechanic_id for update;
  select greatest(30,coalesce(sum(s.estimated_duration_minutes*i.quantity),60))::int into duration
    from public.service_booking_items i join public.mechanic_services s on s.id=i.mechanic_service_id
    where i.service_booking_id=new.id;
  if exists(select 1 from public.service_bookings b where b.mechanic_id=new.mechanic_id and b.id!=new.id
    and b.status in ('assigned','en_route','in_progress')
    and tstzrange(b.scheduled_at,greatest(b.scheduled_at + make_interval(mins=>30+greatest(30,coalesce(
      (select sum(s.estimated_duration_minutes*i.quantity)::int from public.service_booking_items i
      join public.mechanic_services s on s.id=i.mechanic_service_id where i.service_booking_id=b.id),60))),
      case when b.status in ('en_route','in_progress') then now()+interval '30 minutes' else b.scheduled_at end),'[)')
      && tstzrange(new.scheduled_at,new.scheduled_at+make_interval(mins=>duration+30),'[)')) then
    raise exception 'Mechanic already has a booking during this appointment';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_mechanic_capacity() from public,anon,authenticated;
create trigger enforce_mechanic_capacity before insert or update of mechanic_id,scheduled_at,status on public.service_bookings
for each row execute function public.enforce_mechanic_capacity();

-- Availability reads ignore expired unpaid holds and use the same interval as INSERT.
create or replace function public.unavailable_vehicles(p_start date,p_end date)
returns table(vehicle_id uuid) language sql security definer stable set search_path=public as $$
select v.id from public.vehicles v where v.is_active and exists(select 1 from public.vehicle_bookings b
 where b.vehicle_id=v.id and b.status in ('pending','confirmed','in_progress')
 and (b.status!='pending' or b.hold_expires_at is null or b.hold_expires_at>now()
   or exists(select 1 from public.payments p where p.booking_type='vehicle' and p.booking_id=b.id and p.status='succeeded'))
 and daterange(b.start_date,b.end_date,'[)') && daterange(p_start,p_end,'[)'));
$$;
create or replace function public.available_vehicles(p_start date,p_end date)
returns table(vehicle_id uuid,busy boolean) language sql security definer stable set search_path=public as $$
select id,false from public.vehicles where is_active and id not in(select vehicle_id from public.unavailable_vehicles(p_start,p_end));
$$;

-- Signed provider events are reconciled as one transaction, monotonically.
create or replace function public.reconcile_payment(p_payment_id uuid,p_status public.payment_status)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.payments; booking_state public.booking_status;
begin
  select * into p from public.payments where id=p_payment_id for update;
  if not found then raise exception 'Payment record not yet available'; end if;
  if p.status='refunded' or (p.status='succeeded' and p_status='failed') then return jsonb_build_object('ignored',true); end if;
  if p_status not in ('failed','succeeded','refunded') then raise exception 'Unsupported payment state'; end if;
  if p.booking_type='vehicle' then
    select status into booking_state from public.vehicle_bookings where id=p.booking_id for update;
    if not found then raise exception 'Booking not found'; end if;
    if p_status='succeeded' and booking_state='pending' then
      update public.vehicle_bookings set status='confirmed',hold_expires_at=null where id=p.booking_id;
    end if;
  else
    select status into booking_state from public.service_bookings where id=p.booking_id for update;
    if not found then raise exception 'Booking not found'; end if;
  end if;
  if p.status is distinct from p_status then update public.payments set status=p_status where id=p.id; end if;
  if p_status='succeeded' and booking_state='cancelled' and p.status!='succeeded' then
    insert into public.notifications(user_id,type,title,body,metadata)
    select id,'payment_attention','Payment received for a cancelled booking',
      'Review this transaction and arrange a refund before resolving the booking.',
      jsonb_build_object('payment_id',p.id,'booking_id',p.booking_id,'booking_type',p.booking_type,'requires_refund',true)
    from public.profiles where role='admin';
  end if;
  return jsonb_build_object('status',p_status,'requires_refund',p_status='succeeded' and booking_state='cancelled');
end;
$$;
revoke all on function public.reconcile_payment(uuid,public.payment_status) from public, anon, authenticated;
grant execute on function public.reconcile_payment(uuid,public.payment_status) to service_role;

-- Service-role-only provider resume data; no client SELECT grant for secrets.
create table public.payment_checkout_sessions (
  payment_id uuid primary key references public.payments(id) on delete cascade,
  client_secret text not null,
  checkout_url text,
  created_at timestamptz not null default now()
);
alter table public.payment_checkout_sessions enable row level security;
revoke all on public.payment_checkout_sessions from anon, authenticated;
grant all on public.payment_checkout_sessions to service_role;

-- One provider-creation request per booking at a time, including multiple tabs.
create table public.payment_checkout_locks (
  booking_type public.booking_type not null,
  booking_id uuid not null,
  token uuid not null,
  expires_at timestamptz not null,
  primary key(booking_type,booking_id)
);
alter table public.payment_checkout_locks enable row level security;
revoke all on public.payment_checkout_locks from anon,authenticated;
grant all on public.payment_checkout_locks to service_role;
create function public.acquire_checkout_lock(p_type public.booking_type,p_id uuid,p_token uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare acquired uuid;
begin
  insert into public.payment_checkout_locks(booking_type,booking_id,token,expires_at)
  values(p_type,p_id,p_token,now()+interval '5 minutes')
  on conflict(booking_type,booking_id) do update set token=excluded.token,expires_at=excluded.expires_at
    where payment_checkout_locks.expires_at<now()
  returning token into acquired;
  return acquired is not null;
end;
$$;
create function public.release_checkout_lock(p_type public.booking_type,p_id uuid,p_token uuid)
returns void language sql security definer set search_path=public as $$
  delete from public.payment_checkout_locks where booking_type=p_type and booking_id=p_id and token=p_token;
$$;
revoke all on function public.acquire_checkout_lock(public.booking_type,uuid,uuid) from public,anon,authenticated;
revoke all on function public.release_checkout_lock(public.booking_type,uuid,uuid) from public,anon,authenticated;
grant execute on function public.acquire_checkout_lock(public.booking_type,uuid,uuid) to service_role;
grant execute on function public.release_checkout_lock(public.booking_type,uuid,uuid) to service_role;

-- Receipt delivery is rate limited using a durable, private attempt record.
create table public.payment_receipt_deliveries (
  payment_id uuid primary key references public.payments(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
alter table public.payment_receipt_deliveries enable row level security;
revoke all on public.payment_receipt_deliveries from anon,authenticated;
grant all on public.payment_receipt_deliveries to service_role;
create function public.reserve_receipt_delivery(p_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare acquired uuid;
begin
  insert into public.payment_receipt_deliveries(payment_id) values(p_id)
  on conflict(payment_id) do update set attempted_at=now()
    where payment_receipt_deliveries.attempted_at<now()-interval '1 minute'
  returning payment_id into acquired;
  return acquired is not null;
end;
$$;
revoke all on function public.reserve_receipt_delivery(uuid) from public,anon,authenticated;
grant execute on function public.reserve_receipt_delivery(uuid) to service_role;

-- The trigger sends an authenticated request, never a trusted-looking JSON shape.
-- Set this secret in Supabase Vault before enabling SMS dispatch.
create or replace function public.dispatch_notification_on_insert()
returns trigger language plpgsql security definer set search_path=public,extensions as $$
declare endpoint text; dispatch_token text;
begin
  if not(coalesce(new.metadata->>'dispatch_sms','false')='true'
    or coalesce(new.metadata->>'new_status','')='assigned' or new.title ilike '%assigned%') then return new; end if;
  select decrypted_secret into endpoint from vault.decrypted_secrets where name='notification_dispatch_url' limit 1;
  select decrypted_secret into dispatch_token from vault.decrypted_secrets where name='notification_dispatch_token' limit 1;
  if endpoint is null or dispatch_token is null then
    raise warning 'Notification delivery is not configured in Vault'; return new;
  end if;
  perform net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||dispatch_token),
    body:=jsonb_build_object('notification_id',new.id));
  return new;
exception when others then raise warning 'Notification delivery scheduling failed: %',sqlerrm; return new;
end;
$$;
