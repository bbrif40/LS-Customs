alter type public.account_charge_kind add value if not exists 'rental_extension';
alter type public.account_charge_kind add value if not exists 'reschedule';
alter type public.account_charge_kind add value if not exists 'location_change';
alter type public.account_charge_kind add value if not exists 'service_base';

create table public.rental_change_capacity (
  request_id uuid primary key references public.booking_requests(id),
  booking_id uuid not null references public.vehicle_bookings(id),
  vehicle_id uuid not null references public.vehicles(id),
  starts_at timestamptz not null, ends_at timestamptz not null, expires_at timestamptz not null,
  exclude using gist(vehicle_id with =,tstzrange(starts_at,ends_at,'[)') with &&)
);
alter table public.rental_change_capacity enable row level security;
create policy rental_change_read on public.rental_change_capacity for select to authenticated using(public.is_admin()
  or exists(select 1 from vehicle_bookings b where b.id=booking_id and b.customer_id=auth.uid()));
grant select on public.rental_change_capacity to authenticated;

create table public.mechanic_change_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.booking_requests(id),
  mechanic_id uuid not null references public.mechanic_profiles(id),
  expires_at timestamptz not null,
  state public.mechanic_offer_state not null default 'pending',
  unique(request_id,mechanic_id)
);
alter table public.mechanic_change_offers enable row level security;
create policy mechanic_change_offer_read on public.mechanic_change_offers for select to authenticated using(mechanic_id=auth.uid() or public.is_admin()
  or exists(select 1 from booking_requests r where r.id=request_id and r.customer_id=auth.uid()));
grant select on public.mechanic_change_offers to authenticated;

create table public.mechanic_change_capacity (
  request_id uuid primary key references public.booking_requests(id),
  booking_id uuid not null references public.service_bookings(id),
  mechanic_id uuid not null references public.mechanic_profiles(id),
  starts_at timestamptz not null,ends_at timestamptz not null,expires_at timestamptz not null,
  exclude using gist(mechanic_id with =,tstzrange(starts_at,ends_at,'[)') with &&)
);
alter table public.mechanic_change_capacity enable row level security;
create policy mechanic_change_capacity_read on public.mechanic_change_capacity for select to authenticated using(mechanic_id=auth.uid() or public.is_admin()
  or exists(select 1 from service_bookings b where b.id=booking_id and b.customer_id=auth.uid()));
grant select on public.mechanic_change_capacity to authenticated;
grant all on public.rental_change_capacity,public.mechanic_change_offers,public.mechanic_change_capacity to service_role;

create function public.request_rental_extension(p_request uuid,p_booking uuid,p_return_at timestamptz)
returns public.booking_requests language plpgsql security definer set search_path=public as $$
declare b vehicle_bookings; result booking_requests; extra numeric;
begin
  select * into b from vehicle_bookings where id=p_booking and customer_id=auth.uid() for update;
  if not found then raise exception 'Booking access denied' using errcode='42501'; end if;
  perform public.require_transaction_terms(p_request,'vehicle',auth.uid());
  select * into result from booking_requests where id=p_request and customer_id=auth.uid();
  if found then return result; end if;
  if b.status not in ('confirmed','in_progress') or now()>=b.return_at or p_return_at<=b.return_at
    or p_return_at-b.pickup_at>interval '30 days' or p_return_at is null then raise exception 'Request an extension before your return deadline, within 30 rental days'; end if;
  if not exists(select 1 from driver_licenses where id=b.license_id and state='approved'
    and expires_on>=(p_return_at at time zone 'Asia/Manila')::date) then raise exception 'License must remain valid through the extension'; end if;
  select price_per_day*ceil(extract(epoch from(p_return_at-b.return_at))/86400) into extra from vehicles where id=b.vehicle_id;
  insert into booking_requests(id,customer_id,booking_type,booking_id,kind,amount,payload,reason,created_by)
    values(p_request,auth.uid(),'vehicle',b.id,'extension',extra,jsonb_build_object('original_return',b.return_at,'new_return',p_return_at),
      'Customer requested rental extension',auth.uid()) returning * into result;
  insert into operations_queue(source_key,kind,customer_id,booking_id,title,due_at,details)
    values('extension:'||result.id,'extension_review',b.customer_id,b.id,'Rental extension awaiting approval',b.return_at,jsonb_build_object('request_id',result.id));
  return result;
