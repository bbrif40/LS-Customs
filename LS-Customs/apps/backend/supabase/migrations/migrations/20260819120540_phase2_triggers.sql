-- =============================================================================
-- LS Customs — Phase 2 Migration: Auth, Profiles & Rating/Status Triggers
-- =============================================================================
-- Implements triggers per DATABASE.md §5:
--   • handle_new_user   — auto-create profiles row on auth.users INSERT
--   • recalculate_vehicle_rating     — rollup avg/count on reviews targeting vehicles
--   • recalculate_mechanic_rating    — rollup avg/count on reviews targeting mechanics
--   • notify_on_status_change        — insert notification when booking status changes
--   • enforce_service_status_transition — reject illegal status jumps per role
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 5.1 handle_new_user: Auto-create profiles row on signup (DATABASE.md §5.1)
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      new.email
    ),
    'customer'::public.user_role
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 5.2 recalculate_vehicle_rating: Update vehicles.rating_avg / rating_count
--     AFTER INSERT/UPDATE/DELETE on reviews WHERE target_vehicle_id IS NOT NULL
-- -----------------------------------------------------------------------------
create or replace function public.recalculate_vehicle_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.vehicles
  set rating_avg = sub.avg_rating,
      rating_count = sub.review_count
  from (
    select
      avg(rating)::numeric(3,2)  as avg_rating,
      count(*)::int              as review_count
    from public.reviews
    where target_vehicle_id = COALESCE(new.target_vehicle_id, old.target_vehicle_id)
  ) sub
  where vehicles.id = COALESCE(new.target_vehicle_id, old.target_vehicle_id);

  return new;
end;
$$;

-- Split into separate triggers because PostgreSQL INSERT triggers
-- cannot reference OLD in the WHEN clause.
create trigger recalculate_vehicle_rating_ins
  after insert on public.reviews
  for each row
  when (new.target_vehicle_id is not null)
  execute function public.recalculate_vehicle_rating();

create trigger recalculate_vehicle_rating_upd
  after update on public.reviews
  for each row
  when (old.target_vehicle_id is not null or new.target_vehicle_id is not null)
  execute function public.recalculate_vehicle_rating();

create trigger recalculate_vehicle_rating_del
  after delete on public.reviews
  for each row
  when (old.target_vehicle_id is not null)
  execute function public.recalculate_vehicle_rating();

-- -----------------------------------------------------------------------------
-- 5.3 recalculate_mechanic_rating: Update mechanic_profiles.rating_avg / count
--     AFTER INSERT/UPDATE/DELETE on reviews WHERE target_mechanic_id IS NOT NULL
-- -----------------------------------------------------------------------------
create or replace function public.recalculate_mechanic_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.mechanic_profiles
  set rating_avg = sub.avg_rating,
      rating_count = sub.review_count
  from (
    select
      avg(rating)::numeric(3,2)  as avg_rating,
      count(*)::int              as review_count
    from public.reviews
    where target_mechanic_id = COALESCE(new.target_mechanic_id, old.target_mechanic_id)
  ) sub
  where mechanic_profiles.id = COALESCE(new.target_mechanic_id, old.target_mechanic_id);

  return new;
end;
$$;

-- Split into separate triggers because PostgreSQL INSERT triggers
-- cannot reference OLD in the WHEN clause.
create trigger recalculate_mechanic_rating_ins
  after insert on public.reviews
  for each row
  when (new.target_mechanic_id is not null)
  execute function public.recalculate_mechanic_rating();

create trigger recalculate_mechanic_rating_upd
  after update on public.reviews
  for each row
  when (old.target_mechanic_id is not null or new.target_mechanic_id is not null)
  execute function public.recalculate_mechanic_rating();

create trigger recalculate_mechanic_rating_del
  after delete on public.reviews
  for each row
  when (old.target_mechanic_id is not null)
  execute function public.recalculate_mechanic_rating();

-- -----------------------------------------------------------------------------
-- 5.4 notify_on_status_change: Insert notification when booking status changes
--     AFTER UPDATE OF status on vehicle_bookings and service_bookings
-- -----------------------------------------------------------------------------
-- Uses TG_TABLE_NAME to support both tables in a single function.
-- Accesses mechanic_id only inside the service_bookings conditional block
-- (PL/pgSQL resolves record field access at runtime, so this is safe).
-- -----------------------------------------------------------------------------
create or replace function public.notify_on_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_type text;
  mech_id     uuid;
