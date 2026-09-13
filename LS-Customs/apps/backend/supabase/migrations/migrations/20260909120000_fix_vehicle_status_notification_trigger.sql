-- Fix the shared booking-status trigger for vehicle rentals.
-- vehicle_bookings has no mechanic_id column, so direct NEW/OLD field access
-- fails before the trigger can finish the vehicle status update.
create or replace function public.notify_on_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_type text;
  mech_id uuid;
  old_mech_id uuid;
begin
  booking_type := case when TG_TABLE_NAME = 'service_bookings' then 'service' else 'vehicle' end;

  insert into public.notifications (user_id, type, title, body, metadata)
  values (
    new.customer_id,
    'booking_status_changed',
    'Booking status changed',
    format('Your %s booking status changed from %s to %s',
           booking_type, old.status, new.status),
    jsonb_build_object(
      'booking_id', new.id,
      'booking_type', booking_type,
      'old_status', old.status,
      'new_status', new.status
    )
  );

  if TG_TABLE_NAME = 'service_bookings' then
    mech_id := nullif(to_jsonb(new)->>'mechanic_id', '')::uuid;
    old_mech_id := nullif(to_jsonb(old)->>'mechanic_id', '')::uuid;
    if new.status = 'assigned'
       and mech_id is not null
       and mech_id is distinct from old_mech_id then
      insert into public.notifications (user_id, type, title, body, metadata)
      values (
        mech_id,
        'booking_status_changed',
        'New booking assigned',
        format('You have been assigned to booking %s by customer %s',
               new.id, new.customer_id),
        jsonb_build_object(
          'booking_id', new.id,
          'customer_id', new.customer_id,
          'scheduled_at', new.scheduled_at
        )
      );
    end if;
  end if;

  return new;
end;
$$;