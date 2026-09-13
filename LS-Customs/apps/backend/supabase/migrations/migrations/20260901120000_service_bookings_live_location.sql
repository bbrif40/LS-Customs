-- Live customer location for active service bookings
--
-- The customer-side app streams the user's GPS position while their
-- booking is being worked on, so the admin can see where to send the
-- mechanic. The customer's `MechanicBookingFlow` does not run after
-- the booking is created, so a separate `ActiveBookingTracker`
-- component (mounted in the customer app shell) owns the watcher.
--
-- Three nullable columns are added:
--   * current_lat, current_lng  — last known GPS fix
--   * location_updated_at       — server timestamp of the last write
--
-- The existing `one_location_only` CHECK constraint already enforces
-- that `address_id` XOR (pin_lat, pin_lng) is set at booking time.
-- Live columns are independent and can be null until the customer
-- starts streaming.
--
-- RLS:
--   * Customers may UPDATE current_lat / current_lng / location_updated_at
--     on their own booking, but only while the booking is in a live
--     state (assigned / en_route / in_progress). Pending is pre-acceptance
--     so streaming is gated; completed / cancelled are terminal so the
--     stream is stopped.
--   * The existing admin unrestricted UPDATE policy already permits
--     admins to write these columns too. No change needed there.

alter table public.service_bookings
  add column if not exists current_lat double precision,
  add column if not exists current_lng double precision,
  add column if not exists location_updated_at timestamptz;

-- Customer self-stream policy. INSERTs and SELECTs are already gated
-- elsewhere; this only adds an UPDATE path for the live location.
create policy "service_bookings stream live location"
  on public.service_bookings
  for update
  to authenticated
  using (
    auth.uid() = customer_id
    and status in ('assigned', 'en_route', 'in_progress')
  )
  with check (
    auth.uid() = customer_id
    and status in ('assigned', 'en_route', 'in_progress')
    and current_lat is not null
    and current_lng is not null
  );
