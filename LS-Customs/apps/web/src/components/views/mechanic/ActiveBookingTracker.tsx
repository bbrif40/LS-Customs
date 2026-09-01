/**
 * ActiveBookingTracker — invisible component that streams the customer's
 * GPS position to Supabase while they have an active mechanic service
 * booking (assigned / en_route / in_progress).
 *
 * Mounted in the customer app shell so the stream keeps running after
 * the user navigates away from the Mechanic screen. Renders nothing.
 *
 * Browser geolocation permission is requested lazily: the first call
 * to `navigator.geolocation.watchPosition` inside the hook triggers
 * the browser permission prompt. If the customer denies it, the hook
 * silently stops and no further prompts appear.
 */
import { useLiveLocationForActiveBooking } from '../../../hooks/useLiveLocationForActiveBooking'

interface ActiveBookingTrackerProps {
  userId: string | undefined
}

export function ActiveBookingTracker({ userId }: ActiveBookingTrackerProps) {
  // Side-effect only — we don't render anything and the result is not
  // needed by the UI. Mounting this component is enough to start/stop
  // the stream based on the customer's booking state.
  useLiveLocationForActiveBooking(userId)
  return null
}
