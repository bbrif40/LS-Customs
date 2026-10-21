create type public.service_checkout_state as enum ('legacy','offering','awaiting_payment','confirmed','expired');
create table public.service_operating_hours (
  id boolean primary key default true check(id),
  scheduled_open time not null default '08:00', scheduled_close time not null default '18:00',
  roadside_open time not null default '08:00', roadside_close time not null default '18:00',
  check(scheduled_close>scheduled_open),check(roadside_close>roadside_open)
);
insert into public.service_operating_hours(id) values(true);
alter table public.service_operating_hours enable row level security;
create policy hours_read on public.service_operating_hours for select using(true);
create policy hours_admin_update on public.service_operating_hours for update to authenticated using(public.is_admin()) with check(public.is_admin());
grant select on public.service_operating_hours to anon,authenticated;
grant update on public.service_operating_hours to authenticated;
grant all on public.service_operating_hours to service_role;
create type public.mechanic_offer_state as enum ('pending','accepted','declined','closed','expired');
alter table public.service_bookings add column checkout_state public.service_checkout_state not null default 'legacy';
alter table public.service_bookings add column payment_method text not null default 'online' check(payment_method in ('online','cash'));
alter table public.service_bookings add column offer_deadline timestamptz;
alter table public.service_bookings add column hold_expires_at timestamptz;

create table public.mechanic_offers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.service_bookings(id),
  mechanic_id uuid not null references public.mechanic_profiles(id),
  state public.mechanic_offer_state not null default 'pending',
  expires_at timestamptz not null,
  responded_at timestamptz,
  unique(booking_id,mechanic_id)
);
alter table public.mechanic_offers enable row level security;
create policy offer_read on public.mechanic_offers for select to authenticated using(mechanic_id=auth.uid() or public.is_admin()
  or exists(select 1 from service_bookings b where b.id=booking_id and b.customer_id=auth.uid()));
grant select on public.mechanic_offers to authenticated;

