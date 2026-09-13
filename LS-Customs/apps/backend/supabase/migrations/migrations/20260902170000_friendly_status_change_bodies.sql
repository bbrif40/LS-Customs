-- Friendlier customer notification bodies for the transitions the
-- user explicitly named: completed and cancelled. The "assigned"
-- branch already has its own dedicated body (see the prior migration
-- for the mechanic-specific copy). All other transitions still fall
-- through to the generic "status changed from X to Y" line, which is
-- what the customer sees for en_route / in_progress.
--
-- We keep the same trigger function name and signature so the binding
-- in 20260819120527_triggers.sql (and the 20260902160000 overwrites)
-- keeps working without a re-install. The mechanic-side notification
-- branch is unchanged.
create or replace function public.notify_on_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_type  text;
  mech_id       uuid;
  mech_name     text;
  mech_phone    text;
  title_text    text;
  body_text     text;
begin
  booking_type := case when TG_TABLE_NAME = 'service_bookings' then 'service' else 'vehicle' end;

  -- Look up the assigned mechanic's contact details once. NULL when
  -- the booking has no mechanic attached (e.g. cancelled before
  -- assignment).
  if TG_TABLE_NAME = 'service_bookings' and new.mechanic_id is not null then
    select p.full_name, p.phone
      into mech_name, mech_phone
      from public.profiles p
     where p.id = new.mechanic_id;
  end if;

  -- Pick a title + body per status. The branch the user actually
  -- sees in the bell panel is body_text.
  if TG_TABLE_NAME = 'service_bookings' and new.status = 'assigned' and new.mechanic_id is not null then
    title_text := 'Mechanic assigned';
    body_text  := format('Your service is assigned to %s. They''ll be on the way at the scheduled time.', coalesce(mech_name, 'a mechanic'));
  elsif new.status = 'completed' then
    title_text := 'Service completed';
    body_text  := case
      when TG_TABLE_NAME = 'service_bookings'
        then format('Your mobile service with %s is done. Thanks for booking LS Customs!', coalesce(mech_name, 'your mechanic'))
      else 'Your rental is complete. Thanks for choosing LS Customs!'
    end;
  elsif new.status = 'cancelled' then
    title_text := 'Booking cancelled';
    body_text  := format('Your %s booking was cancelled. Book again whenever you''re ready.', booking_type);
  else
    title_text := 'Booking status changed';
    body_text  := format('Your %s booking status changed from %s to %s', booking_type, old.status, new.status);
  end if;

  insert into public.notifications (user_id, type, title, body, metadata)
  values (
    new.customer_id,
    'booking_status_changed',
    title_text,
    body_text,
    jsonb_build_object(
      'booking_id',   new.id,
      'booking_type', booking_type,
      'old_status',   old.status,
      'new_status',   new.status,
      'mechanic_id',    case when mech_name is not null then new.mechanic_id else null end,
      'mechanic_name',  mech_name,
      'mechanic_phone', mech_phone
    )
  );

  -- Mechanic-side notification when a service booking is freshly assigned.
  if TG_TABLE_NAME = 'service_bookings'
     and new.status = 'assigned'
     and new.mechanic_id is not null
     and new.mechanic_id is distinct from old.mechanic_id
  then
    insert into public.notifications (user_id, type, title, body, metadata)
    values (
      new.mechanic_id,
      'booking_status_changed',
      'New booking assigned',
      format('You have been assigned to booking %s by customer %s', new.id, new.customer_id),
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
