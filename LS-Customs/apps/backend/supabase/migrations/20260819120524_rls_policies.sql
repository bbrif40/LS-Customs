-- =============================================================================
-- LS Customs — Phase 1 Migration 3: RLS Policies & Helper Functions
-- =============================================================================
-- Creates role-check helper functions and all RLS policies per DATABASE.md §4.
-- Also creates the SECURITY DEFINER function for public mechanic access.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper Functions (DATABASE.md §4, created here so policies can reference them)
-- -----------------------------------------------------------------------------

create or replace function public.current_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_role() = 'admin';
$$;

create or replace function public.is_mechanic() returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_role() = 'mechanic';
$$;

-- -----------------------------------------------------------------------------
-- Public access path: SECURITY DEFINER function for customers to browse mechanics
-- -----------------------------------------------------------------------------
-- Owned by postgres (superuser with BYPASSRLS), so RLS is bypassed.
-- Returns only non-sensitive columns: name, rating, specialties, experience.
-- This is the mechanism described in DATABASE.md §4.5.

create or replace function public.get_public_mechanics()
returns table (
  id               uuid,
  full_name        text,
  rating_avg       numeric(3,2),
  rating_count     int,
  specialties      text[],
  years_experience int
)
language sql
security definer
set search_path = public
as $$
  select
    mp.id,
    p.full_name,
    mp.rating_avg,
    mp.rating_count,
    mp.specialties,
    mp.years_experience
  from public.mechanic_profiles mp
  join public.profiles p on p.id = mp.id
  where mp.is_available = true;
$$;

grant execute on function public.get_public_mechanics() to public;

-- -----------------------------------------------------------------------------
-- 4.1 profiles
--   Select: own row; admins read all.
--   Update: own row (except role — role protection via trigger in Phase 2);
--           admins update any row including role.
--   Insert: blocked from client (only handle_new_user trigger inserts).
-- -----------------------------------------------------------------------------
create policy "profiles select"
  on public.profiles
  for select
  using (auth.uid() = id or public.is_admin());

create policy "profiles update self"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles update admin"
  on public.profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No INSERT policy — blocked by default (only trigger can insert).
-- No DELETE policy — profiles are never deleted directly (cascade handles it).

-- -----------------------------------------------------------------------------
-- 4.2 addresses
--   Select/Insert/Update/Delete: only the owning customer_id; admins read all.
-- -----------------------------------------------------------------------------
create policy "addresses select"
  on public.addresses
  for select
  to authenticated
  using (customer_id = auth.uid() or public.is_admin());

create policy "addresses modify"
  on public.addresses
  for insert
  to authenticated
  with check (customer_id = auth.uid());

create policy "addresses update"
  on public.addresses
  for update
  to authenticated
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

create policy "addresses delete"
  on public.addresses
  for delete
  to authenticated
  using (customer_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 4.3 vehicles / mechanic_services (public catalogs)
--   Select: anyone (including anon) can read rows where is_active = true.
--   Insert/Update/Delete: admins only.
-- -----------------------------------------------------------------------------

-- vehicles
create policy "vehicles select active"
  on public.vehicles
  for select
  to public
  using (is_active = true);

create policy "vehicles modify admin only"
  on public.vehicles
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- mechanic_services
create policy "mechanic_services select active"
  on public.mechanic_services
  for select
  to public
  using (is_active = true);

create policy "mechanic_services modify admin only"
  on public.mechanic_services
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- 4.4 vehicle_bookings
--   Select: owning customer_id; admins; no mechanic access.
--   Insert: authenticated customers, own customer_id only.
--   Update: customer cancels own row while status = 'pending';
--           admins update any row/any status.
--   Delete: never (cancellation is a status update).
-- -----------------------------------------------------------------------------
create policy "vehicle_bookings select"
  on public.vehicle_bookings
  for select
  to authenticated
  using (customer_id = auth.uid() or public.is_admin());

create policy "vehicle_bookings insert"
  on public.vehicle_bookings
  for insert
  to authenticated
  with check (customer_id = auth.uid());

create policy "vehicle_bookings update customer cancel"
  on public.vehicle_bookings
  for update
  to authenticated
  using (
    customer_id = auth.uid()
    and status = 'pending'
  )
  with check (
    customer_id = auth.uid()
    and status = 'cancelled'
  );

create policy "vehicle_bookings update admin"
  on public.vehicle_bookings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No DELETE policy — cancellation is a status update, not a delete.

-- -----------------------------------------------------------------------------
-- 4.5 mechanic_profiles
--   Select: the mechanic themself; admins; customers via get_public_mechanics()
--           only (no direct SELECT on base table for customers).
--   Update: the mechanic themself (availability, location); admins (any field).
-- -----------------------------------------------------------------------------
create policy "mechanic_profiles select self"
  on public.mechanic_profiles
  for select
  to authenticated
  using (auth.uid() = id or public.is_admin());

-- Customers do NOT get direct SELECT on mechanic_profiles.
-- They use get_public_mechanics() RPC instead (see above).

create policy "mechanic_profiles update self"
  on public.mechanic_profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "mechanic_profiles update admin"
  on public.mechanic_profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- 4.6 service_bookings
--   Select: owning customer_id; assigned mechanic_id; admins.
--   Insert: authenticated customers with own customer_id, status forced to 'pending'.
--   Update:
--     Customer: cancel only while pending.
--     Mechanic: advance status forward only.
--     Admin: unrestricted.
--
-- SECURITY NOTE: For UPDATE with multiple policies on the same role, PostgreSQL
-- evaluates the WITH CHECK clause of ANY applicable policy independently of its
-- USING clause. So an admin policy with `with check (true)` (or no WITH CHECK)
-- would allow ANY authenticated user to update ANY visible row to ANY value.
-- Every admin UPDATE policy below MUST include `with check (public.is_admin())`.
-- -----------------------------------------------------------------------------
create policy "service_bookings select"
  on public.service_bookings
  for select
  to authenticated
  using (
    customer_id = auth.uid()
    or mechanic_id = auth.uid()
    or public.is_admin()
  );

create policy "service_bookings insert"
  on public.service_bookings
  for insert
  to authenticated
  with check (
    customer_id = auth.uid()
    and status = 'pending'
  );

create policy "service_bookings update customer cancel"
  on public.service_bookings
  for update
  to authenticated
  using (
    customer_id = auth.uid()
    and status = 'pending'
  )
  with check (
    customer_id = auth.uid()
    and status = 'cancelled'
  );

create policy "service_bookings update mechanic forward"
  on public.service_bookings
  for update
  to authenticated
  using (
    mechanic_id = auth.uid()
    and status in ('assigned', 'en_route', 'in_progress')
  )
  with check (
    mechanic_id = auth.uid()
    and status in ('en_route', 'in_progress', 'completed')
  );

create policy "service_bookings update admin"
  on public.service_bookings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Status-transition legality (no backward jumps) is also enforced by a
-- trigger in Phase 2; the policies above are the first line of defense.

-- -----------------------------------------------------------------------------
-- 4.7 service_booking_items
--   Select: inherited — allowed if caller can select the parent service_bookings.
--   Insert: owning customer at booking-creation time.
--   Update/Delete: admins only (items are immutable once booked).
-- -----------------------------------------------------------------------------
create policy "service_booking_items select"
  on public.service_booking_items
  for select
  to authenticated
  using (
    exists (
      select 1 from public.service_bookings sb
      where sb.id = service_booking_items.service_booking_id
        and (sb.customer_id = auth.uid()
             or sb.mechanic_id = auth.uid()
             or public.is_admin())
    )
  );

create policy "service_booking_items insert"
  on public.service_booking_items
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.service_bookings sb
      where sb.id = service_booking_items.service_booking_id
        and sb.customer_id = auth.uid()
    )
  );

