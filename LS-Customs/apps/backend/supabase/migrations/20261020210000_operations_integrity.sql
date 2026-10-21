-- Keep provider outcomes server-managed even though all admins share one role.
create function public.guard_provider_payment() returns trigger language plpgsql as $$
begin
  if current_user not in ('postgres','supabase_admin','service_role') and coalesce(new.provider,'') not in ('cash','admin_violation') then
    raise exception 'Online payments are managed by verified provider outcomes' using errcode='42501';
  end if;
  return new;
end $$;
create trigger provider_payment_guard before insert or update on public.payments for each row execute function public.guard_provider_payment();

alter table public.admin_audit_logs add column server_recorded boolean not null default false;
create function public.stamp_audit_origin() returns trigger language plpgsql as $$
begin
  new.server_recorded:=current_user in ('postgres','supabase_admin','service_role');
  if not new.server_recorded then new.admin_id:=auth.uid(); end if;
  return new;
end $$;
create trigger audit_origin before insert on public.admin_audit_logs for each row execute function public.stamp_audit_origin();
create trigger audit_append_only before update or delete on public.admin_audit_logs for each row execute function public.reject_financial_history_mutation();
create function public.audit_financial_event() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into admin_audit_logs(admin_id,action_type,record_type,record_id,details)
    values(new.actor_id,'account_'||new.kind::text,'account_charge',new.charge_id::text,
      jsonb_build_object('event_id',new.id,'amount',new.amount,'reason',new.reason,'before',new.before_value,'after',new.after_value));
  return new;
end $$;
create trigger account_event_audit after insert on public.account_events for each row execute function public.audit_financial_event();
create function public.audit_payment_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into admin_audit_logs(admin_id,action_type,record_type,record_id,details)
    values(auth.uid(),case when tg_op='INSERT' then 'payment_created' else 'payment_updated' end,'payment',new.id::text,
      jsonb_build_object('amount',new.amount,'before',case when tg_op='UPDATE' then to_jsonb(old)-'provider_reference' else '{}'::jsonb end,
        'after',to_jsonb(new)-'provider_reference'));
  return new;
end $$;
create trigger payment_change_audit after insert or update on public.payments for each row execute function public.audit_payment_change();

create function public.manage_cash_pickup(p_booking uuid,p_arrived boolean,p_extension timestamptz,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare b vehicle_bookings;
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Administrator access required' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Enter an arrival or extension reason'; end if;
  select * into b from vehicle_bookings where id=p_booking for update;
  if not found or b.checkout_state<>'cash_confirmed' or b.pickup_deadline<=now() then raise exception 'Cash pickup reservation is no longer active'; end if;
  if p_extension is not null and (p_extension<=b.pickup_deadline or p_extension>=b.return_at) then raise exception 'Extend pickup to a later time before the rental return deadline'; end if;
  update vehicle_bookings set arrived_at=case when p_arrived then coalesce(arrived_at,now()) else arrived_at end,
    pickup_deadline=coalesce(p_extension,pickup_deadline) where id=b.id;
  insert into admin_audit_logs(admin_id,action_type,record_type,record_id,details)
    values(auth.uid(),'cash_pickup_update','vehicle_booking',b.id::text,jsonb_build_object('reason',p_reason,'before',jsonb_build_object('arrived_at',b.arrived_at,'deadline',b.pickup_deadline),'arrived',p_arrived,'new_deadline',coalesce(p_extension,b.pickup_deadline)));
  perform public.notify_workflow(b.customer_id,'Cash pickup arrangement updated',p_reason||'. Pickup deadline: '||coalesce(p_extension,b.pickup_deadline)::text,b.id,'vehicle');
end $$;

create function public.report_blocked_service(p_booking uuid,p_reason text) returns void language plpgsql security definer set search_path=public as $$
declare b service_bookings;
begin
  select * into b from service_bookings where id=p_booking and mechanic_id=auth.uid() and status in ('assigned','en_route','in_progress');
  if not found or length(trim(coalesce(p_reason,'')))<5 then raise exception 'An assigned active booking and issue description are required' using errcode='42501'; end if;
  insert into operations_queue(source_key,kind,customer_id,booking_id,title,details)
    values('blocked_service:'||b.id,'service_review',b.customer_id,b.id,'Original service cannot proceed; support review required',jsonb_build_object('reason',left(p_reason,2000)))
    on conflict(source_key) do update set closed_at=null,details=excluded.details;
  perform public.notify_workflow(b.customer_id,'Service needs support review','The original work cannot proceed as booked. No unapproved extra work will be charged. '||left(p_reason,2000),b.id,'service');
end $$;

create function public.get_open_mechanic_offers() returns jsonb language sql stable security definer set search_path=public as $$
select jsonb_build_object(
 'offers',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'booking_id',b.id,'expires_at',o.expires_at,'scheduled_at',b.scheduled_at,
   'city',a.city,'services',(select string_agg(s.name,', ') from service_booking_items i join mechanic_services s on s.id=i.mechanic_service_id where i.service_booking_id=b.id)))
   from mechanic_offers o join service_bookings b on b.id=o.booking_id left join service_areas a on a.id=b.service_area_id
   where o.mechanic_id=auth.uid() and o.state='pending' and o.expires_at>now()),'[]'::jsonb),
 'changes',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'request_id',r.id,'expires_at',o.expires_at,'scheduled_at',r.payload->>'new_schedule',
   'city',a.city,'services',(select string_agg(s.name,', ') from service_booking_items i join mechanic_services s on s.id=i.mechanic_service_id where i.service_booking_id=b.id)))
   from mechanic_change_offers o join booking_requests r on r.id=o.request_id join service_bookings b on b.id=r.booking_id left join service_areas a on a.id=b.service_area_id
   where o.mechanic_id=auth.uid() and o.state='pending' and o.expires_at>now()),'[]'::jsonb));
$$;
revoke all on function public.manage_cash_pickup(uuid,boolean,timestamptz,text),public.report_blocked_service(uuid,text),public.get_open_mechanic_offers() from public,anon;
grant execute on function public.manage_cash_pickup(uuid,boolean,timestamptz,text),public.report_blocked_service(uuid,text),public.get_open_mechanic_offers() to authenticated;

create or replace function public.notify_workflow(p_customer uuid,p_title text,p_body text,p_booking uuid,p_type text)
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into notifications(user_id,type,title,body,metadata) values(p_customer,'workflow_decision',p_title,
    p_body||E'\nView booking: https://ls-customs-web.vercel.app/bookings?booking_id='||p_booking::text,
    jsonb_build_object('booking_id',p_booking,'booking_type',p_type,'in_app_delivered_at',now(),'email_required',true));
end $$;
