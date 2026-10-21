create type public.license_review_state as enum ('pending','unreadable','approved','rejected');
create type public.rental_checkout_state as enum ('legacy','license_pending','awaiting_payment','cash_confirmed','paid','expired','rejected');
create table public.driver_licenses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  object_path text not null unique,
  identity_name text not null,
  state public.license_review_state not null default 'pending',
  expires_on date,
  review_reason text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.driver_licenses enable row level security;
create policy license_read on public.driver_licenses for select to authenticated using(customer_id=auth.uid() or public.is_admin());
grant select on public.driver_licenses to authenticated;
grant all on public.driver_licenses to service_role;

alter table public.vehicle_bookings add column license_id uuid references public.driver_licenses(id);
alter table public.vehicle_bookings add column checkout_state public.rental_checkout_state not null default 'legacy';
alter table public.vehicle_bookings add column payment_method text not null default 'online' check(payment_method in ('online','cash'));
alter table public.vehicle_bookings add column review_deadline timestamptz;
alter table public.vehicle_bookings add column pickup_deadline timestamptz;
alter table public.vehicle_bookings add column arrived_at timestamptz;
alter table public.vehicle_bookings drop constraint no_overlapping_bookings;
alter table public.vehicle_bookings add constraint no_overlapping_bookings exclude using gist
  (vehicle_id with =,tstzrange(pickup_at,return_at,'[)') with &&) where(status in ('pending','confirmed','in_progress'));

create function public.notify_workflow(p_customer uuid,p_title text,p_body text,p_booking uuid,p_type text)
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into notifications(user_id,type,title,body,metadata) values(p_customer,'workflow_decision',p_title,p_body,
    jsonb_build_object('booking_id',p_booking,'booking_type',p_type,'in_app_delivered_at',now(),'email_required',true));
end $$;
revoke all on function public.notify_workflow(uuid,text,text,uuid,text) from public,anon,authenticated;

drop function public.create_vehicle_booking(uuid,uuid,date,date,text);
create function public.create_vehicle_booking(p_request_id uuid,p_vehicle_id uuid,p_start date,p_end date,p_promo_code text default null,
  p_pickup_time time default '08:00',p_return_time time default '08:00',p_payment_method text default 'online')
