/**
 * LS Customs — Hand-written domain types
 *
 * These supplement the auto-generated database types with
 * higher-level domain concepts used across the backend and frontend.
 */

/** User roles recognized by the LS Customs platform. */
export type UserRole = 'customer' | 'mechanic' | 'admin';

/** Top-level rental vehicle category. */
export type RentalCategory = 'short_term' | 'extended' | 'premium';

/** Booking status for both vehicle and service bookings. */
export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'assigned'
  | 'en_route'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

/** Booking type discriminator (polymorphic booking_id in reviews/payments). */
export type BookingType = 'vehicle' | 'service';

/** Mechanic service main categories (6 sub-categories from the business proposal). */
export type ServiceMainCategory =
  | 'routine_fluid_service'
  | 'tire_wheel_care'
  | 'electrical_battery_care'
  | 'diagnostic_repair'
  | 'lighting_visibility'
  | 'quick_fixes';

/** Payment provider status. */
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';

/** Notification type discriminator. */
export type NotificationType = 'booking_status_changed' | 'payment_received' | 'review_reminder';

/** A geographic point used for mechanic matching and dispatch. */
export interface GeoPoint {
  lat: number;
  lng: number;
}

/** Subset of mechanic profile visible to customers (does not include current_lat/lng). */
export interface PublicMechanicView {
  id: string;
  full_name: string;
  rating_avg: number;
  rating_count: number;
  specialties: string[] | null;
  years_experience: number | null;
}

/** Result envelope returned by all Edge Functions. */
export interface EdgeFunctionResponse<T = unknown> {
  data: T | null;
  error: EdgeFunctionError | null;
}

/** Structured error shape matching API.md §4. */
export interface EdgeFunctionError {
  code:
    | 'UNAUTHENTICATED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'INVALID_STATE'
    | 'NO_MECHANIC_AVAILABLE'
    | 'PROVIDER_ERROR'
    | 'VALIDATION_ERROR'
    | 'INTERNAL_ERROR';
  message: string;
}

/**
 * Status transition rules for service bookings.
 * Mechanic may only advance forward: assigned → en_route → in_progress → completed
 * Customer may only cancel while pending.
 */
export const SERVICE_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['assigned', 'cancelled'],
  assigned: ['en_route', 'cancelled'],
  en_route: ['in_progress'],
  in_progress: ['completed'],
  completed: [],
  cancelled: [],
};
