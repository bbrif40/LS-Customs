-- Admins may move service and rental bookings through their status workflow for
-- operations and demonstrations. Checkout, report, license, and return steps
-- remain enforced for customers and mechanics; payment records are untouched.

create or replace function public.guard_service_checkout()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if coalesce(public.is_admin(),false) then return new; end if;
  if new.checkout_state<>'legacy' and new.status in ('assigned','en_route','in_progress','completed') and new.checkout_state<>'confirmed' then
    raise exception 'Mechanic acceptance and checkout confirmation are required';
  end if;
  return new;
end $$;

create or replace function public.guard_service_completion_report()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if coalesce(public.is_admin(),false) then return new; end if;
  if new.checkout_state<>'legacy' and new.status='completed' and old.status is distinct from new.status
    and not exists(select 1 from booking_reports where booking_id=new.id and kind='service') then
    raise exception 'Save the service completion report before marking work complete';
  end if;
  return new;
end $$;

create or replace function public.guard_rental_checkout()
returns trigger language plpgsql security definer set search_path=public as $$
declare latest uuid;
begin
  if coalesce(public.is_admin(),false) then return new; end if;
  if new.checkout_state='legacy' then return new; end if;
  if new.status='in_progress' and old.status is distinct from new.status then
    if new.checkout_state<>'paid' or not exists(select 1 from driver_licenses l join profiles p on p.id=l.customer_id
      where l.id=new.license_id and l.state='approved' and l.identity_name=p.full_name and l.expires_on>=(new.return_at at time zone 'Asia/Manila')::date) then
      raise exception 'Verified license and collected payment are required before handover';
    end if;
    select id into latest from booking_reports where booking_id=new.id and kind='handover' order by version desc limit 1;
    if latest is null or not exists(select 1 from report_acknowledgements where report_id=latest) then
      raise exception 'Customer must acknowledge the latest handover report';
    end if;
  end if;
  if new.status='completed' and old.status is distinct from new.status
    and (new.actual_return_at is null or not exists(select 1 from booking_reports where booking_id=new.id and kind='return')) then
    raise exception 'Record the return condition report and actual return time before completing the rental';
  end if;
  return new;
end $$;

-- Manual assignment is an admin decision, so it may reassign or reopen any
-- booking and does not require the mechanic's availability flag. The assigned
-- mechanic must exist and all active booking/capacity collision checks remain.
-- Payment rows and the service's recorded checkout method are never rewritten.
create or replace function public.admin_assign_mechanic(p_booking uuid,p_mechanic uuid)
returns text language plpgsql security definer set search_path=public as $$
declare b service_bookings; duration integer; contact text; paid_total numeric; paid_online boolean;
begin
  if not coalesce(public.is_admin(),false) then
    raise exception 'Administrator access required' using errcode='42501';
  end if;

  select * into b from service_bookings where id=p_booking for update;
  if not found then raise exception 'Booking not found'; end if;
  perform 1 from mechanic_profiles where id=p_mechanic for update;
  if not found then raise exception 'Mechanic not found'; end if;

  duration:=greatest(30,coalesce((select sum(s.estimated_duration_minutes*i.quantity) from service_booking_items i
    join mechanic_services s on s.id=i.mechanic_service_id where i.service_booking_id=b.id),60));
  if exists(select 1 from service_bookings s where s.mechanic_id=p_mechanic and s.id<>b.id and s.status in ('assigned','en_route','in_progress')
    and tstzrange(s.scheduled_at,greatest(s.scheduled_at+make_interval(mins=>30+greatest(30,coalesce((select sum(ms.estimated_duration_minutes*i.quantity)::integer
      from service_booking_items i join mechanic_services ms on ms.id=i.mechanic_service_id where i.service_booking_id=s.id),60))),
      case when s.status in ('en_route','in_progress') then now()+interval '30 minutes' else s.scheduled_at end),'[)')
      && tstzrange(b.scheduled_at,b.scheduled_at+make_interval(mins=>duration+30),'[)')) then
    raise exception 'Mechanic already has a booking during this appointment';
  end if;

  select coalesce(sum(greatest(0,p.amount-p.refunded_amount-coalesce((
      select sum(f.amount) from workflow_refunds f where f.payment_id=p.id and f.state in ('pending','processing')),0))),0)
    into paid_total from payments p where p.booking_type='service' and p.booking_id=b.id
      and p.account_quote_id is null and p.status='succeeded';
  paid_online:=paid_total>=b.total_price;
  delete from mechanic_capacity where booking_id=b.id or (mechanic_id=p_mechanic and expires_at<=now());
  delete from mechanic_offers where booking_id=b.id and state<>'declined';
  insert into mechanic_capacity(booking_id,mechanic_id,starts_at,ends_at)
    values(b.id,p_mechanic,b.scheduled_at,b.scheduled_at+make_interval(mins=>duration+30));
  update service_bookings set mechanic_id=p_mechanic,status='assigned',
    checkout_state=case when checkout_state='legacy' then 'legacy'::service_checkout_state
      when payment_method='cash' or paid_online then 'confirmed'::service_checkout_state
      else 'awaiting_payment'::service_checkout_state end,
    offer_deadline=null,
    hold_expires_at=case when checkout_state<>'legacy' and payment_method='online' and not paid_online then now()+interval '3 hours' end
    where id=b.id;

  select coalesce(full_name,'Your mechanic')||coalesce(' (contact: '||nullif(trim(phone),'')||')','') into contact
    from profiles where id=p_mechanic;
  if b.checkout_state<>'legacy' then
    perform public.notify_workflow(b.customer_id,'Mechanic assigned',case
      when b.payment_method='cash' then contact||' is assigned. Cash remains due after service.'
      when paid_online then contact||' is assigned. The existing online payment remains recorded.'
      else contact||' is assigned. Complete online payment within 3 hours to keep this appointment.'
      end,b.id,'service');
  end if;
  insert into admin_audit_logs(admin_id,action_type,record_type,record_id,details)
    values(auth.uid(),'assign','service_booking',b.id::text,jsonb_build_object('mechanic_id',p_mechanic,
      'before',jsonb_build_object('status',b.status,'mechanic_id',b.mechanic_id,'checkout_state',b.checkout_state),
      'payment_status_preserved',paid_online));
  return 'assigned';
