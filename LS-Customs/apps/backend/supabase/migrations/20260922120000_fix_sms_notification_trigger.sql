-- Fix and enrich notify_on_status_change() trigger for both vehicle & service bookings.
-- Ensures that when a mechanic is assigned to a service booking, customer notification
-- receives mechanic_name, mechanic_phone, and dispatch_sms = true.
-- Also safely handles vehicle_bookings (which has no mechanic_id column).

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
    body_text    := format('Your service is assigned to %s. They will arrive at your scheduled time.', coalesce(mech_name, 'a mechanic'));
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