returns public.vehicle_bookings language plpgsql security definer set search_path=public as $$
declare b vehicle_bookings; license driver_licenses; pickup timestamptz; expected_return timestamptz; rate numeric; days integer;
begin
  if auth.uid() is null then raise exception 'Sign in to book' using errcode='42501'; end if;
  if p_request_id is null or p_start is null or p_end is null or p_end<=p_start then raise exception 'Choose valid rental dates and a request reference'; end if;
  if p_payment_method not in ('online','cash') or p_payment_method is null then raise exception 'Choose online or cash'; end if;
  if p_pickup_time<time '08:00' or p_pickup_time>time '18:00' or p_return_time<time '08:00' or p_return_time>time '18:00'
    or p_pickup_time is null or p_return_time is null then raise exception 'Pickup and return hours are 8 AM to 6 PM Philippine time'; end if;
  pickup:=(p_start+p_pickup_time) at time zone 'Asia/Manila'; expected_return:=(p_end+p_return_time) at time zone 'Asia/Manila';
  if pickup<=now() or expected_return<=pickup or expected_return-pickup>interval '30 days' then raise exception 'Choose future rental times within 30 days'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_request_id::text,0));
  select * into b from vehicle_bookings where customer_id=auth.uid() and request_id=p_request_id;
  if found then return b; end if;
  perform 1 from profiles where id=auth.uid() for update;
  -- Expiry is also applied here, so a delayed scheduler cannot keep fleet capacity locked.
  update vehicle_bookings set status='cancelled',checkout_state='expired' where vehicle_id=p_vehicle_id
    and checkout_state in ('license_pending','awaiting_payment') and hold_expires_at<=now();
  days:=greatest(1,ceil(extract(epoch from(expected_return-pickup))/86400));
  select price_per_day into rate from vehicles where id=p_vehicle_id and is_active for update;
  if not found then raise exception 'Vehicle is unavailable'; end if;
  if (select count(*) from vehicle_bookings where customer_id=auth.uid() and status='pending')>=3 then raise exception 'Complete or cancel your existing reservations before booking again'; end if;
  select * into license from driver_licenses where customer_id=auth.uid() and state='approved' and superseded_at is null
    and expires_on>=p_end and identity_name=(select full_name from profiles where id=auth.uid()) order by reviewed_at desc limit 1;
  insert into vehicle_bookings(vehicle_id,customer_id,start_date,end_date,pickup_at,return_at,total_price,payment_method,
    license_id,review_deadline,checkout_state,status,pickup_deadline,hold_expires_at,request_id,pickup_location)
  values(p_vehicle_id,auth.uid(),p_start,p_end,pickup,expected_return,
    public.discounted_booking_total(rate*days,p_promo_code,'vehicle'),p_payment_method,
    license.id,case when license.id is null then now()+interval '1 hour' end,
    case when license.id is null then 'license_pending'::rental_checkout_state
      when p_payment_method='cash' then 'cash_confirmed'::rental_checkout_state else 'awaiting_payment'::rental_checkout_state end,
    case when license.id is not null and p_payment_method='cash' then 'confirmed'::booking_status else 'pending'::booking_status end,
    pickup+interval '3 hours',case when license.id is null then now()+interval '1 hour'
      when p_payment_method='cash' then null else now()+interval '3 hours' end,p_request_id,'Showroom pickup') returning * into b;
  if license.id is null then
    insert into operations_queue(source_key,kind,customer_id,booking_id,title,due_at)
      values('license:'||b.id,'license_review',b.customer_id,b.id,'Driver license upload / review required',b.review_deadline);
  else
    perform public.notify_workflow(b.customer_id,'Approved license reused for rental',case when p_payment_method='online'
      then 'Your approved license is valid for this rental. Proceed to online payment within 3 hours. Deadline: '||b.hold_expires_at::text
      else 'Cash reservation confirmed. Pay before handover on pickup day. Customer cancellation is unavailable.' end,b.id,'vehicle');
  end if;
  return b;
end $$;
revoke all on function public.create_vehicle_booking(uuid,uuid,date,date,text,time,time,text) from public,anon;
grant execute on function public.create_vehicle_booking(uuid,uuid,date,date,text,time,time,text) to authenticated;

create function public.submit_rental_license(p_booking uuid,p_object_path text)
returns uuid language plpgsql security definer set search_path=public as $$
declare b vehicle_bookings; result uuid;
begin
  select * into b from vehicle_bookings where id=p_booking and customer_id=auth.uid() for update;
  if not found then raise exception 'Booking access denied' using errcode='42501'; end if;
  if b.checkout_state<>'license_pending' or b.review_deadline<=now() then raise exception 'License review hold has expired'; end if;
  if p_object_path not like auth.uid()::text||'/%' or length(p_object_path)>200 then raise exception 'Invalid license upload'; end if;
  if not exists(select 1 from storage.objects where bucket_id='driver-licenses' and name=p_object_path) then raise exception 'Upload the license first'; end if;
  insert into driver_licenses(customer_id,object_path,identity_name)
    values(auth.uid(),p_object_path,(select full_name from profiles where id=auth.uid())) returning id into result;
  update vehicle_bookings set license_id=result where id=b.id;
  update operations_queue set title='Driver license ready for review',details=jsonb_build_object('license_id',result)
    where source_key='license:'||b.id;
  return result;
end $$;