end $$;

-- Re-offer is also an explicit administrative recovery action: discard the
-- prior assignment/capacity, keep all payment and account history, then start a
-- fresh offer round. Offer selection still respects mechanic capacity.
create or replace function public.admin_reoffer_mechanics(p_booking uuid)
returns void language plpgsql security definer set search_path=public as $$
declare b service_bookings;
begin
  if not coalesce(public.is_admin(),false) then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  select * into b from service_bookings where id=p_booking for update;
  if not found then raise exception 'Booking not found'; end if;

  delete from mechanic_capacity where booking_id=b.id;
  delete from mechanic_offers where booking_id=b.id and state<>'declined';
  update service_bookings set mechanic_id=null,status='pending',checkout_state='offering',
    offer_deadline=now()+interval '5 minutes',hold_expires_at=null where id=b.id;
  insert into admin_audit_logs(admin_id,action_type,record_type,record_id,details)
    values(auth.uid(),'reoffer','service_booking',b.id::text,jsonb_build_object('before',
      jsonb_build_object('status',b.status,'mechanic_id',b.mechanic_id,'checkout_state',b.checkout_state),
      'payment_rows_preserved',true));
  perform public.offer_booking_mechanics(b.id);
end $$;

-- Admin review stays owner-bound and audited. Demo dates, visual matching, and
-- the review deadline are optional overrides for administrators.
create or replace function public.review_rental_license(
  p_booking uuid,p_state public.license_review_state,p_expires_on date,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare b vehicle_bookings; l driver_licenses; initial_review boolean; paid_total numeric;
begin
  if not coalesce(public.is_admin(),false) then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  select * into b from vehicle_bookings where id=p_booking for update;
  if not found or b.license_id is null then raise exception 'Customer has not uploaded a license'; end if;
  select * into l from driver_licenses where id=b.license_id for update;
  if not found or l.customer_id is distinct from b.customer_id then raise exception 'Uploaded license does not belong to the customer'; end if;
  if p_state not in ('approved','unreadable','rejected') or length(trim(coalesce(p_reason,'')))<3 then
    raise exception 'Select an outcome and enter a reason';
  end if;
  initial_review:=b.checkout_state='license_pending' and b.status='pending';

  update driver_licenses set state=p_state,expires_on=p_expires_on,review_reason=p_reason,
    reviewed_by=auth.uid(),reviewed_at=now() where id=l.id;
  if p_state='approved' then
    if initial_review then
      select coalesce(sum(greatest(0,p.amount-p.refunded_amount-coalesce((
          select sum(f.amount) from workflow_refunds f where f.payment_id=p.id and f.state in ('pending','processing')),0))),0)
        into paid_total from payments p where p.booking_type='vehicle' and p.booking_id=b.id
          and p.account_quote_id is null and p.status='succeeded';
      if paid_total>=b.total_price then
        update vehicle_bookings set checkout_state='paid',status='confirmed',hold_expires_at=null where id=b.id;
      elsif b.payment_method='cash' then
        update vehicle_bookings set checkout_state='cash_confirmed',status='confirmed',hold_expires_at=null where id=b.id;
      else
        update vehicle_bookings set checkout_state='awaiting_payment',status='pending',hold_expires_at=now()+interval '3 hours' where id=b.id;
      end if;
      perform public.notify_workflow(b.customer_id,'Driver license approved',case
        when paid_total>=b.total_price then 'Your license is approved and the existing payment remains recorded.'
        when b.payment_method='cash' then 'Your cash reservation is confirmed. Pay at pickup before vehicle handover. Customer cancellation is unavailable.'
        else 'Your ID has been approved. Proceed to online payment as soon as possible, within 3 hours of approval. Deadline: '||(now()+interval '3 hours')::text
        end,b.id,'vehicle');
    else
      perform public.notify_workflow(b.customer_id,'Driver license approved',
        'Your replacement license was approved. The existing rental status and payment remain unchanged.',b.id,'vehicle');
    end if;
  elsif p_state='rejected' then
    if initial_review then
      update vehicle_bookings set status='cancelled',checkout_state='rejected' where id=b.id;
      perform public.notify_workflow(b.customer_id,'Driver license rejected',p_reason||'. The vehicle has been released; submit a new request with a valid matching license.',b.id,'vehicle');
    else
      perform public.notify_workflow(b.customer_id,'Driver license rejected',
        p_reason||'. The rental status and payment remain unchanged. You may upload a replacement.',b.id,'vehicle');
    end if;
  else
    perform public.notify_workflow(b.customer_id,'License image unreadable',p_reason||'. Upload a replacement for review.',b.id,'vehicle');
  end if;
  if p_state<>'unreadable' then update operations_queue set closed_at=now() where source_key='license:'||b.id; end if;
  insert into admin_audit_logs(admin_id,action_type,record_type,record_id,details)
    values(auth.uid(),'license_review','vehicle_booking',b.id::text,jsonb_build_object('license_id',l.id,'before',to_jsonb(l),
      'after_state',p_state,'expires_on',p_expires_on,'reason',p_reason,'initial_review',initial_review,
      'identity_override',l.identity_name is distinct from (select full_name from profiles where id=b.customer_id),
      'expiry_override',p_expires_on is null or p_expires_on<(b.return_at at time zone 'Asia/Manila')::date,
      'review_window_expired',coalesce(b.review_deadline<=now(),true)));
end $$;

-- Every upload uses a fresh private-storage object and immutable license row.
-- Linking a replacement never reopens the booking or resets its payment state.
create or replace function public.submit_rental_license(p_booking uuid,p_object_path text)
returns uuid language plpgsql security definer set search_path=public as $$
declare b vehicle_bookings; result uuid;
begin
  select * into b from vehicle_bookings where id=p_booking and customer_id=auth.uid() for update;
  if not found then raise exception 'Booking access denied' using errcode='42501'; end if;
  if p_object_path not like auth.uid()::text||'/%' or length(p_object_path)>200 then
    raise exception 'Invalid license upload';
  end if;
  if not exists(select 1 from storage.objects where bucket_id='driver-licenses' and name=p_object_path) then
    raise exception 'Upload the license first';
  end if;

  insert into driver_licenses(customer_id,object_path,identity_name)
    values(auth.uid(),p_object_path,(select full_name from profiles where id=auth.uid())) returning id into result;
  update vehicle_bookings set license_id=result,review_deadline=now()+interval '1 hour' where id=b.id;
  insert into operations_queue(source_key,kind,customer_id,booking_id,title,due_at,details)
    values('license:'||b.id,'license_review',b.customer_id,b.id,'Driver license upload / review required',now()+interval '1 hour',jsonb_build_object('license_id',result))
    on conflict(source_key) do update set title=excluded.title,due_at=excluded.due_at,details=excluded.details,closed_at=null,claimed_by=null;
  return result;
end $$;

-- A pending replacement does not invalidate the currently approved license.
-- Supersede older uploads only when a new upload receives admin approval.
drop trigger license_replaced on public.driver_licenses;
create or replace function public.supersede_customer_license() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  update driver_licenses set superseded_at=now()
    where customer_id=new.customer_id and id<>new.id and superseded_at is null;
  return new;
end $$;
create trigger license_replaced after update of state on public.driver_licenses
  for each row when (new.state='approved' and old.state is distinct from new.state)
  execute function public.supersede_customer_license();

-- Mechanic acceptance after an admin re-offer keeps a paid booking confirmed.
create or replace function public.respond_mechanic_offer(p_offer uuid,p_accept boolean)
returns uuid language plpgsql security definer set search_path=public as $$
declare offer mechanic_offers; b service_bookings; duration integer; travel integer; finish timestamp; paid_total numeric;
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
    and tstzrange(s.scheduled_at,greatest(s.scheduled_at+make_interval(mins=>30+greatest(30,coalesce((select sum(ms.estimated_duration_minutes*i.quantity)::integer
      from service_booking_items i join mechanic_services ms on ms.id=i.mechanic_service_id where i.service_booking_id=s.id),60))),
      case when s.status in ('en_route','in_progress') then now()+interval '30 minutes' else s.scheduled_at end),'[)')
      && tstzrange(b.scheduled_at,b.scheduled_at+make_interval(mins=>duration+30),'[)')) then
    raise exception 'Mechanic already has a booking during this appointment';
  end if;
  select coalesce(sum(greatest(0,p.amount-p.refunded_amount-coalesce((
      select sum(f.amount) from workflow_refunds f where f.payment_id=p.id and f.state in ('pending','processing')),0))),0)
    into paid_total from payments p where p.booking_type='service' and p.booking_id=b.id
      and p.account_quote_id is null and p.status='succeeded';
  insert into mechanic_capacity(booking_id,mechanic_id,starts_at,ends_at,expires_at)
    values(b.id,auth.uid(),b.scheduled_at,b.scheduled_at+make_interval(mins=>duration+travel),
      case when b.payment_method='online' and paid_total<b.total_price then now()+interval '10 minutes' end);
  update mechanic_offers set state=case when id=offer.id then 'accepted'::mechanic_offer_state else 'closed'::mechanic_offer_state end,
    responded_at=now() where booking_id=b.id and state='pending';
  update service_bookings set mechanic_id=auth.uid(),
    checkout_state=case when b.checkout_state='legacy' then 'legacy'::service_checkout_state
      when b.payment_method='cash' or paid_total>=b.total_price then 'confirmed'::service_checkout_state
      else 'awaiting_payment'::service_checkout_state end,
    status=case when b.payment_method='cash' or paid_total>=b.total_price then 'assigned'::booking_status else 'pending'::booking_status end,
    hold_expires_at=case when b.payment_method='online' and paid_total<b.total_price then now()+interval '10 minutes' end where id=b.id;
  perform public.notify_workflow(b.customer_id,'Mechanic accepted',case
    when b.payment_method='cash' then 'Confirmed. Cash is due after service.'
    when paid_total>=b.total_price then 'Your mechanic accepted. Your existing payment remains recorded.'
    else 'Your mechanic accepted. Proceed to online payment now; complete checkout within 10 minutes.'
    end,b.id,'service');
  return b.id;
end $$;

revoke all on function public.guard_service_checkout(),public.guard_service_completion_report(),public.guard_rental_checkout(),
  public.admin_assign_mechanic(uuid,uuid),public.admin_reoffer_mechanics(uuid),public.review_rental_license(uuid,public.license_review_state,date,text),
  public.submit_rental_license(uuid,text) from public,anon;
grant execute on function public.admin_assign_mechanic(uuid,uuid),public.admin_reoffer_mechanics(uuid),
  public.review_rental_license(uuid,public.license_review_state,date,text),public.submit_rental_license(uuid,text) to authenticated;
