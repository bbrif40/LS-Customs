create function public.request_service_location_change(p_request uuid,p_booking uuid,p_check uuid)
returns public.booking_requests language plpgsql security definer set search_path=public as $$
declare b service_bookings; checked service_location_checks; fee numeric; result booking_requests;
begin
  select * into b from service_bookings where id=p_booking and customer_id=auth.uid() for update;
  if not found then raise exception 'Booking access denied' using errcode='42501'; end if;
  perform public.require_transaction_terms(p_request,'service',auth.uid());
  if b.status not in ('assigned','confirmed','en_route') then raise exception 'Location changes require an active appointment before work starts'; end if;
  select c.* into checked from service_location_checks c join service_areas a on a.id=c.area_id and a.active
    where c.id=p_check and c.customer_id=auth.uid() and c.expires_at>now();
  if not found then raise exception 'Verify the new location first'; end if;
  select travel_fee into fee from public.get_dispatch_quote(checked.lat,checked.lng);
  if fee is null then raise exception 'Travel pricing unavailable'; end if;
  insert into booking_requests(id,customer_id,booking_type,booking_id,kind,amount,payload,reason,created_by)
    values(p_request,b.customer_id,'service',b.id,'location_change',greatest(0,b.total_price+fee-b.confirmed_travel_fee),
      jsonb_build_object('lat',checked.lat,'lng',checked.lng,'area_id',checked.area_id,'travel_fee',fee,'original_total',b.total_price,
        'price_difference',fee-b.confirmed_travel_fee,'original_lat',b.confirmed_lat,'original_lng',b.confirmed_lng),
      'Customer requested destination change',auth.uid()) returning * into result;
  insert into operations_queue(source_key,kind,customer_id,booking_id,title,details)
    values('location:'||result.id,'location_review',b.customer_id,b.id,'Destination change awaiting review',jsonb_build_object('request_id',result.id));
  return result;
end $$;

