/**
 * useLiveLocationForActiveBooking — streams the customer's current GPS
 * position to Supabase while they have an active mechanic service booking.
 *
 * Mounted by <ActiveBookingTracker> in the customer app shell so the
 * stream keeps running after the user navigates away from the Mechanic
 * screen. The hook:
 *
 *   1. Looks up the customer's most recent booking in
 *      `assigned` / `en_route` / `in_progress` status.
 *   2. Starts `navigator.geolocation.watchPosition` with
 *      high-accuracy enabled.
 *   3. Throttles `UPDATE service_bookings` to one write per `STREAM_INTERVAL_MS`.
 *   4. Stops watching when the booking becomes terminal, the component
 *      unmounts, the page hides (visibilitychange), or geolocation is
 *      denied / unavailable.
 *
 * Defensive: silent no-op if `navigator.geolocation` is missing, the
 * customer has no active booking, or the Supabase query errors.
 */
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'

const STREAM_INTERVAL_MS = 15_000 // throttle DB writes
const GPS_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 10_000,
  timeout: 30_000,
}

const ACTIVE_STATUSES = ['assigned', 'en_route', 'in_progress'] as const
type ActiveStatus = (typeof ACTIVE_STATUSES)[number]

interface UseLiveLocationResult {
  /** True while watchPosition is active. */
  streaming: boolean
  /** Most recent lat/lng we wrote to the DB. */
  lastPosition: { lat: number; lng: number } | null
  /** Server timestamp of the most recent successful write. */
  lastUpdateAt: string | null
  /** Booking id we are tracking, if any. */
  bookingId: string | null
}

export function useLiveLocationForActiveBooking(
  userId: string | undefined,
): UseLiveLocationResult {
  const [streaming, setStreaming] = useState(false)
  const [lastPosition, setLastPosition] = useState<{ lat: number; lng: number } | null>(null)
  const [lastUpdateAt, setLastUpdateAt] = useState<string | null>(null)
  const [bookingId, setBookingId] = useState<string | null>(null)

  // Refs hold the latest values without retriggering effects.
  const bookingIdRef = useRef<string | null>(null)
  const lastWriteRef = useRef<number>(0)
  const watchIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!userId) {
      setBookingId(null)
      bookingIdRef.current = null
      return
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      // Geolocation not available — silent no-op.
      return
    }

    let cancelled = false

    // Find the customer's active booking, if any.
    const findBooking = async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('service_bookings')
        .select('id, status')
        .eq('customer_id', userId)
        .in('status', [...ACTIVE_STATUSES])
        .order('scheduled_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (cancelled) return null
      if (error || !data) return null
      // Defensive: the .in() filter already restricts to active statuses,
      // but a narrow cast keeps the call site clean.
      if (!ACTIVE_STATUSES.includes(data.status as ActiveStatus)) return null
      return data.id
    }

    const stopWatch = () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      setStreaming(false)
    }

    const writePosition = async (lat: number, lng: number) => {
      const id = bookingIdRef.current
      if (!id) return
      const now = Date.now()
      if (now - lastWriteRef.current < STREAM_INTERVAL_MS) return
      lastWriteRef.current = now

      // Use the server-side now() via .select('location_updated_at') so
      // the admin panel sees the canonical write time.
      const { data, error } = await supabase
        .from('service_bookings')
        .update({
          current_lat: lat,
          current_lng: lng,
          // location_updated_at is set server-side; we read it back below.
        })
        .eq('id', id)
        .eq('customer_id', userId)
        .select('location_updated_at')
        .single()

      if (cancelled) return
      if (error) {
        // RLS rejection (booking no longer active) or transient error —
        // stop the stream and let the next findBooking cycle re-arm.
        stopWatch()
        return
      }
      setLastPosition({ lat, lng })
      setLastUpdateAt(data?.location_updated_at ?? new Date().toISOString())
    }

    const startWatch = () => {
      if (watchIdRef.current != null) return
      setStreaming(true)
      watchIdRef.current = navigator.geolocation.watchPosition(
        ({ coords }) => {
          void writePosition(coords.latitude, coords.longitude)
        },
        // On permission denied / hardware error, give up silently.
        () => stopWatch(),
        GPS_OPTIONS,
      )
    }

    const refresh = async () => {
      const id = await findBooking()
      if (cancelled) return

      if (id !== bookingIdRef.current) {
        bookingIdRef.current = id
        setBookingId(id)
      }

      if (id == null) {
        // No active booking — stop any existing watch and stay quiet.
        stopWatch()
        return
      }

      // We have an active booking — start (or keep) the watch.
      startWatch()
    }

    void refresh()

    // Re-evaluate periodically: covers the case where the booking becomes
    // active (admin assigns) or terminal (admin completes) while the
    // customer is on a different screen.
    const refreshId = window.setInterval(() => { void refresh() }, 30_000)

    // Stop the stream when the tab is hidden — saves battery and
    // avoids writing stale positions while the device is asleep.
    const onVisibilityChange = () => {
      if (document.hidden) {
        stopWatch()
      } else {
        // Resuming: re-evaluate to pick up the latest booking state.
        void refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      window.clearInterval(refreshId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      stopWatch()
    }
  }, [userId])

  return { streaming, lastPosition, lastUpdateAt, bookingId }
}
