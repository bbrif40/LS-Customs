-- =============================================================================
-- LS Customs — Fix audit trigger: mechanic_id only on service_bookings
-- =============================================================================
-- PL/pgSQL does NOT reliably short-circuit field access on RECORD types.
-- Use nested IF statements to guarantee mechanic_id is only accessed
-- when the trigger fires on service_bookings.
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
  booking_ref       text;
  audit_details     jsonb;
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

  -- ── Branch per table to avoid accessing columns that don't exist ──────────
  if TG_TABLE_NAME = 'service_bookings' then
    rec_type    := 'service_booking';
    booking_ref := new.booking_reference;   -- only service_bookings has this
    rec_title   := coalesce(booking_ref, 'service_booking #' || substring(new.id::text, 1, 8));

    -- Status change
    if old.status is distinct from new.status then
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
        'status_change', rec_type, new.id::text, rec_title, audit_details, now()
      );
    end if;

    -- Mechanic assignment (service_bookings ONLY — vehicle_bookings has no mechanic_id)
    if old.mechanic_id is distinct from new.mechanic_id then
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
        'assign', rec_type, new.id::text, rec_title, audit_details, now()
      );
    end if;

  else
    -- vehicle_bookings: only has status, no booking_reference or mechanic_id
    rec_type  := 'vehicle_booking';
    rec_title := 'vehicle_booking #' || substring(new.id::text, 1, 8);

    if old.status is distinct from new.status then
      audit_details := jsonb_build_object(
        'field',      'status',
        'old_status', old.status,
        'new_status', new.status
      );
      insert into public.admin_audit_logs (
        admin_id, admin_name, admin_email,
        action_type, record_type, record_id, record_title, details, created_at
      ) values (
        acting_user_id, acting_user_name, acting_user_email,
        'status_change', rec_type, new.id::text, rec_title, audit_details, now()
      );
    end if;
  end if;

  return new;
end;
$$;
