-- Admin dispatch: direct status writes are rejected by guard_service_checkout for
-- offer-based bookings, so manual assignment and re-offering run here instead.
create function public.admin_assign_mechanic(p_booking uuid,p_mechanic uuid)
returns text language plpgsql security definer set search_path=public as $$
declare b service_bookings; duration integer;
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Administrator access required' using errcode='42501'; end if;
  select * into b from service_bookings where id=p_booking for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status not in ('pending','confirmed') or b.mechanic_id is not null then raise exception 'Booking is already %; reload to see the latest.',b.status; end if;
  if b.checkout_state not in ('legacy','offering','expired') then raise exception 'Booking is waiting on customer checkout'; end if;
  perform 1 from mechanic_profiles where id=p_mechanic and is_available for update;
  if not found then raise exception 'Mechanic is not available'; end if;
  duration:=greatest(30,coalesce((select sum(s.estimated_duration_minutes*i.quantity) from service_booking_items i
    join mechanic_services s on s.id=i.mechanic_service_id where i.service_booking_id=b.id),60));
  if exists(select 1 from service_bookings s where s.mechanic_id=p_mechanic and s.id<>b.id and s.status in ('assigned','en_route','in_progress')
    and tstzrange(s.scheduled_at,greatest(s.scheduled_at+make_interval(mins=>30+greatest(30,coalesce((select sum(ms.estimated_duration_minutes*i.quantity)::integer from service_booking_items i join mechanic_services ms on ms.id=i.mechanic_service_id where i.service_booking_id=s.id),60))),case when s.status in ('en_route','in_progress') then now()+interval '30 minutes' else s.scheduled_at end),'[)') && tstzrange(b.scheduled_at,b.scheduled_at+make_interval(mins=>duration+30),'[)')) then
    raise exception 'Mechanic already has a booking during this appointment';
  end if;
  if b.checkout_state='legacy' then
    update service_bookings set mechanic_id=p_mechanic,status='assigned' where id=b.id;
  else
    delete from mechanic_capacity where booking_id=b.id or (mechanic_id=p_mechanic and expires_at<=now());
    -- ponytail: 3-hour online payment hold because the customer is not waiting on an admin
    -- assignment like a live offer; make it a service setting if support needs to tune it.
    insert into mechanic_capacity(booking_id,mechanic_id,starts_at,ends_at,expires_at)
      values(b.id,p_mechanic,b.scheduled_at,b.scheduled_at+make_interval(mins=>duration+30),case when b.payment_method='online' then now()+interval '3 hours' end);
    update mechanic_offers set state='closed',responded_at=now() where booking_id=b.id and state='pending';
    update service_bookings set mechanic_id=p_mechanic,
      checkout_state=case when payment_method='cash' then 'confirmed'::service_checkout_state else 'awaiting_payment'::service_checkout_state end,
      status=case when payment_method='cash' then 'assigned'::booking_status else 'pending'::booking_status end,
      hold_expires_at=case when payment_method='online' then now()+interval '3 hours' end where id=b.id;
    perform public.notify_workflow(b.customer_id,'Mechanic assigned',case when b.payment_method='cash' then 'Confirmed. Cash is due after service.'
      else 'A mechanic has been assigned. Complete online payment within 3 hours to keep this appointment.' end,b.id,'service');
  end if;
  insert into admin_audit_logs(admin_id,action_type,record_type,record_id,details)
    values(auth.uid(),'assign','service_booking',b.id::text,jsonb_build_object('mechanic_id',p_mechanic,'before',b.checkout_state));
  return (select status::text from service_bookings where id=b.id);
end $$;

create function public.admin_reoffer_mechanics(p_booking uuid)
returns void language plpgsql security definer set search_path=public as $$
declare b service_bookings;
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Administrator access required' using errcode='42501'; end if;
  select * into b from service_bookings where id=p_booking for update;
  if not found or b.mechanic_id is not null or b.status not in ('pending','confirmed') or b.checkout_state not in ('offering','expired') then
    raise exception 'Only unassigned mechanic requests can be re-offered'; end if;
  delete from mechanic_offers where booking_id=b.id and state<>'declined';
  update service_bookings set checkout_state='offering',status='pending',offer_deadline=now()+interval '5 minutes' where id=b.id;
  perform public.offer_booking_mechanics(b.id);
end $$;

revoke all on function public.admin_assign_mechanic(uuid,uuid),public.admin_reoffer_mechanics(uuid) from public,anon;
grant execute on function public.admin_assign_mechanic(uuid,uuid),public.admin_reoffer_mechanics(uuid) to authenticated;
