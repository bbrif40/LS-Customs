-- Customer assignment notifications (the SMS text) carry the mechanic's contact number.
create or replace function public.notify_on_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_type    text;
  mech_id         uuid;
  old_mech_id     uuid;
  mech_name       text;
  mech_phone      text;
  title_text      text;
  body_text       text;
  dispatch_sms    boolean := false;
begin
  booking_type := case when TG_TABLE_NAME = 'service_bookings' then 'service' else 'vehicle' end;

  -- Safely extract mechanic_id only when table is service_bookings
  if TG_TABLE_NAME = 'service_bookings' then
    mech_id := nullif(to_jsonb(new)->>'mechanic_id', '')::uuid;
    old_mech_id := nullif(to_jsonb(old)->>'mechanic_id', '')::uuid;

    if mech_id is not null then
      select p.full_name, p.phone
        into mech_name, mech_phone
        from public.profiles p
       where p.id = mech_id;
    end if;
  end if;

  -- Build title and friendly body
  if TG_TABLE_NAME = 'service_bookings' and new.status = 'assigned' and mech_id is not null then
    title_text   := 'Mechanic assigned';
    body_text    := format('Your service is assigned to %s%s. They will arrive at your scheduled time.', coalesce(mech_name, 'a mechanic'),
      coalesce(' (contact: '||nullif(trim(mech_phone),'')||')', ''));
    dispatch_sms := true;
  elsif new.status = 'completed' then
    title_text := case when TG_TABLE_NAME = 'service_bookings' then 'Service completed' else 'Rental completed' end;
    body_text  := case
      when TG_TABLE_NAME = 'service_bookings'
        then format('Your mobile service with %s is complete. Thank you for booking with LS Customs!', coalesce(mech_name, 'your mechanic'))
      else 'Your vehicle rental is complete. Thank you for choosing LS Customs!'
    end;
  elsif new.status = 'cancelled' then
    title_text := 'Booking cancelled';
    body_text  := format('Your %s booking was cancelled. Feel free to book again whenever you need service.', booking_type);
  else
    title_text := 'Booking status changed';
    body_text  := format('Your %s booking status changed from %s to %s', booking_type, old.status, new.status);
  end if;

  -- Insert customer notification
  insert into public.notifications (user_id, type, title, body, metadata)
  values (
    new.customer_id,
    'booking_status_changed',
    title_text,
    body_text,
    jsonb_build_object(
      'booking_id',     new.id,
      'booking_type',   booking_type,
      'old_status',     old.status,
      'new_status',     new.status,
      'mechanic_id',    mech_id,
      'mechanic_name',  mech_name,
      'mechanic_phone', mech_phone,
      'dispatch_sms',   dispatch_sms
    )
  );

  -- Mechanic-side notification when a service booking is freshly assigned
  if TG_TABLE_NAME = 'service_bookings'
     and new.status = 'assigned'
     and mech_id is not null
     and (old_mech_id is null or mech_id is distinct from old_mech_id)
  then
    insert into public.notifications (user_id, type, title, body, metadata)
    values (
      mech_id,
      'booking_status_changed',
      'New booking assigned',
      format('You have been assigned to service booking #%s.', substring(new.id::text from 1 for 8)),
      jsonb_build_object(
        'booking_id',   new.id,
        'booking_type', 'service',
        'customer_id',  new.customer_id,
        'scheduled_at', new.scheduled_at
      )
    );
  end if;

  return new;
end;
$$;

create or replace function public.admin_assign_mechanic(p_booking uuid,p_mechanic uuid)
returns text language plpgsql security definer set search_path=public as $$
declare b service_bookings; duration integer; contact text;
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
    select coalesce(full_name,'Your mechanic')||coalesce(' (contact: '||nullif(trim(phone),'')||')','') into contact from profiles where id=p_mechanic;
    perform public.notify_workflow(b.customer_id,'Mechanic assigned',case when b.payment_method='cash' then contact||' is assigned. Confirmed; cash is due after service.'
      else contact||' is assigned. Complete online payment within 3 hours to keep this appointment.' end,b.id,'service');
  end if;
  insert into admin_audit_logs(admin_id,action_type,record_type,record_id,details)
    values(auth.uid(),'assign','service_booking',b.id::text,jsonb_build_object('mechanic_id',p_mechanic,'before',b.checkout_state));
  return (select status::text from service_bookings where id=b.id);
end $$;

-- Claiming an operations item hands it to that admin: it leaves the action queue
-- (the queue lists unclaimed items) and the hand-off is recorded in the audit log.
create or replace function public.claim_operations_item(p_id uuid,p_owner uuid)
returns void language plpgsql security definer set search_path=public as $$
declare q operations_queue;
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Administrator access required' using errcode='42501'; end if;
  if p_owner is not null and not exists(select 1 from profiles where id=p_owner and role='admin') then raise exception 'Choose an admin'; end if;
  update operations_queue set claimed_by=p_owner where id=p_id and closed_at is null returning * into q;
  if not found then raise exception 'Queue item unavailable'; end if;
  insert into admin_audit_logs(admin_id,admin_name,action_type,record_type,record_id,record_title,details)
    values(auth.uid(),coalesce((select full_name from profiles where id=auth.uid()),'Admin'),case when p_owner is null then 'release' else 'claim' end,
      'operations_queue',q.id::text,q.title,jsonb_build_object('kind',q.kind,'booking_id',q.booking_id,'customer_id',q.customer_id,'claimed_by',p_owner,'details',q.details));
end $$;

-- Items claimed before this change move to the audit log too.
insert into admin_audit_logs(admin_id,admin_name,action_type,record_type,record_id,record_title,details)
  select q.claimed_by,coalesce(p.full_name,'Admin'),'claim','operations_queue',q.id::text,q.title,
    jsonb_build_object('kind',q.kind,'booking_id',q.booking_id,'customer_id',q.customer_id,'claimed_by',q.claimed_by,'details',q.details)
  from operations_queue q left join profiles p on p.id=q.claimed_by where q.claimed_by is not null and q.closed_at is null;
