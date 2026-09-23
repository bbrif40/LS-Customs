-- =============================================================================
-- LS Customs — Fix admin audit trigger: booking_reference only on service_bookings
-- =============================================================================
-- vehicle_bookings does NOT have a booking_reference column.
-- Replace the trigger function with a table-aware version that only reads
-- booking_reference when operating on service_bookings.
-- =============================================================================

create or replace function public.log_admin_booking_mutation()
returns trigger
language plpgsql
security definer
as $$
declare
  acting_user_id    uuid;
  acting_user_name  text := 'System / Admin';
  acting_user_email text := '';
  rec_type          text;
  rec_title         text;
  action_name       text := 'update';
  audit_details     jsonb := '{}'::jsonb;
  booking_ref       text;
begin
  acting_user_id := auth.uid();

  -- Resolve admin name and email from session
  if acting_user_id is not null then
    select coalesce(p.full_name, 'Admin'), coalesce(u.email, '')
      into acting_user_name, acting_user_email
      from public.profiles p
      left join auth.users u on u.id = p.id
     where p.id = acting_user_id;

    if acting_user_name is null or acting_user_name = '' then
      acting_user_name := 'Admin User';
    end if;
  end if;

  -- Determine record type and safe booking reference
  if TG_TABLE_NAME = 'service_bookings' then
    rec_type    := 'service_booking';
    booking_ref := new.booking_reference;           -- only service_bookings has this column
  else
    rec_type    := 'vehicle_booking';
    booking_ref := null;                            -- vehicle_bookings does NOT have booking_reference
  end if;

  rec_title := coalesce(booking_ref, rec_type || ' #' || substring(new.id::text, 1, 8));

  -- ── Status change ─────────────────────────────────────────────────────────
  if (old.status is distinct from new.status) then
    action_name := 'status_change';
    audit_details := jsonb_build_object(
      'field',             'status',
      'old_status',        old.status,
      'new_status',        new.status,
      'booking_reference', booking_ref
    );

    insert into public.admin_audit_logs (
      admin_id, admin_name, admin_email,
      action_type, record_type, record_id, record_title, details, created_at
    ) values (
      acting_user_id, acting_user_name, acting_user_email,
      action_name, rec_type, new.id::text, rec_title, audit_details, now()
    );
  end if;

  -- ── Mechanic assignment (service_bookings only) ───────────────────────────
  if TG_TABLE_NAME = 'service_bookings' and (old.mechanic_id is distinct from new.mechanic_id) then
    action_name := 'assign';
    audit_details := jsonb_build_object(
      'field',             'mechanic_id',
      'old_mechanic_id',   old.mechanic_id,
      'new_mechanic_id',   new.mechanic_id,
      'booking_reference', booking_ref
    );

    insert into public.admin_audit_logs (
      admin_id, admin_name, admin_email,
      action_type, record_type, record_id, record_title, details, created_at
    ) values (
      acting_user_id, acting_user_name, acting_user_email,
      action_name, rec_type, new.id::text, rec_title, audit_details, now()
    );
  end if;

  return new;
end;
$$;
