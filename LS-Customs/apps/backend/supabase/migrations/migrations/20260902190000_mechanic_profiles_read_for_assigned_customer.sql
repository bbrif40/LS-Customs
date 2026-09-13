-- Customers need to see the mechanic's live location and the inner
-- profiles row (name, phone) for the booking their admin assigned
-- them to. The existing `mechanic_profiles select self` policy only
-- lets a row through when the requester is the mechanic themselves
-- or an admin — so when the customer's service_bookings embed
-- resolves `mechanic_profiles(current_lat, current_lng, profiles(...))`
-- the entire mechanic_profiles row is filtered out, which is why the
-- customer-facing modal showed "Assigned mechanic" / "Phone not on
-- file" even after fixing the profiles RLS.
--
-- Add a policy that lets any authenticated user read a mechanic's
-- public profile (current location + nested profiles link) when that
-- mechanic is the one currently assigned to one of the customer's
-- service bookings. Customers never see mechanics they aren't
-- connected to, and the data exposed is already the public
-- customer-facing surface.
create policy "mechanic_profiles read assigned customer"
  on public.mechanic_profiles
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.service_bookings s
       where s.mechanic_id = mechanic_profiles.id
         and s.customer_id = auth.uid()
    )
  );