create function public.approve_service_location_change(p_request uuid,p_approve boolean,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare r booking_requests; b service_bookings; duration integer; starts timestamptz;
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Administrator access required' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Enter review notes'; end if;
  select * into r from booking_requests where id=p_request and kind='location_change' for update;
  if not found or r.state<>'pending' then raise exception 'Location request is not pending'; end if;
  select * into b from service_bookings where id=r.booking_id for update;
  if p_approve then
    if b.status not in ('assigned','confirmed','en_route') or b.total_price is distinct from (r.payload->>'original_total')::numeric then raise exception 'Original booking changed'; end if;
    duration:=greatest(30,coalesce((select sum(s.estimated_duration_minutes*i.quantity) from service_booking_items i join mechanic_services s on s.id=i.mechanic_service_id where i.service_booking_id=b.id),60));
    starts:=greatest(b.scheduled_at,now());
    perform public.ensure_mechanic_change_capacity(b.mechanic_id,b.id,starts,starts+make_interval(mins=>duration+30));
    insert into mechanic_change_capacity(request_id,booking_id,mechanic_id,starts_at,ends_at,expires_at)
      values(r.id,b.id,b.mechanic_id,starts,starts+make_interval(mins=>duration+30),now()+interval '10 minutes');
  end if;
  update booking_requests set state=case when p_approve then 'approved'::booking_request_state else 'declined'::booking_request_state end,
    reviewed_by=auth.uid(),reviewed_at=now(),review_reason=p_reason,payload=payload||jsonb_build_object('payment_deadline',now()+interval '10 minutes') where id=r.id;
  update operations_queue set closed_at=now() where source_key='location:'||r.id;
  perform public.notify_workflow(r.customer_id,'Destination change reviewed',p_reason||case when p_approve then '. Review and accept the new destination and total before it changes. Original destination stays active until completion.' else '. Original destination remains unchanged.' end,b.id,'service');
end $$;

create function public.confirm_service_location_change(p_request uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r booking_requests; b service_bookings; difference numeric; p payments; remaining numeric;
begin
  select * into r from booking_requests where id=p_request and customer_id=auth.uid() and kind='location_change' for update;
  if not found or r.state<>'approved' or (r.payload->>'payment_deadline')::timestamptz<=now() then raise exception 'Destination approval expired'; end if;
  perform public.require_transaction_terms(r.id,'payment',auth.uid());
  select * into b from service_bookings where id=r.booking_id for update;
  if b.total_price is distinct from(r.payload->>'original_total')::numeric then raise exception 'Original price changed; request a new quote'; end if;
  if exists(select 1 from account_charges where source_request=r.id) then return; end if;
  difference:=r.amount-b.total_price;
  if b.payment_method='online' and difference>0 then
    insert into account_charges(customer_id,booking_type,booking_id,kind,description,amount,blocks_rentals,source_request,due_at)
      values(r.customer_id,'service',b.id,'location_change','Accepted destination change price increase',difference,false,r.id,(r.payload->>'payment_deadline')::timestamptz);
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

alter table public.account_events add column reverses_event_id uuid unique references public.account_events(id);
create function public.reverse_account_collection(p_event uuid,p_reason text,p_request uuid)
returns void language plpgsql security definer set search_path=public as $$
declare e account_events; c account_charges; previous jsonb;
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Administrator access required' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<3 or p_request is null then raise exception 'Enter a correction reason'; end if;
  select * into e from account_events where id=p_event;
  if not found or e.kind not in ('cash','waiver') or e.amount<=0 then raise exception 'Only original cash collections or waivers can be reversed'; end if;
  perform 1 from profiles where id=e.customer_id for update;
  if exists(select 1 from account_events where reverses_event_id=e.id) then return; end if;
  select * into c from account_charges where id=e.charge_id for update;
  previous:=to_jsonb(c);
  if e.kind='cash' then update account_charges set paid=paid-e.amount where id=c.id returning * into c;
  else update account_charges set waived=waived-e.amount where id=c.id returning * into c; end if;
  insert into account_events(charge_id,customer_id,actor_id,kind,amount,reason,before_value,after_value,request_id,reverses_event_id)
    values(c.id,c.customer_id,auth.uid(),e.kind,-e.amount,p_reason,previous,to_jsonb(c),p_request,e.id);
  perform public.refresh_customer_account(c.customer_id);
end $$;
revoke all on function public.request_service_location_change(uuid,uuid,uuid),public.approve_service_location_change(uuid,boolean,text),
  public.confirm_service_location_change(uuid),public.reverse_account_collection(uuid,text,uuid) from public,anon;
grant execute on function public.request_service_location_change(uuid,uuid,uuid),public.approve_service_location_change(uuid,boolean,text),
  public.confirm_service_location_change(uuid),public.reverse_account_collection(uuid,text,uuid) to authenticated;

create function public.cancel_account_quote(p_quote uuid) returns void language plpgsql security definer set search_path=public as $$
declare q account_quotes;
begin
  select * into q from account_quotes where id=p_quote and customer_id=auth.uid() for update;
  if not found then raise exception 'Quote access denied' using errcode='42501'; end if;
  if q.settled_at is not null or exists(select 1 from payments where account_quote_id=q.id and status in ('pending','succeeded')) then
    raise exception 'Wait for the payment outcome before cancelling checkout'; end if;
  update account_quotes set expires_at=least(expires_at,now()) where id=q.id;
  perform public.refresh_customer_account(q.customer_id);
end $$;
create function public.refresh_operations_queue() returns void language plpgsql security definer set search_path=public as $$
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Administrator access required' using errcode='42501'; end if;
  perform public.run_account_maintenance();
end $$;
revoke all on function public.cancel_account_quote(uuid),public.refresh_operations_queue() from public,anon;
grant execute on function public.cancel_account_quote(uuid),public.refresh_operations_queue() to authenticated;
create index account_charges_unsettled on public.account_charges(customer_id,posted_at) where amount>paid+waived;

create function public.guard_terms_version() returns trigger language plpgsql as $$
begin
  if tg_op='DELETE' then raise exception 'Published terms are immutable'; end if;
  if new.content is distinct from old.content or new.version is distinct from old.version or new.created_at is distinct from old.created_at then
    raise exception 'Publish a new terms version rather than editing accepted content'; end if;
  return new;
end $$;
create trigger terms_versions_immutable before update or delete on public.transaction_terms for each row execute function public.guard_terms_version();