create table public.mechanic_capacity (
  booking_id uuid primary key references public.service_bookings(id),
  mechanic_id uuid not null references public.mechanic_profiles(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  expires_at timestamptz,
  check(ends_at>starts_at),
  exclude using gist(mechanic_id with =,tstzrange(starts_at,ends_at,'[)') with &&)
);
alter table public.mechanic_capacity enable row level security;
create policy capacity_read on public.mechanic_capacity for select to authenticated using(mechanic_id=auth.uid() or public.is_admin());
grant select on public.mechanic_capacity to authenticated;
grant all on public.mechanic_offers,public.mechanic_capacity to service_role;

-- ponytail: straight-line travel at 20 km/h plus 10 minutes, minimum 30;
-- replace with a route-provider estimate when traffic precision is required.
create function public.mechanic_travel_minutes(p_mechanic uuid,p_lat double precision,p_lng double precision)
returns integer language sql stable security definer set search_path=public as $$
  select greatest(30,ceil(public.distance_km(current_lat,current_lng,p_lat,p_lng)/20*60+10)::integer)
    from mechanic_profiles where id=p_mechanic and current_lat is not null and current_lng is not null;
$$;
revoke all on function public.mechanic_travel_minutes(uuid,double precision,double precision) from public,anon,authenticated;

create function public.offer_booking_mechanics(p_booking_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b service_bookings; duration integer;
begin
  select * into b from service_bookings where id=p_booking_id for update;
  if not found or (auth.uid() is not null and b.customer_id<>auth.uid() and not coalesce(public.is_admin(),false)) then
    raise exception 'Booking access denied' using errcode='42501'; end if;
  if b.checkout_state<>'offering' or b.offer_deadline<=now() then raise exception 'Offer round is not active'; end if;
  duration:=greatest(30,coalesce((select sum(s.estimated_duration_minutes*i.quantity) from service_booking_items i
    join mechanic_services s on s.id=i.mechanic_service_id where i.service_booking_id=b.id),60));
  insert into mechanic_offers(booking_id,mechanic_id,expires_at)
    select b.id,m.id,b.offer_deadline from mechanic_profiles m where m.is_available
    and m.current_lat is not null and m.current_lng is not null
    and (not b.is_emergency or ((now()+make_interval(mins=>duration+public.mechanic_travel_minutes(m.id,b.pin_lat,b.pin_lng))) at time zone 'Asia/Manila')::time
      <=(select roadside_close from service_operating_hours where id))
    and not exists(select 1 from mechanic_capacity c where c.mechanic_id=m.id and (c.expires_at is null or c.expires_at>now())
      and tstzrange(c.starts_at,c.ends_at,'[)') && tstzrange(b.scheduled_at,b.scheduled_at+make_interval(mins=>duration+30),'[)'))
    and not exists(select 1 from service_bookings s where s.mechanic_id=m.id and s.id<>b.id and s.status in ('assigned','en_route','in_progress')
      and tstzrange(s.scheduled_at,greatest(s.scheduled_at+make_interval(mins=>30+greatest(30,coalesce((select sum(ms.estimated_duration_minutes*i.quantity)::integer from service_booking_items i join mechanic_services ms on ms.id=i.mechanic_service_id where i.service_booking_id=s.id),60))),case when s.status in ('en_route','in_progress') then now()+interval '30 minutes' else s.scheduled_at end),'[)') && tstzrange(b.scheduled_at,b.scheduled_at+make_interval(mins=>duration+30),'[)'))
    on conflict(booking_id,mechanic_id) do nothing;
  return jsonb_build_object('service_booking_id',b.id,'status','offering','offer_deadline',b.offer_deadline);
end $$;

alter function public.create_service_booking(uuid,uuid,timestamptz,uuid,double precision,double precision,text,text,text) rename to create_service_booking_legacy;
revoke all on function public.create_service_booking_legacy(uuid,uuid,timestamptz,uuid,double precision,double precision,text,text,text) from public,anon,authenticated;
create function public.create_service_booking(p_request_id uuid,p_service_id uuid,p_scheduled_at timestamptz,
  p_address_id uuid default null,p_lat double precision default null,p_lng double precision default null,
  p_notes text default null,p_promo_code text default null,p_emergency text default null,p_payment_method text default 'online')
returns public.service_bookings language plpgsql security definer set search_path=public as $$
declare b service_bookings; duration integer; local_start timestamp; opening time; closing time;
begin
  if p_payment_method is null or p_payment_method not in ('online','cash') then raise exception 'Choose online or cash'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_request_id::text,0));
  select * into b from service_bookings where customer_id=auth.uid() and request_id=p_request_id;
  if found then return b; end if;
  duration:=case when p_emergency is not null then 60 else coalesce((select estimated_duration_minutes from mechanic_services where id=p_service_id),60) end;
  local_start:=(case when p_emergency is not null then now() else p_scheduled_at end) at time zone 'Asia/Manila';
  select case when p_emergency is not null then roadside_open else scheduled_open end,
    case when p_emergency is not null then roadside_close else scheduled_close end into opening,closing from service_operating_hours where id;
  if local_start::time<opening or (local_start+make_interval(mins=>duration+case when p_emergency is not null then 30 else 0 end))::time>closing
    or (local_start+make_interval(mins=>duration))::date<>local_start::date then raise exception 'Choose a time allowing travel and work within 8 AM to 6 PM Philippine time'; end if;
  b:=public.create_service_booking_legacy(p_request_id,p_service_id,p_scheduled_at,p_address_id,p_lat,p_lng,p_notes,p_promo_code,p_emergency);
  update service_bookings set checkout_state='offering',payment_method=p_payment_method,offer_deadline=now()+interval '5 minutes' where id=b.id returning * into b;
  perform public.offer_booking_mechanics(b.id);
  return b;
end $$;

