-- Enrich the customer notification that fires when a service booking
-- is assigned to a mechanic. Adds mechanic_id / mechanic_name / mechanic_phone
-- to the metadata so the customer-side bell notification can render
-- "Your service was assigned to <name>" and the Bookings tab can show
-- the assigned mechanic's contact details.
--
-- Replaces notify_on_status_change() in place; the existing triggers
-- and other branches are preserved.
--
-- ponytail: when a status flips to 'assigned' without a mechanic_id (e.g.
-- a stray admin click), we keep the original generic body. When a mechanic
-- IS attached, the body becomes a friendly assignment line and the
-- metadata carries enough for the client to deep-link to the booking.

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
begin
  booking_type := case when TG_TABLE_NAME = 'service_bookings' then 'service' else 'vehicle' end;

  -- Look up the assigned mechanic's contact details once, for both the
  -- mechanic-side notification (if applicable) and the enriched customer
  -- notification. NULL when no mechanic is attached.
  if TG_TABLE_NAME = 'service_bookings' and new.mechanic_id is not null then
    select p.full_name, p.phone
      into mech_name, mech_phone
      from public.profiles p
     where p.id = new.mechanic_id;
  end if;

  -- Customer notification. The body changes for an "assigned" service
  -- booking that came with a mechanic — this is the line the customer
  -- actually sees in the bell panel.
  if TG_TABLE_NAME = 'service_bookings'
     and new.status = 'assigned'
     and new.mechanic_id is not null
     and new.mechanic_id is distinct from old.mechanic_id
  then
    insert into public.notifications (user_id, type, title, body, metadata)
    values (
      new.customer_id,
      'booking_status_changed',
      'Mechanic assigned',
      format('Your service is assigned to %s. They''ll be on the way at the scheduled time.', coalesce(mech_name, 'a mechanic')),
      jsonb_build_object(
        'booking_id',     new.id,
        'booking_type',   'service',
        'old_status',     old.status,
        'new_status',     new.status,
        'mechanic_id',    new.mechanic_id,
        'mechanic_name',  mech_name,
        'mechanic_phone', mech_phone
      )
    );
  else
    insert into public.notifications (user_id, type, title, body, metadata)
    values (
      new.customer_id,
      'booking_status_changed',
      'Booking status changed',
      format('Your %s booking status changed from %s to %s',
             booking_type, old.status, new.status),
      jsonb_build_object(
        'booking_id',   new.id,
        'booking_type', booking_type,
        'old_status',   old.status,
        'new_status',   new.status
      )
    );
  end if;

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
      format('You have been assigned to booking %s by customer %s',
             new.id, new.customer_id),
      jsonb_build_object(
        'booking_id',    new.id,
        'booking_type',  'service',
        'customer_id',   new.customer_id,
        'scheduled_at',  new.scheduled_at
      )
    );
  end if;

  return new;
end;
$$;

-- Trigger function signature is unchanged, so the existing
-- trg_notify_vehicle_booking_status and trg_notify_service_booking_status
-- triggers continue to fire without re-creation.
