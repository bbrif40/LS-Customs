-- =============================================================================
-- LS Customs — Phase 1 Migration 5: Indexes
-- =============================================================================
-- Creates the 7 indexes specified in DATABASE.md §6.
-- These optimize the most common query paths (bookings by customer/mechanic,
-- notifications, mechanic availability).
-- =============================================================================

create index idx_vehicle_bookings_customer on public.vehicle_bookings(customer_id);
create index idx_vehicle_bookings_vehicle_status on public.vehicle_bookings(vehicle_id, status);
create index idx_service_bookings_customer on public.service_bookings(customer_id);
create index idx_service_bookings_mechanic on public.service_bookings(mechanic_id);
create index idx_service_bookings_status on public.service_bookings(status);
create index idx_notifications_user_unread on public.notifications(user_id) where is_read = false;
create index idx_mechanic_profiles_available on public.mechanic_profiles(is_available) where is_available = true;