create function public.review_rental_license(p_booking uuid,p_state public.license_review_state,p_expires_on date,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare b vehicle_bookings; l driver_licenses;
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Administrator access required' using errcode='42501'; end if;
  select * into b from vehicle_bookings where id=p_booking for update;
  if not found or b.checkout_state<>'license_pending' or b.review_deadline<=now() then raise exception 'License review hold is not active'; end if;
  select * into l from driver_licenses where id=b.license_id for update;
  if not found then raise exception 'Customer has not uploaded a license'; end if;
  if p_state not in ('approved','unreadable','rejected') or length(trim(coalesce(p_reason,'')))<3 then raise exception 'Select an outcome and enter a reason'; end if;
  if p_state='approved' and (p_expires_on is null or p_expires_on<(b.return_at at time zone 'Asia/Manila')::date
    or l.identity_name<>(select full_name from profiles where id=b.customer_id)) then raise exception 'License must match the customer and remain valid through return'; end if;
  update driver_licenses set state=p_state,expires_on=p_expires_on,review_reason=p_reason,reviewed_by=auth.uid(),reviewed_at=now() where id=l.id;
  if p_state='approved' then
    update vehicle_bookings set checkout_state=case when payment_method='cash' then 'cash_confirmed'::rental_checkout_state else 'awaiting_payment'::rental_checkout_state end,
      status=case when payment_method='cash' then 'confirmed'::booking_status else 'pending'::booking_status end,
      hold_expires_at=case when payment_method='cash' then null else now()+interval '3 hours' end where id=b.id;
    perform public.notify_workflow(b.customer_id,'Driver license approved',case when b.payment_method='cash'
      then 'Your cash reservation is confirmed. Pay at pickup before vehicle handover. Customer cancellation is unavailable.'
      else 'Your ID has been approved. Proceed to online payment as soon as possible, within 3 hours of approval. Deadline: '||(now()+interval '3 hours')::text end,b.id,'vehicle');
  elsif p_state='rejected' then
    update vehicle_bookings set status='cancelled',checkout_state='rejected' where id=b.id;
    perform public.notify_workflow(b.customer_id,'Driver license rejected',p_reason||'. The vehicle has been released; submit a new request with a valid matching license.',b.id,'vehicle');
  else
    perform public.notify_workflow(b.customer_id,'License image unreadable',p_reason||'. Upload a replacement before '||b.review_deadline::text||'. The review deadline has not changed.',b.id,'vehicle');
  end if;
  if p_state<>'unreadable' then update operations_queue set closed_at=now() where source_key='license:'||b.id; end if;
  insert into admin_audit_logs(admin_id,action_type,record_type,record_id,details)
    values(auth.uid(),'license_review','vehicle_booking',b.id::text,jsonb_build_object('license_id',l.id,'before',to_jsonb(l),'after_state',p_state,'expires_on',p_expires_on,'reason',p_reason));
end $$;

create function public.guard_rental_checkout() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.checkout_state='legacy' then return new; end if;
  if new.status='in_progress' and old.status is distinct from new.status then
    if new.checkout_state<>'paid' or not exists(select 1 from driver_licenses l join profiles p on p.id=l.customer_id
      where l.id=new.license_id and l.state='approved' and l.identity_name=p.full_name and l.expires_on>=(new.return_at at time zone 'Asia/Manila')::date) then
      raise exception 'Verified license and collected payment are required before handover';
    end if;
  end if;
  return new;
end $$;
create trigger rental_checkout_guard before update on public.vehicle_bookings for each row execute function public.guard_rental_checkout();

create function public.record_rental_cash(p_booking uuid,p_request uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare b vehicle_bookings;
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Administrator access required' using errcode='42501'; end if;
  select * into b from vehicle_bookings where id=p_booking for update;
  if b.checkout_state='paid' then return; end if;
  if not found or b.checkout_state<>'cash_confirmed' or b.status<>'confirmed' or p_request is null
    or b.pickup_deadline<=now() and b.arrived_at is null or length(trim(coalesce(p_reason,'')))<3 then raise exception 'Cash reservation is not collectible'; end if;
  insert into payments(id,booking_type,booking_id,customer_id,amount,provider,status)
    values(p_request,'vehicle',b.id,b.customer_id,b.total_price,'cash','succeeded');
  update vehicle_bookings set checkout_state='paid',arrived_at=coalesce(arrived_at,now()) where id=b.id;
  insert into admin_audit_logs(admin_id,action_type,record_type,record_id,details)
    values(auth.uid(),'cash_collection','vehicle_booking',b.id::text,jsonb_build_object('amount',b.total_price,'reason',p_reason,'before',b.checkout_state,'after','paid'));
end $$;

revoke all on function public.submit_rental_license(uuid,text),public.review_rental_license(uuid,public.license_review_state,date,text),
  public.record_rental_cash(uuid,uuid,text) from public,anon;
grant execute on function public.submit_rental_license(uuid,text),public.review_rental_license(uuid,public.license_review_state,date,text),
  public.record_rental_cash(uuid,uuid,text) to authenticated;

create function public.require_payable_checkout(p_type public.booking_type,p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare b vehicle_bookings; l driver_licenses;
begin
  if p_type='vehicle' then
    select * into b from vehicle_bookings where id=p_id;
    if b.checkout_state<>'legacy' then
      select * into l from driver_licenses where id=b.license_id;
      if b.checkout_state<>'awaiting_payment' or b.payment_method<>'online' or b.hold_expires_at<=now()
        or l.state is distinct from 'approved' or l.expires_on<(b.return_at at time zone 'Asia/Manila')::date
        or l.identity_name<>(select full_name from profiles where id=b.customer_id) then
        raise exception 'An approved valid license and active online checkout are required';
      end if;
    end if;
  end if;
end $$;
revoke all on function public.require_payable_checkout(public.booking_type,uuid) from public,anon,authenticated;
grant execute on function public.require_payable_checkout(public.booking_type,uuid) to service_role;

create function public.sync_rental_online_checkout() returns trigger language plpgsql security definer set search_path=public as $$
declare b vehicle_bookings;
begin
  if new.booking_type<>'vehicle' or new.account_quote_id is not null or new.status<>'succeeded' or new.provider='cash' then return new; end if;
  select * into b from vehicle_bookings where id=new.booking_id for update;
  if b.checkout_state='legacy' then return new; end if;
  if b.status='cancelled' or b.checkout_state in ('expired','rejected') or b.hold_expires_at<=now() then
    update vehicle_bookings set status='cancelled',checkout_state='expired' where id=b.id;
    insert into operations_queue(source_key,kind,customer_id,booking_id,title,details)
      values('refund:'||new.id,'refund_required',b.customer_id,b.id,'Full refund: payment received after reservation expiry',
        jsonb_build_object('payment_id',new.id,'amount',new.amount,'percentage',100)) on conflict(source_key) do nothing;
  elsif b.checkout_state='awaiting_payment' then
    update vehicle_bookings set checkout_state='paid',status='confirmed',hold_expires_at=null where id=b.id;
  end if;
  return new;
end $$;
create trigger rental_online_checkout after insert or update of status on public.payments for each row execute function public.sync_rental_online_checkout();

create function public.run_account_maintenance() returns void language plpgsql security definer set search_path=public as $$
declare b vehicle_bookings; owner uuid;
begin
  for owner in select distinct customer_id from account_charges where amount>paid+waived loop
    perform public.refresh_customer_account(owner);
  end loop;
  for b in select * from vehicle_bookings where status in ('pending','confirmed') and (
    (checkout_state in ('license_pending','awaiting_payment') and hold_expires_at<=now())
    or (checkout_state='cash_confirmed' and pickup_deadline<=now() and arrived_at is null)) for update skip locked loop
    update vehicle_bookings set status='cancelled',checkout_state='expired' where id=b.id;
    update operations_queue set closed_at=now() where source_key='license:'||b.id;
    perform public.notify_workflow(b.customer_id,'Rental reservation expired','The reservation deadline passed. The vehicle has been released; please check availability before retrying.',b.id,'vehicle');
  end loop;
end $$;
revoke all on function public.run_account_maintenance() from public,anon,authenticated;
grant execute on function public.run_account_maintenance() to service_role;