create policy "service_booking_items update"
  on public.service_booking_items
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "service_booking_items delete"
  on public.service_booking_items
  for delete
  to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 4.8 reviews
--   Select: anyone (public trust signal, no PII).
--   Insert: owning customer, only if the referenced booking is completed
--            and belongs to them; unique constraint backs the one-review rule.
--   Update/Delete: owning customer within 24h; otherwise admins only.
-- -----------------------------------------------------------------------------
create policy "reviews select"
  on public.reviews
  for select
  to public
  using (true);

create policy "reviews insert"
  on public.reviews
  for insert
  to authenticated
  with check (
    customer_id = auth.uid()
    and booking_type in ('vehicle', 'service')
    and (
      (booking_type = 'service' and exists (
        select 1
        from public.service_bookings sb
        where sb.id = booking_id
          and sb.customer_id = auth.uid()
          and sb.status = 'completed'
      ))
      or
      (booking_type = 'vehicle' and exists (
        select 1
        from public.vehicle_bookings vb
        where vb.id = booking_id
          and vb.customer_id = auth.uid()
          and vb.status = 'completed'
      ))
    )
  );

create policy "reviews update self"
  on public.reviews
  for update
  to authenticated
  using (
    customer_id = auth.uid()
    and created_at > now() - interval '24 hours'
  )
  with check (
    customer_id = auth.uid()
  );

create policy "reviews update admin"
  on public.reviews
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "reviews delete self"
  on public.reviews
  for delete
  to authenticated
  using (
    customer_id = auth.uid()
    and created_at > now() - interval '24 hours'
  );

create policy "reviews delete admin"
  on public.reviews
  for delete
  to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 4.9 notifications
--   Select/Update (mark as read): owning user_id only.
--   Insert: system/trigger only — no client INSERT policy exists.
-- -----------------------------------------------------------------------------
create policy "notifications select"
  on public.notifications
  for select
  to authenticated
  using (user_id = auth.uid());

-- In RLS UPDATE policies, USING sees old row values and WITH CHECK sees new
-- row values. We allow marking as read (is_read: false → true) on owned rows.
-- Cannot use old./new. qualifiers — they're trigger variables, not policy vars.
create policy "notifications update read"
  on public.notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and is_read = true
  );

-- No INSERT policy — notifications are created by triggers only.
-- No DELETE policy — notifications are soft-deleted via is_read.

-- -----------------------------------------------------------------------------
-- 4.10 payments
--   Select: owning customer_id; admins.
--   Insert/Update: service role only — NO client-side policy exists.
-- -----------------------------------------------------------------------------

-- GRANT SELECT to authenticated (RLS controls which rows are visible).
grant select on public.payments to authenticated;

create policy "payments select"
  on public.payments
  for select
  to authenticated
  using (customer_id = auth.uid() or public.is_admin());

-- No INSERT/UPDATE/DELETE policy — payments are written by Edge Functions
-- using the service_role key. Client sessions cannot modify payment state.
-- This is intentional: payment state must never be writable by a user.
