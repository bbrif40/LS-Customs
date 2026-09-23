-- =============================================================================
-- LS Customs — Admin Audit Logs Schema & Automated Triggers
-- =============================================================================
-- Provides comprehensive audit tracking:
--   1. admin_audit_logs table storing admin actions & record views
--   2. Indexes for high-performance filtering and timeline querying
--   3. Strict RLS policies allowing only admins to view and log audits
--   4. Triggers on service_bookings & vehicle_bookings for status & mechanic changes
-- =============================================================================

create table if not exists public.admin_audit_logs (
  id           uuid primary key default gen_random_uuid(),
  admin_id     uuid references auth.users(id) on delete set null,
  admin_name   text not null default 'Admin',
  admin_email  text not null default '',
  action_type  text not null, -- 'view', 'status_change', 'assign', 'update', 'create', 'delete'
  record_type  text not null, -- 'service_booking', 'vehicle_booking', 'ticket', 'vehicle', 'mechanic', 'user', 'service'
  record_id    text not null,
  record_title text,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

-- Indexes for lightning-fast queries in Admin Audit Logs & Record Drawer audits
create index if not exists idx_admin_audit_logs_record
  on public.admin_audit_logs (record_type, record_id);

create index if not exists idx_admin_audit_logs_admin
  on public.admin_audit_logs (admin_id);

create index if not exists idx_admin_audit_logs_created_at
  on public.admin_audit_logs (created_at desc);

create index if not exists idx_admin_audit_logs_action
  on public.admin_audit_logs (action_type);

-- RLS setup
alter table public.admin_audit_logs enable row level security;

-- Only admins can view audit logs
drop policy if exists "admin_audit_logs_select" on public.admin_audit_logs;
create policy "admin_audit_logs_select"
  on public.admin_audit_logs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- Only admins can insert audit logs (for client-side view tracking)
drop policy if exists "admin_audit_logs_insert" on public.admin_audit_logs;
create policy "admin_audit_logs_insert"
  on public.admin_audit_logs
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- Service role bypass for triggers / backend workers
grant all on public.admin_audit_logs to authenticated, service_role;

-- ── Automated Trigger for Booking Status & Mechanic Changes ─────────────────
create or replace function public.log_admin_booking_mutation()
returns trigger
language plpgsql
security definer
as $$
declare
  acting_user_id   uuid;
  acting_user_name text := 'System / Admin';
  acting_user_email text := '';
  rec_type         text;
  rec_title        text;
  action_name      text := 'update';
  audit_details    jsonb := '{}'::jsonb;
begin
  acting_user_id := auth.uid();

  -- If triggered by an authenticated session, lookup the profile name & email
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

  rec_type := case when TG_TABLE_NAME = 'service_bookings' then 'service_booking' else 'vehicle_booking' end;
  rec_title := coalesce(new.booking_reference, TG_TABLE_NAME || ' #' || substring(new.id::text, 1, 8));

  -- Detect status change
  if (old.status is distinct from new.status) then
    action_name := 'status_change';
    audit_details := jsonb_build_object(
      'field', 'status',
      'old_status', old.status,
      'new_status', new.status,
      'booking_reference', new.booking_reference
    );

    insert into public.admin_audit_logs (
      admin_id, admin_name, admin_email, action_type, record_type, record_id, record_title, details, created_at
    ) values (
      acting_user_id, acting_user_name, acting_user_email, action_name, rec_type, new.id::text, rec_title, audit_details, now()
    );
  end if;

  -- Detect mechanic assignment on service_bookings
  if TG_TABLE_NAME = 'service_bookings' and (old.mechanic_id is distinct from new.mechanic_id) then
    action_name := 'assign';
    audit_details := jsonb_build_object(
      'field', 'mechanic_id',
      'old_mechanic_id', old.mechanic_id,
      'new_mechanic_id', new.mechanic_id,
      'booking_reference', new.booking_reference
    );

    insert into public.admin_audit_logs (
      admin_id, admin_name, admin_email, action_type, record_type, record_id, record_title, details, created_at
    ) values (
      acting_user_id, acting_user_name, acting_user_email, action_name, rec_type, new.id::text, rec_title, audit_details, now()
    );
  end if;

  return new;
end;
$$;

-- Trigger on service_bookings
drop trigger if exists trg_audit_service_bookings on public.service_bookings;
create trigger trg_audit_service_bookings
  after update on public.service_bookings
  for each row
  execute function public.log_admin_booking_mutation();

-- Trigger on vehicle_bookings
drop trigger if exists trg_audit_vehicle_bookings on public.vehicle_bookings;
create trigger trg_audit_vehicle_bookings
  after update on public.vehicle_bookings
  for each row
  execute function public.log_admin_booking_mutation();
