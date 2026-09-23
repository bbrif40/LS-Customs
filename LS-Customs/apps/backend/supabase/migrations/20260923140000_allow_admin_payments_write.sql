-- =============================================================================
-- LS Customs — Allow authenticated admins to INSERT and UPDATE payments
-- =============================================================================
-- When an admin marks a booking as completed, the corresponding payment record
-- is updated to status = 'succeeded' or created if missing.
-- =============================================================================

grant insert, update on public.payments to authenticated;

create policy "payments admin insert"
  on public.payments
  for insert
  to authenticated
  with check (public.is_admin());

create policy "payments admin update"
  on public.payments
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