begin
  booking_type := case when TG_TABLE_NAME = 'service_bookings' then 'service' else 'vehicle' end;

  -- Notify the customer of the status change
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

  -- For service bookings, also notify the mechanic when they are newly assigned
  if TG_TABLE_NAME = 'service_bookings' then
     -- Use JSON field access because this trigger is also attached to
     -- vehicle_bookings, whose row type has no mechanic_id column.
     mech_id := nullif(to_jsonb(new)->>'mechanic_id', '')::uuid;
    if new.status = 'assigned'
       and mech_id is not null
       and mech_id IS DISTINCT FROM nullif(to_jsonb(old)->>'mechanic_id', '')::uuid then
      insert into public.notifications (user_id, type, title, body, metadata)
      values (
        mech_id,
        'booking_status_changed',
        'New booking assigned',
        format('You have been assigned to booking %s by customer %s',
               new.id, new.customer_id),
        jsonb_build_object(
          'booking_id',    new.id,
          'customer_id',   new.customer_id,
          'scheduled_at',  new.scheduled_at
        )
      );
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_notify_vehicle_booking_status
  after update of status on public.vehicle_bookings
  for each row execute function public.notify_on_status_change();

create trigger trg_notify_service_booking_status
  after update of status on public.service_bookings
  for each row execute function public.notify_on_status_change();

-- -----------------------------------------------------------------------------
-- 5.5 enforce_service_status_transition: Prevent illegal status jumps (DATABASE.md §5.5)
-- -----------------------------------------------------------------------------
-- Validates that the status transition is legal per the caller's role:
--   • Customer: may only cancel (pending → cancelled)
--   • Mechanic: may only advance forward (assigned → en_route → in_progress → completed)
--   • Admin: unrestricted
--
-- This is the second line of defense — the first is the RLS WITH CHECK clauses.
-- -----------------------------------------------------------------------------
create or replace function public.enforce_service_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role public.user_role;
begin
  -- Service role bypass: Edge Functions (createServiceClient) use a JWT with
  -- role='service_role' but no sub claim. auth.uid() returns NULL, so
  -- current_role() returns NULL — we must check JWT claims directly.
  -- COALESCE guards against request.jwt.claims being unset (direct SQL sessions)
  -- which produces NULL, not a parse error.
  -- Consolidated from 20260819120550_fix_service_role_trigger.sql
  if COALESCE(current_setting('request.jwt.claims', true), '{}')::jsonb ->> 'role' = 'service_role' then
    return new;
  end if;

  -- Admins can make any transition
  select public.current_role() into caller_role;
  if caller_role = 'admin' then
    return new;
  end if;

  -- No auth context or unknown role
  if caller_role is null then
    raise exception 'Unauthorized: cannot update booking status without a profile';
  end if;

  -- Customer: only pending → cancelled
  if caller_role = 'customer' then
    if old.status != 'pending' or new.status != 'cancelled' then
      raise exception 'Customer may only cancel a pending booking (pending → cancelled)';
    end if;
    return new;
  end if;

  -- Mechanic: only forward transitions
  if caller_role = 'mechanic' then
    if new.status = old.status then
      return new;  -- no-op, no transition
    end if;

    case old.status
      when 'assigned'   then
        if new.status not in ('en_route') then
          raise exception 'Mechanic may only advance: assigned → en_route';
        end if;
      when 'en_route' then
        if new.status not in ('in_progress') then
          raise exception 'Mechanic may only advance: en_route → in_progress';
        end if;
      when 'in_progress' then
        if new.status not in ('completed') then
          raise exception 'Mechanic may only advance: in_progress → completed';
        end if;
      else
        raise exception 'Mechanic cannot update status from %', old.status;
    end case;
    return new;
  end if;

  return new;
end;
$$;

create trigger trg_enforce_service_status_transition
  before update of status on public.service_bookings
  for each row execute function public.enforce_service_status_transition();

-- -----------------------------------------------------------------------------
-- 5.6 Row-level privilege for auth.users trigger
-- -----------------------------------------------------------------------------
-- The handle_new_user trigger fires as the auth.users row creator.
-- Since auth.users is in the auth schema, we need to ensure the trigger
-- function can INSERT into public.profiles. The SECURITY DEFINER + set
-- search_path = public handles this, but we also grant execute explicitly.
grant execute on function public.handle_new_user() to public;
grant execute on function public.recalculate_vehicle_rating() to public;
grant execute on function public.recalculate_mechanic_rating() to public;
grant execute on function public.notify_on_status_change() to public;
grant execute on function public.enforce_service_status_transition() to public;
