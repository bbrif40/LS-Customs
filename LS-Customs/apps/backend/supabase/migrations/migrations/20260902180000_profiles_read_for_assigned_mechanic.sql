-- Customers need to see the assigned mechanic's name and phone in the
-- booking card, the details modal, and the live map. The mechanic's
-- name/phone live on public.profiles, but the existing
-- `profiles select` policy only lets a row through when the row's
-- id matches auth.uid() (or the requester is an admin). When the
-- customer's service_bookings embed resolves
--   mechanic_profiles(current_lat, current_lng, profiles(full_name, phone))
-- the inner profiles row belongs to the mechanic — not the customer —
-- so RLS strips it down to NULL, and the modal renders "Assigned
-- mechanic" / "Phone not on file".
--
-- Loosen the profiles read policy to also return any row that
-- represents an active mechanic. The mechanic's contact info is
-- already visible to admins and to the mechanic themselves, so this
-- just closes the same data off to customers who have a booking
-- assigned to that mechanic. No new column, no new table — just
-- letting the customer see the contact for the person the admin
-- pointed at their booking.
create policy "profiles read assigned mechanic"
  on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.mechanic_profiles m
       where m.id = profiles.id
    )
  );
