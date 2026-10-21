-- A cancelled original must never leave a payable change or reserved capacity.
create or replace function public.cancel_customer_booking(p_booking_type text,p_booking_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare r booking_requests;
begin
  if p_booking_type not in ('vehicle','service') then raise exception 'Invalid booking type'; end if;
  r:=public.request_booking_cancellation(p_booking_type::booking_type,p_booking_id,'Customer requested cancellation');
  if r.state<>'approved' then raise exception 'Submit a cancellation request with a reason for admin review'; end if;
  return true;
end $$;

create function public.close_cancelled_booking_changes() returns trigger language plpgsql security definer set search_path=public as $$
declare r booking_requests; c account_charges; previous jsonb;
begin
  if new.status<>'cancelled' or old.status='cancelled' then return new; end if;
  for r in select * from booking_requests where booking_id=new.id and kind in ('extension','reschedule','location_change')
    and state in ('pending','approved','declined') for update loop
    update booking_requests set state='declined',review_reason='Original booking cancelled' where id=r.id;
    for c in select * from account_charges where source_request=r.id and amount>paid+waived for update loop
      previous:=to_jsonb(c);
      update account_charges set waived=amount-paid where id=c.id returning * into c;
      insert into account_events(charge_id,customer_id,actor_id,kind,amount,reason,before_value,after_value,request_id)
        values(c.id,c.customer_id,auth.uid(),'waiver',c.waived-(previous->>'waived')::numeric,
          'Original booking cancelled; unpaid change withdrawn',previous,to_jsonb(c),gen_random_uuid());
    end loop;
    delete from rental_change_capacity where request_id=r.id;
    delete from mechanic_change_capacity where request_id=r.id;
    update mechanic_change_offers set state='closed' where request_id=r.id and state='pending';
    update operations_queue set closed_at=now() where source_key in ('extension:'||r.id,'location:'||r.id);
  end loop;
  return new;
end $$;
create trigger rental_cancel_changes after update of status on public.vehicle_bookings for each row execute function public.close_cancelled_booking_changes();
create trigger service_cancel_changes after update of status on public.service_bookings for each row execute function public.close_cancelled_booking_changes();

create function public.guard_support_context() returns trigger language plpgsql as $$
begin
  if current_user not in ('postgres','supabase_admin','service_role') and
    (new.booking_id is not null or new.booking_context is not null or new.parent_ticket_id is not null) then
    raise exception 'Use booking support to capture verified booking context' using errcode='42501';
  end if;
  return new;
end $$;
create trigger support_context_guard before insert on public.support_tickets for each row execute function public.guard_support_context();

-- Superseded IDs remain in historical reports but are never silently reused.
create function public.supersede_customer_license() returns trigger language plpgsql security definer set search_path=public as $$
begin
  update driver_licenses set superseded_at=now() where customer_id=new.customer_id and id<>new.id and superseded_at is null;
  return new;
end $$;
create trigger license_replaced after insert on public.driver_licenses for each row execute function public.supersede_customer_license();

create function public.arrange_rental_pickup(p_booking uuid,p_pickup timestamptz,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare b vehicle_bookings; new_return timestamptz;
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Administrator access required' using errcode='42501'; end if;
  if p_pickup is null or p_pickup<=now() or length(trim(coalesce(p_reason,'')))<5 then raise exception 'Enter a future pickup and arrangement reason'; end if;
  select * into b from vehicle_bookings where id=p_booking for update;
  if not found or b.status not in ('pending','confirmed') then raise exception 'Only a rental before handover can be arranged'; end if;
  perform 1 from vehicles where id=b.vehicle_id for update;
  new_return:=p_pickup+(b.return_at-b.pickup_at);
  if b.license_id is not null and not exists(select 1 from driver_licenses l join profiles p on p.id=l.customer_id
    where l.id=b.license_id and l.state='approved' and l.identity_name=p.full_name and l.expires_on>=(new_return at time zone 'Asia/Manila')::date) then
    raise exception 'Approved matching license must cover the arranged return'; end if;
  update vehicle_bookings set pickup_at=p_pickup,return_at=new_return,start_date=(p_pickup at time zone 'Asia/Manila')::date,
    end_date=(new_return at time zone 'Asia/Manila')::date,pickup_deadline=p_pickup+interval '3 hours' where id=b.id;
  insert into admin_audit_logs(admin_id,action_type,record_type,record_id,details)
    values(auth.uid(),'rental_pickup_arrangement','vehicle_booking',b.id::text,jsonb_build_object('reason',p_reason,'old_pickup',b.pickup_at,'old_return',b.return_at,'new_pickup',p_pickup,'new_return',new_return,'amount',b.total_price));
  perform public.notify_workflow(b.customer_id,'Rental time arrangement confirmed','Pickup: '||p_pickup::text||'. Return: '||new_return::text||'. Duration and price are unchanged. '||p_reason,b.id,'vehicle');
end $$;
revoke all on function public.arrange_rental_pickup(uuid,timestamptz,text) from public,anon;
grant execute on function public.arrange_rental_pickup(uuid,timestamptz,text) to authenticated;

create function public.recover_workflow_refund(p_refund uuid,p_action text,p_reason text,p_reference text default null)
returns void language plpgsql security definer set search_path=public as $$
declare r workflow_refunds; p payments;
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Administrator access required' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Enter a reconciliation reason'; end if;
  select * into r from workflow_refunds where id=p_refund for update;
  if not found then raise exception 'Refund not found'; end if;
  if r.state='succeeded' then return; end if;
  select * into p from payments where id=r.payment_id for update;
  if p_action='cash_paid' then
    if p.provider<>'cash' or length(trim(coalesce(p_reference,'')))<3 then raise exception 'Cash payment and repayment receipt required'; end if;
    perform public.settle_workflow_refund(r.id,'cash:'||p_reference,'succeeded');
  elsif p_action='poll_provider' then
    if p.provider='cash' then raise exception 'Record the cash repayment receipt'; end if;
    if r.provider_reference is null and length(trim(coalesce(p_reference,'')))<3 then
      raise exception 'Verify the refund at the provider and supply its refund ID; do not create another refund'; end if;
    update workflow_refunds set provider_reference=coalesce(provider_reference,p_reference),state='processing',claimed_at=null,failure_reason=null where id=r.id;
  else raise exception 'Choose cash repayment or provider status reconciliation'; end if;
  insert into admin_audit_logs(admin_id,action_type,record_type,record_id,details)
    values(auth.uid(),'refund_recovery','workflow_refund',r.id::text,jsonb_build_object('action',p_action,'reason',p_reason,'amount',r.amount,'before',to_jsonb(r),'reference',p_reference));
end $$;
revoke all on function public.recover_workflow_refund(uuid,text,text,text) from public,anon;
grant execute on function public.recover_workflow_refund(uuid,text,text,text) to authenticated;

alter function public.run_account_maintenance() rename to run_change_account_maintenance;
revoke all on function public.run_change_account_maintenance() from public,anon,authenticated;
create function public.run_account_maintenance() returns void language plpgsql security definer set search_path=public as $$
declare b service_bookings;
begin
  perform public.run_change_account_maintenance();
  update operations_queue q set closed_at=now() where closed_at is null and kind in ('extension_review','location_review')
    and exists(select 1 from booking_requests r where r.id=(q.details->>'request_id')::uuid and r.state not in ('pending','approved'));
  for b in select s.* from service_bookings s left join mechanic_capacity c on c.booking_id=s.id
    where s.status in ('en_route','in_progress') and
      (coalesce(c.ends_at,s.scheduled_at+interval '2 hours')<now() or
        (s.scheduled_at at time zone 'Asia/Manila')::date < (now() at time zone 'Asia/Manila')::date or
        (now() at time zone 'Asia/Manila')::time >= (select case when s.is_emergency then roadside_close else scheduled_close end from service_operating_hours where id))
    and not exists(select 1 from operations_queue where source_key='overrun:'||s.id) loop
    insert into operations_queue(source_key,kind,customer_id,booking_id,title) values('overrun:'||b.id,'service_overrun',b.customer_id,b.id,'Active service exceeded its expected window; contact mechanic');
    perform public.notify_workflow(b.customer_id,'Service is taking longer','Your active job remains open. Admin has been alerted to coordinate an updated completion time.',b.id,'service');
  end loop;
end $$;
revoke all on function public.run_account_maintenance() from public,anon,authenticated;
grant execute on function public.run_account_maintenance() to service_role;