create function public.respond_mechanic_offer(p_offer uuid,p_accept boolean)
returns uuid language plpgsql security definer set search_path=public as $$
declare offer mechanic_offers; b service_bookings; duration integer; travel integer; finish timestamp;
begin
  select * into offer from mechanic_offers where id=p_offer and mechanic_id=auth.uid();
  if not found then raise exception 'Offer access denied' using errcode='42501'; end if;
  select * into b from service_bookings where id=offer.booking_id for update;
  select * into offer from mechanic_offers where id=p_offer for update;
  if offer.state='accepted' and b.mechanic_id=auth.uid() then return b.id; end if;
  if offer.state<>'pending' or offer.expires_at<=now() or b.checkout_state<>'offering' or b.mechanic_id is not null then raise exception 'Offer is no longer available'; end if;
  if not p_accept then update mechanic_offers set state='declined',responded_at=now() where id=offer.id; return b.id; end if;
  perform 1 from mechanic_profiles where id=auth.uid() and is_available for update;
  if not found then raise exception 'Mechanic is not available'; end if;
  duration:=greatest(30,coalesce((select sum(s.estimated_duration_minutes*i.quantity) from service_booking_items i
    join mechanic_services s on s.id=i.mechanic_service_id where i.service_booking_id=b.id),60));
  travel:=case when b.is_emergency then public.mechanic_travel_minutes(auth.uid(),b.pin_lat,b.pin_lng) else 30 end;
  finish:=(now()+make_interval(mins=>duration+travel)) at time zone 'Asia/Manila';
  if b.is_emergency and (travel is null or finish::date<>(now() at time zone 'Asia/Manila')::date
    or finish::time>(select roadside_close from service_operating_hours where id)) then
    raise exception 'Travel and service no longer fit within roadside operating hours'; end if;
  delete from mechanic_capacity where mechanic_id=auth.uid() and expires_at<=now();
  if exists(select 1 from service_bookings s where s.mechanic_id=auth.uid() and s.id<>b.id and s.status in ('assigned','en_route','in_progress')
    and tstzrange(s.scheduled_at,greatest(s.scheduled_at+make_interval(mins=>30+greatest(30,coalesce((select sum(ms.estimated_duration_minutes*i.quantity)::integer from service_booking_items i join mechanic_services ms on ms.id=i.mechanic_service_id where i.service_booking_id=s.id),60))),case when s.status in ('en_route','in_progress') then now()+interval '30 minutes' else s.scheduled_at end),'[)') && tstzrange(b.scheduled_at,b.scheduled_at+make_interval(mins=>duration+30),'[)')) then
    raise exception 'Mechanic already has a booking during this appointment';
  end if;
  insert into mechanic_capacity(booking_id,mechanic_id,starts_at,ends_at,expires_at)
    values(b.id,auth.uid(),b.scheduled_at,b.scheduled_at+make_interval(mins=>duration+travel),case when b.payment_method='online' then now()+interval '10 minutes' end);
  update mechanic_offers set state=case when id=offer.id then 'accepted'::mechanic_offer_state else 'closed'::mechanic_offer_state end,
    responded_at=now() where booking_id=b.id and state='pending';
  update service_bookings set mechanic_id=auth.uid(),checkout_state=case when payment_method='cash' then 'confirmed'::service_checkout_state else 'awaiting_payment'::service_checkout_state end,
    status=case when payment_method='cash' then 'assigned'::booking_status else 'pending'::booking_status end,
    hold_expires_at=case when payment_method='online' then now()+interval '10 minutes' end where id=b.id;
  perform public.notify_workflow(b.customer_id,'Mechanic accepted',case when b.payment_method='cash' then 'Confirmed. Cash is due after service.'
    else 'Your mechanic accepted. Proceed to online payment now; complete checkout within 10 minutes.' end,b.id,'service');
  return b.id;
end $$;

create function public.confirm_service_cash(p_booking uuid)
returns void language plpgsql security definer set search_path=public as $$
declare b service_bookings;
begin
  select * into b from service_bookings where id=p_booking and customer_id=auth.uid() for update;
  if not found then raise exception 'Booking access denied' using errcode='42501'; end if;
  perform public.require_transaction_terms(b.id,'payment',auth.uid());
  if b.checkout_state<>'awaiting_payment' or b.hold_expires_at<=now() or b.mechanic_id is null then raise exception 'Checkout hold expired'; end if;
  if exists(select 1 from payments where booking_type='service' and booking_id=b.id and status in ('pending','succeeded')) then
    raise exception 'Wait for the online payment outcome before switching to cash'; end if;
  update service_bookings set payment_method='cash',checkout_state='confirmed',status='assigned',hold_expires_at=null where id=b.id;
  update mechanic_capacity set expires_at=null where booking_id=b.id;
end $$;

create function public.record_service_cash(p_booking uuid,p_request uuid)
returns void language plpgsql security definer set search_path=public as $$
declare b service_bookings;
begin
  select * into b from service_bookings where id=p_booking for update;
  if not found or (b.mechanic_id is distinct from auth.uid() and not coalesce(public.is_admin(),false)) then raise exception 'Collection access denied' using errcode='42501'; end if;
  if b.payment_method<>'cash' or b.status<>'completed' then raise exception 'Cash is collected after service completion'; end if;
  if exists(select 1 from payments where booking_type='service' and booking_id=b.id and status='succeeded' and account_quote_id is null) then return; end if;
  insert into payments(id,booking_type,booking_id,customer_id,amount,provider,status)
    values(p_request,'service',b.id,b.customer_id,b.total_price,'cash','succeeded');
  update operations_queue set closed_at=now() where source_key='service_cash:'||b.id;
  insert into admin_audit_logs(admin_id,action_type,record_type,record_id,details)
    values(auth.uid(),'cash_collection','service_booking',b.id::text,jsonb_build_object('amount',b.total_price,'before','unpaid','after','paid'));
end $$;

create function public.sync_service_checkout() returns trigger language plpgsql security definer set search_path=public as $$
declare b service_bookings;
begin
  if new.booking_type<>'service' or new.status<>'succeeded' or new.account_quote_id is not null or new.provider='cash' then return new; end if;
  select * into b from service_bookings where id=new.booking_id for update;
  if b.checkout_state='legacy' then return new; end if;
  if b.checkout_state='awaiting_payment' and b.hold_expires_at>now() then
    update service_bookings set checkout_state='confirmed',status='assigned',hold_expires_at=null where id=b.id;
    update mechanic_capacity set expires_at=null where booking_id=b.id;
  elsif b.checkout_state<>'confirmed' then
    update service_bookings set checkout_state='expired',status='cancelled' where id=b.id;
    delete from mechanic_capacity where booking_id=b.id;
    insert into operations_queue(source_key,kind,customer_id,booking_id,title,details)
      values('refund:'||new.id,'refund_required',b.customer_id,b.id,'Full refund: mechanic checkout expired',
        jsonb_build_object('payment_id',new.id,'amount',new.amount,'percentage',100)) on conflict(source_key) do nothing;
  end if;
  return new;
