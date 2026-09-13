-- Admin write path for addresses
--
-- The existing policies (20260819120524_rls_policies.sql) restrict
-- `addresses` INSERT and UPDATE to the owning customer only:
--
--   addresses modify:  with check (customer_id = auth.uid())
--   addresses update:  using (customer_id = auth.uid())
--                      with check (customer_id = auth.uid())
--
-- That blocks admins from creating or editing a customer's address on
-- their behalf — e.g. the admin Users panel "Save address" action would
-- fail with a row-level security violation.
--
-- This migration adds an admin write path so admins can insert and update
-- any address row. Customers keep their existing self-service policy
-- unchanged.

create policy "addresses insert admin"
  on public.addresses
  for insert
  to authenticated
  with check (public.is_admin());

create policy "addresses update admin"
  on public.addresses
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
