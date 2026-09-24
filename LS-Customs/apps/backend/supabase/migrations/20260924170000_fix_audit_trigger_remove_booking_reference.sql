-- =============================================================================
-- LS Customs — Fix audit triggers: Remove non-existent booking_reference
-- =============================================================================
-- Neither service_bookings nor vehicle_bookings has a booking_reference column.
-- Attempting to read new.booking_reference throws:
--   record "new" has no field "booking_reference" (Code: 42703).
--
-- Furthermore, vehicle_bookings has no mechanic_id column.
-- To completely avoid cross-table column resolution failures in PL/pgSQL,
-- dedicated trigger functions are used for service_bookings and vehicle_bookings.
-- =============================================================================

-- 1. Service bookings audit trigger function (has status and mechanic_id)
create or replace function public.log_admin_service_booking_mutation()
returns trigger
language plpgsql
security definer
as $$
declare
  acting_user_id    uuid;
  acting_user_name  text := 'System / Admin';
  acting_user_email text := '';
  rec_title         text;
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

  rec_title := 'Service #' || substring(new.id::text, 1, 8);

  -- Status change
  if old.status is distinct from new.status then
    audit_details := jsonb_build_object(
      'field',       'status',
      'old_status',  old.status,
      'new_status',  new.status,
      'booking_id',  new.id::text
    );
    insert into public.admin_audit_logs (
      admin_id, admin_name, admin_email,
      action_type, record_type, record_id, record_title, details, created_at
    ) values (
      acting_user_id, acting_user_name, acting_user_email,
      'status_change', 'service_booking', new.id::text, rec_title, audit_details, now()
    );
  end if;

  -- Mechanic assignment
  if old.mechanic_id is distinct from new.mechanic_id then
    audit_details := jsonb_build_object(
      'field',            'mechanic_id',
      'old_mechanic_id',  old.mechanic_id,
      'new_mechanic_id',  new.mechanic_id,
      'booking_id',       new.id::text
    );
    insert into public.admin_audit_logs (
      admin_id, admin_name, admin_email,
      action_type, record_type, record_id, record_title, details, created_at
    ) values (
      acting_user_id, acting_user_name, acting_user_email,
      'assign', 'service_booking', new.id::text, rec_title, audit_details, now()
    );
  end if;

  return new;
end;
$$;

-- 2. Vehicle bookings audit trigger function (has status only, no mechanic_id)
create or replace function public.log_admin_vehicle_booking_mutation()
returns trigger
language plpgsql
security definer
as $$
declare
  acting_user_id    uuid;
  acting_user_name  text := 'System / Admin';
  acting_user_email text := '';
  rec_title         text;
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

  rec_title := 'Rental #' || substring(new.id::text, 1, 8);

  -- Status change
  if old.status is distinct from new.status then
    audit_details := jsonb_build_object(
      'field',       'status',
      'old_status',  old.status,
      'new_status',  new.status,
      'booking_id',  new.id::text
    );
    insert into public.admin_audit_logs (
      admin_id, admin_name, admin_email,
      action_type, record_type, record_id, record_title, details, created_at
    ) values (
      acting_user_id, acting_user_name, acting_user_email,
      'status_change', 'vehicle_booking', new.id::text, rec_title, audit_details, now()
    );
  end if;

  return new;
end;
$$;

-- 3. Legacy trigger function fallback
create or replace function public.log_admin_booking_mutation()
returns trigger
language plpgsql
security definer
as $$
begin
  if TG_TABLE_NAME = 'service_bookings' then
    return public.log_admin_service_booking_mutation();
  else
    return public.log_admin_vehicle_booking_mutation();
  end if;
end;
$$;

-- 4. Re-attach triggers to dedicated functions
drop trigger if exists trg_audit_service_bookings on public.service_bookings;
create trigger trg_audit_service_bookings
  after update on public.service_bookings
  for each row
  execute function public.log_admin_service_booking_mutation();

drop trigger if exists trg_audit_vehicle_bookings on public.vehicle_bookings;
create trigger trg_audit_vehicle_bookings
  after update on public.vehicle_bookings
  for each row
  execute function public.log_admin_vehicle_booking_mutation();