end $$;
create trigger service_online_checkout after insert or update of status on public.payments for each row execute function public.sync_service_checkout();

create function public.release_service_capacity() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status in ('completed','cancelled') then
    delete from mechanic_capacity where booking_id=new.id;
    update mechanic_offers set state='closed' where booking_id=new.id and state='pending';
  end if;
  if new.status='completed' and new.payment_method='cash' and not exists(select 1 from payments
    where booking_type='service' and booking_id=new.id and account_quote_id is null and status='succeeded') then
    insert into operations_queue(source_key,kind,customer_id,booking_id,title)
      values('service_cash:'||new.id,'cash_unpaid',new.customer_id,new.id,'Completed service: cash unpaid') on conflict(source_key) do nothing;
  end if;
  return new;
end $$;
create trigger service_capacity_release after update of status on public.service_bookings for each row execute function public.release_service_capacity();

revoke all on function public.offer_booking_mechanics(uuid),public.respond_mechanic_offer(uuid,boolean),public.confirm_service_cash(uuid),public.record_service_cash(uuid,uuid),
  public.create_service_booking(uuid,uuid,timestamptz,uuid,double precision,double precision,text,text,text,text) from public,anon;
grant execute on function public.offer_booking_mechanics(uuid),public.respond_mechanic_offer(uuid,boolean),public.confirm_service_cash(uuid),public.record_service_cash(uuid,uuid),
  public.create_service_booking(uuid,uuid,timestamptz,uuid,double precision,double precision,text,text,text,text) to authenticated;
grant execute on function public.offer_booking_mechanics(uuid) to service_role;

create or replace function public.require_payable_checkout(p_type public.booking_type,p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare b vehicle_bookings; s service_bookings; l driver_licenses;
begin
  if p_type='vehicle' then
    select * into b from vehicle_bookings where id=p_id;
    if b.checkout_state<>'legacy' then
      select * into l from driver_licenses where id=b.license_id;
      if b.checkout_state<>'awaiting_payment' or b.payment_method<>'online' or b.hold_expires_at<=now()
        or l.state is distinct from 'approved' or l.expires_on<(b.return_at at time zone 'Asia/Manila')::date
        or l.identity_name<>(select full_name from profiles where id=b.customer_id) then raise exception 'Approved valid license and active online checkout required'; end if;
    end if;
  else
    select * into s from service_bookings where id=p_id;
    if s.checkout_state<>'legacy' and (s.checkout_state<>'awaiting_payment' or s.payment_method<>'online'
      or s.mechanic_id is null or s.hold_expires_at<=now()) then raise exception 'Mechanic acceptance and active online checkout required'; end if;
  end if;
end $$;

create function public.guard_service_checkout() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.checkout_state<>'legacy' and new.status in ('assigned','en_route','in_progress','completed') and new.checkout_state<>'confirmed' then
    raise exception 'Mechanic acceptance and checkout confirmation are required';
  end if;
  return new;
end $$;
create trigger service_checkout_guard before update on public.service_bookings for each row execute function public.guard_service_checkout();

alter function public.run_account_maintenance() rename to run_rental_account_maintenance;
revoke all on function public.run_rental_account_maintenance() from public,anon,authenticated;
create function public.run_account_maintenance() returns void language plpgsql security definer set search_path=public as $$
declare b service_bookings;
begin
  perform public.run_rental_account_maintenance();
  for b in select * from service_bookings where status='pending' and ((checkout_state='offering' and offer_deadline<=now())
    or (checkout_state='awaiting_payment' and hold_expires_at<=now())) for update skip locked loop
    update service_bookings set status='cancelled',checkout_state='expired' where id=b.id;
    update mechanic_offers set state='expired' where booking_id=b.id and state='pending';
    delete from mechanic_capacity where booking_id=b.id;
    perform public.notify_workflow(b.customer_id,'Mechanic request expired','No confirmation was completed. Retry with a fresh availability check, choose another time, or contact support.',b.id,'service');
    if b.is_emergency then
      insert into operations_queue(source_key,kind,customer_id,booking_id,title)
        values('roadside_failed:'||b.id,'roadside_unassigned',b.customer_id,b.id,'Roadside request could not be confirmed') on conflict(source_key) do nothing;
    end if;
  end loop;
end $$;
revoke all on function public.run_account_maintenance() from public,anon,authenticated;
grant execute on function public.run_account_maintenance() to service_role;