end $$;

create function public.approve_rental_extension(p_request uuid,p_approve boolean,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare r booking_requests; b vehicle_bookings; new_return timestamptz; deadline timestamptz;
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Administrator access required' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Enter an approval or rejection reason'; end if;
  select * into r from booking_requests where id=p_request and kind='extension' for update;
  if not found or r.state<>'pending' then raise exception 'Extension request is not pending'; end if;
  select * into b from vehicle_bookings where id=r.booking_id for update;
  if p_approve then
    new_return:=(r.payload->>'new_return')::timestamptz;
    deadline:=least(b.return_at,now()+interval '10 minutes');
    if b.return_at<=now() or b.return_at is distinct from (r.payload->>'original_return')::timestamptz or b.status not in ('confirmed','in_progress') then raise exception 'Original rental deadline changed or expired'; end if;
    perform 1 from vehicles where id=b.vehicle_id for update;
    if exists(select 1 from vehicle_bookings other where other.vehicle_id=b.vehicle_id and other.id<>b.id and other.status in ('pending','confirmed','in_progress')
      and tstzrange(other.pickup_at,other.return_at,'[)') && tstzrange(b.return_at,new_return,'[)')) then raise exception 'Vehicle has a conflicting reservation'; end if;
    if not exists(select 1 from driver_licenses where id=b.license_id and state='approved' and expires_on>=(new_return at time zone 'Asia/Manila')::date) then raise exception 'License expires before the requested return'; end if;
    delete from rental_change_capacity where vehicle_id=b.vehicle_id and expires_at<=now();
    insert into rental_change_capacity(request_id,booking_id,vehicle_id,starts_at,ends_at,expires_at) values(r.id,b.id,b.vehicle_id,b.return_at,new_return,deadline);
    insert into account_charges(customer_id,booking_type,booking_id,kind,description,amount,blocks_rentals,source_request,due_at)
      values(r.customer_id,'vehicle',b.id,'rental_extension','Approved rental extension awaiting payment',r.amount,false,r.id,deadline);
    update booking_requests set payload=payload||jsonb_build_object('payment_deadline',deadline) where id=r.id;
  end if;
  update booking_requests set state=case when p_approve then 'approved'::booking_request_state else 'declined'::booking_request_state end,
    reviewed_by=auth.uid(),reviewed_at=now(),review_reason=p_reason where id=r.id;
  update operations_queue set closed_at=now() where source_key='extension:'||r.id;
  perform public.notify_workflow(r.customer_id,'Rental extension reviewed',p_reason||case when p_approve
    then '. Pay PHP '||r.amount::text||' before '||deadline::text||' to change the return deadline. The original deadline remains active until payment.' else '. The original booking remains unchanged.' end,b.id,'vehicle');
end $$;

create function public.guard_rental_change_hold() returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform 1 from vehicles where id=new.vehicle_id for update;
  if new.status in ('pending','confirmed','in_progress') and exists(select 1 from rental_change_capacity c where c.vehicle_id=new.vehicle_id
    and c.booking_id<>new.id and c.expires_at>now() and tstzrange(c.starts_at,c.ends_at,'[)') && tstzrange(new.pickup_at,new.return_at,'[)')) then raise exception 'Vehicle is held for an approved extension'; end if;
  return new;
end $$;
create trigger rental_change_hold_guard before insert or update of pickup_at,return_at,status on public.vehicle_bookings for each row execute function public.guard_rental_change_hold();

create function public.request_mechanic_reschedule(p_request uuid,p_booking uuid,p_schedule timestamptz)
returns public.booking_requests language plpgsql security definer set search_path=public as $$
declare b service_bookings; result booking_requests; delta numeric; duration integer; opening time; closing time;
begin
  select * into b from service_bookings where id=p_booking and (customer_id=auth.uid() or coalesce(public.is_admin(),false)) for update;
  if not found then raise exception 'Booking access denied' using errcode='42501'; end if;
  if not coalesce(public.is_admin(),false) then perform public.require_transaction_terms(p_request,'service',auth.uid()); end if;
  if b.status not in ('assigned','confirmed') or b.is_emergency or p_schedule<=now() or p_schedule>now()+interval '100 days' then raise exception 'Reschedule before travel to a future appointment'; end if;
  select scheduled_open,scheduled_close into opening,closing from service_operating_hours where id;
  select greatest(30,coalesce(sum(s.estimated_duration_minutes*i.quantity),60)),coalesce(sum((s.base_price-i.price_at_booking)*i.quantity),0)
    into duration,delta from service_booking_items i join mechanic_services s on s.id=i.mechanic_service_id where i.service_booking_id=b.id;
  if (p_schedule at time zone 'Asia/Manila')::time<opening or ((p_schedule+make_interval(mins=>duration)) at time zone 'Asia/Manila')::time>closing
    or (p_schedule at time zone 'Asia/Manila')::date<>((p_schedule+make_interval(mins=>duration)) at time zone 'Asia/Manila')::date then raise exception 'Choose supported operating hours'; end if;
  insert into booking_requests(id,customer_id,booking_type,booking_id,kind,amount,payload,reason,created_by)
    values(p_request,b.customer_id,'service',b.id,'reschedule',greatest(0,b.total_price+delta),
      jsonb_build_object('original_schedule',b.scheduled_at,'new_schedule',p_schedule,'original_total',b.total_price,'price_difference',delta,'duration',duration,'offer_deadline',now()+interval '5 minutes','provider_initiated',coalesce(public.is_admin(),false)),
      'Customer requested reschedule',auth.uid()) returning * into result;
  insert into mechanic_change_offers(request_id,mechanic_id,expires_at)
    select result.id,id,now()+interval '5 minutes' from mechanic_profiles where is_available;
  if coalesce(public.is_admin(),false) then perform public.notify_workflow(b.customer_id,'Appointment time change proposed','LS Customs requests a new appointment time. Accept it after mechanic confirmation or decline for a full refund.',b.id,'service'); end if;
  return result;
end $$;

create function public.ensure_mechanic_change_capacity(p_mechanic uuid,p_booking uuid,p_start timestamptz,p_end timestamptz)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform 1 from mechanic_profiles where id=p_mechanic for update;
  if exists(select 1 from mechanic_capacity c where c.mechanic_id=p_mechanic and c.booking_id<>p_booking
    and (c.expires_at is null or c.expires_at>now()) and tstzrange(c.starts_at,c.ends_at,'[)') && tstzrange(p_start,p_end,'[)'))
    or exists(select 1 from mechanic_change_capacity c where c.mechanic_id=p_mechanic and c.booking_id<>p_booking and c.expires_at>now()
      and tstzrange(c.starts_at,c.ends_at,'[)') && tstzrange(p_start,p_end,'[)'))
    or exists(select 1 from service_bookings b where b.mechanic_id=p_mechanic and b.id<>p_booking and b.status in ('assigned','en_route','in_progress')
      and tstzrange(b.scheduled_at,greatest(b.scheduled_at+make_interval(mins=>30+greatest(30,coalesce((select sum(ms.estimated_duration_minutes*i.quantity)::integer from service_booking_items i join mechanic_services ms on ms.id=i.mechanic_service_id where i.service_booking_id=b.id),60))),case when b.status in ('en_route','in_progress') then now()+interval '30 minutes' else b.scheduled_at end),'[)') && tstzrange(p_start,p_end,'[)')) then raise exception 'Mechanic capacity is unavailable'; end if;
end $$;
revoke all on function public.ensure_mechanic_change_capacity(uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated;

create function public.respond_mechanic_change_offer(p_offer uuid,p_accept boolean)
returns void language plpgsql security definer set search_path=public as $$
declare o mechanic_change_offers; r booking_requests; scheduled timestamptz; duration integer;
begin
  select * into o from mechanic_change_offers where id=p_offer and mechanic_id=auth.uid();
  if not found then raise exception 'Offer access denied' using errcode='42501'; end if;
  select * into r from booking_requests where id=o.request_id for update;
  select * into o from mechanic_change_offers where id=p_offer for update;
  if o.state<>'pending' or o.expires_at<=now() or r.payload ? 'accepted_mechanic' then raise exception 'Offer no longer available'; end if;
  if not p_accept then update mechanic_change_offers set state='declined' where id=o.id; return; end if;
  scheduled:=(r.payload->>'new_schedule')::timestamptz; duration:=(r.payload->>'duration')::int;
  perform public.ensure_mechanic_change_capacity(auth.uid(),r.booking_id,scheduled,scheduled+make_interval(mins=>duration+30));
  insert into mechanic_change_capacity(request_id,booking_id,mechanic_id,starts_at,ends_at,expires_at)
    values(r.id,r.booking_id,auth.uid(),scheduled,scheduled+make_interval(mins=>duration+30),now()+interval '10 minutes');
  update mechanic_change_offers set state=case when id=o.id then 'accepted'::mechanic_offer_state else 'closed'::mechanic_offer_state end where request_id=r.id and state='pending';
  update booking_requests set payload=payload||jsonb_build_object('accepted_mechanic',auth.uid(),'payment_deadline',now()+interval '10 minutes') where id=r.id;
  perform public.notify_workflow(r.customer_id,'Reschedule mechanic accepted','Review and confirm the new time and price within 10 minutes. Your original appointment remains active until the change is completed.',r.booking_id,'service');
end $$;

create function public.apply_paid_booking_change(p_request uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r booking_requests; b vehicle_bookings; s service_bookings; hold mechanic_change_capacity;
begin
  select * into r from booking_requests where id=p_request for update;
  if r.state='finalized' then return; end if;
  if r.state<>'approved' or (r.payload->>'payment_deadline')::timestamptz<=now() then raise exception 'Change payment deadline expired'; end if;
  if exists(select 1 from account_charges where source_request=r.id and amount>paid+waived) then return; end if;
  if r.kind='extension' then
    select * into b from vehicle_bookings where id=r.booking_id for update;
    if b.return_at<=now() or b.status not in ('confirmed','in_progress') then raise exception 'Original return deadline expired'; end if;
    update vehicle_bookings set return_at=(r.payload->>'new_return')::timestamptz,end_date=((r.payload->>'new_return')::timestamptz at time zone 'Asia/Manila')::date,total_price=total_price+r.amount where id=b.id;
    delete from rental_change_capacity where request_id=r.id;
  elsif r.kind='reschedule' then
    select * into s from service_bookings where id=r.booking_id for update;
    select * into hold from mechanic_change_capacity where request_id=r.id;
    if s.status not in ('assigned','confirmed') or hold.expires_at<=now() then raise exception 'Appointment can no longer be rescheduled'; end if;
    perform public.ensure_mechanic_change_capacity(hold.mechanic_id,s.id,hold.starts_at,hold.ends_at);
    delete from mechanic_capacity where booking_id=s.id;
    update service_bookings set scheduled_at=hold.starts_at,mechanic_id=hold.mechanic_id,total_price=r.amount,status='assigned' where id=s.id;
    insert into mechanic_capacity(booking_id,mechanic_id,starts_at,ends_at) values(s.id,hold.mechanic_id,hold.starts_at,hold.ends_at);
    delete from mechanic_change_capacity where request_id=r.id;
  elsif r.kind='location_change' then
    select * into s from service_bookings where id=r.booking_id for update;
    if s.status not in ('assigned','confirmed','en_route') then raise exception 'Location cannot change after work begins'; end if;
    if not exists(select 1 from service_areas where id=(r.payload->>'area_id')::uuid and active) then raise exception 'The destination is no longer supported'; end if;
    select * into hold from mechanic_change_capacity where request_id=r.id;
    if hold.request_id is null or hold.expires_at<=now() then raise exception 'Location change capacity expired'; end if;
    perform public.ensure_mechanic_change_capacity(hold.mechanic_id,s.id,hold.starts_at,hold.ends_at);
    update service_bookings set address_id=null,pin_lat=(r.payload->>'lat')::double precision,pin_lng=(r.payload->>'lng')::double precision,
      confirmed_lat=(r.payload->>'lat')::double precision,confirmed_lng=(r.payload->>'lng')::double precision,
      service_area_id=(r.payload->>'area_id')::uuid,confirmed_travel_fee=(r.payload->>'travel_fee')::numeric,total_price=r.amount where id=s.id;
    delete from mechanic_capacity where booking_id=s.id;
    insert into mechanic_capacity(booking_id,mechanic_id,starts_at,ends_at) values(s.id,hold.mechanic_id,hold.starts_at,hold.ends_at);
    delete from mechanic_change_capacity where request_id=r.id;
  end if;
  update booking_requests set state='finalized' where id=r.id;
  perform public.notify_workflow(r.customer_id,'Booking change confirmed','The new time and accepted price are now confirmed.',r.booking_id,r.booking_type::text);
end $$;
revoke all on function public.apply_paid_booking_change(uuid) from public,anon,authenticated;

create function public.confirm_mechanic_reschedule(p_request uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r booking_requests; b service_bookings; difference numeric; p payments; remaining numeric;
begin
  select * into r from booking_requests where id=p_request and customer_id=auth.uid() and kind='reschedule' for update;
  if not found or r.state<>'pending' or not(r.payload ? 'accepted_mechanic') or (r.payload->>'payment_deadline')::timestamptz<=now() then raise exception 'Reschedule needs an active mechanic acceptance'; end if;
  perform public.require_transaction_terms(r.id,'payment',auth.uid());
  select * into b from service_bookings where id=r.booking_id for update;
  if b.scheduled_at is distinct from (r.payload->>'original_schedule')::timestamptz or b.status not in ('assigned','confirmed') then raise exception 'Original appointment changed or travel has started'; end if;
  difference:=r.amount-b.total_price;
  update booking_requests set state='approved' where id=r.id;
  if b.payment_method='online' and difference>0 then
    insert into account_charges(customer_id,booking_type,booking_id,kind,description,amount,blocks_rentals,source_request,due_at)
      values(r.customer_id,'service',r.booking_id,'reschedule','Accepted rescheduling price increase',difference,false,r.id,(r.payload->>'payment_deadline')::timestamptz);
  else
    perform public.apply_paid_booking_change(r.id);
    if b.payment_method='online' and difference<0 then
      remaining:=-difference;
      for p in select * from payments where booking_type='service' and booking_id=b.id and status='succeeded' and account_quote_id is null order by created_at for update loop
        if remaining<=0 then exit; end if;
        insert into workflow_refunds(payment_id,request_id,customer_id,amount) values(p.id,r.id,b.customer_id,least(remaining,p.amount-p.refunded_amount));
        remaining:=remaining-least(remaining,p.amount-p.refunded_amount);
      end loop;
      if remaining>0 then raise exception 'Refund allocation requires admin review'; end if;
    end if;
  end if;
end $$;

create function public.booking_change_paid() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.kind::text in ('rental_extension','reschedule','location_change') and new.paid+new.waived>=new.amount and old.paid+old.waived<old.amount
    and exists(select 1 from booking_requests where id=new.source_request and state='approved') then
    perform public.apply_paid_booking_change(new.source_request);
  end if;
  return new;
end $$;
create trigger booking_change_charge_paid after update of paid,waived on public.account_charges for each row execute function public.booking_change_paid();

create function public.guard_reserved_mechanic_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status in ('assigned','en_route','in_progress') and new.mechanic_id is not null then
    perform public.ensure_mechanic_change_capacity(new.mechanic_id,new.id,new.scheduled_at,new.scheduled_at+interval '90 minutes');
  end if;
  return new;
end $$;
create trigger mechanic_change_guard before insert or update of mechanic_id,status,scheduled_at on public.service_bookings for each row execute function public.guard_reserved_mechanic_change();

revoke all on function public.request_rental_extension(uuid,uuid,timestamptz),public.approve_rental_extension(uuid,boolean,text),
  public.request_mechanic_reschedule(uuid,uuid,timestamptz),public.respond_mechanic_change_offer(uuid,boolean),public.confirm_mechanic_reschedule(uuid) from public,anon;
grant execute on function public.request_rental_extension(uuid,uuid,timestamptz),public.approve_rental_extension(uuid,boolean,text),
  public.request_mechanic_reschedule(uuid,uuid,timestamptz),public.respond_mechanic_change_offer(uuid,boolean),public.confirm_mechanic_reschedule(uuid) to authenticated;

create unique index one_active_booking_change on public.booking_requests(booking_type,booking_id)
  where kind in ('extension','reschedule','location_change') and state in ('pending','approved');

alter function public.run_account_maintenance() rename to run_booking_account_maintenance;
revoke all on function public.run_booking_account_maintenance() from public,anon,authenticated;
create function public.run_account_maintenance() returns void language plpgsql security definer set search_path=public as $$
declare r booking_requests; c account_charges; previous jsonb;
begin
  perform public.run_booking_account_maintenance();
  for r in select * from booking_requests where kind in ('extension','reschedule','location_change') and state in ('pending','approved')
    and (coalesce((payload->>'payment_deadline')::timestamptz,(payload->>'offer_deadline')::timestamptz,
      (payload->>'original_return')::timestamptz)<=now()) for update skip locked loop
    update booking_requests set state='declined',review_reason='Change window expired; original booking preserved' where id=r.id;
    for c in select * from account_charges where source_request=r.id and amount>paid+waived for update loop
      previous:=to_jsonb(c);
      update account_charges set waived=amount-paid where id=c.id returning * into c;
      insert into account_events(charge_id,customer_id,kind,amount,reason,before_value,after_value,request_id)
        values(c.id,c.customer_id,'waiver',c.waived-(previous->>'waived')::numeric,'Expired booking change; original retained',previous,to_jsonb(c),r.id)
        on conflict(request_id,charge_id) do nothing;
    end loop;
    delete from rental_change_capacity where request_id=r.id;
    delete from mechanic_change_capacity where request_id=r.id;
    update mechanic_change_offers set state='expired' where request_id=r.id and state='pending';
    update operations_queue set closed_at=now() where source_key='extension:'||r.id;
    perform public.notify_workflow(r.customer_id,'Booking change expired','Your original booking remains active with its original deadline. Retry with a fresh availability check.',r.booking_id,r.booking_type::text);
  end loop;
end $$;
revoke all on function public.run_account_maintenance() from public,anon,authenticated;
grant execute on function public.run_account_maintenance() to service_role;

alter function public.settle_account_quote(uuid,uuid) rename to settle_debt_quote;
revoke all on function public.settle_debt_quote(uuid,uuid) from public,anon,authenticated;
create function public.settle_account_quote(p_quote uuid,p_request uuid)
returns void language plpgsql security definer set search_path=public as $$
declare q account_quotes; invalid_change boolean;
begin
  select * into q from account_quotes where id=p_quote for update;
  if not found then raise exception 'Quote not found'; end if;
  if q.settled_at is not null then return; end if;
  select exists(select 1 from jsonb_array_elements(q.allocations) a join account_charges c on c.id=(a->>'charge_id')::uuid
    join booking_requests r on r.id=c.source_request where r.kind in ('extension','reschedule','location_change')
    and (r.state<>'approved' or (r.payload->>'payment_deadline')::timestamptz<=now())) into invalid_change;
  if invalid_change then
    insert into workflow_refunds(payment_id,customer_id,amount) values(p_request,q.customer_id,q.amount);
    update account_quotes set settled_at=now() where id=q.id;
    return;
  end if;
  perform public.settle_debt_quote(p_quote,p_request);
end $$;
revoke all on function public.settle_account_quote(uuid,uuid) from public,anon,authenticated;
grant execute on function public.settle_account_quote(uuid,uuid) to service_role;

create function public.cancel_provider_booking_internal(p_type public.booking_type,p_booking uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare owner uuid; booking_state booking_status; p payments; request uuid:=gen_random_uuid();
begin
  if p_type='service' then select customer_id,status into owner,booking_state from service_bookings where id=p_booking for update;
  else select customer_id,status into owner,booking_state from vehicle_bookings where id=p_booking for update; end if;
  if owner is null then raise exception 'Booking not found'; end if;
  if booking_state='cancelled' then return; end if;
  if booking_state='completed' then raise exception 'Completed work requires support review'; end if;
  if p_type='vehicle' and booking_state='in_progress' then raise exception 'Record the actual vehicle return before releasing an active rental'; end if;
  update operations_queue set closed_at=now() where source_key in (
    select 'cancellation:'||id from booking_requests where booking_id=p_booking and kind='cancellation' and state='pending');
  update booking_requests set state='declined',review_reason='Superseded by full-refund provider cancellation'
    where booking_id=p_booking and kind='cancellation' and state='pending';
  update booking_requests set state='declined',review_reason='Provider cancelled original booking' where booking_id=p_booking and state in ('pending','approved') and kind in ('reschedule','extension','location_change');
  insert into booking_requests(id,customer_id,booking_type,booking_id,kind,state,reason,created_by,payload)
    values(request,owner,p_type,p_booking,'cancellation','approved',p_reason,auth.uid(),jsonb_build_object('provider_initiated',true,'refund_percentage',100));
  if p_type='service' then update service_bookings set status='cancelled' where id=p_booking;
  else update vehicle_bookings set status='cancelled' where id=p_booking; end if;
  for p in select * from payments where booking_type=p_type and booking_id=p_booking and status='succeeded' and account_quote_id is null for update loop
    declare available numeric:=p.amount-p.refunded_amount-coalesce((select sum(amount) from workflow_refunds where payment_id=p.id and state<>'succeeded'),0);
    begin
      if available>0 then insert into workflow_refunds(payment_id,request_id,customer_id,amount) values(p.id,request,owner,available); end if;
    end;
  end loop;
  perform public.notify_workflow(owner,'Provider cancellation','Your booking is cancelled. A full refund of collected booking payments is pending. '||p_reason,p_booking,p_type::text);
end $$;
revoke all on function public.cancel_provider_booking_internal(public.booking_type,uuid,text) from public,anon,authenticated;
create function public.provider_cancel_booking(p_type public.booking_type,p_booking uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Administrator access required' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Enter a cancellation reason'; end if;
  perform public.cancel_provider_booking_internal(p_type,p_booking,p_reason);
  insert into admin_audit_logs(admin_id,action_type,record_type,record_id,details)
    values(auth.uid(),'provider_cancellation',p_type::text||'_booking',p_booking::text,jsonb_build_object('reason',p_reason,'refund_percentage',100));
end $$;
create function public.decline_provider_reschedule(p_request uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r booking_requests;
begin
  select * into r from booking_requests where id=p_request and customer_id=auth.uid() and kind='reschedule'
    and payload->>'provider_initiated'='true' and state in ('pending','approved') for update;
  if not found then raise exception 'Provider time change is unavailable'; end if;
  perform public.cancel_provider_booking_internal('service',r.booking_id,'Customer declined provider-requested appointment time change');
end $$;
revoke all on function public.provider_cancel_booking(public.booking_type,uuid,text),public.decline_provider_reschedule(uuid) from public,anon;
grant execute on function public.provider_cancel_booking(public.booking_type,uuid,text),public.decline_provider_reschedule(uuid) to authenticated;
