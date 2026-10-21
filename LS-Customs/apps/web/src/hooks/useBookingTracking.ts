import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { virtualJourney } from '../../../backend/supabase/functions/_shared/virtualJourney'

export interface TrackingFix {
  booking_id: string; mechanic_id: string; lat: number; lng: number
  recorded_at: string; received_at: string; accuracy_m: number
}
export interface TrackingBooking {
  id: string; mechanic_id: string | null; status: string
  pin_lat: number | null; pin_lng: number | null
}
export interface TrackingRoute {
  geometry: { type: 'LineString'; coordinates: [number, number][] }
  durationSeconds: number; distanceMeters: number; calculatedAt: string
  provider?: 'geoapify' | 'osrm'
  trafficModel?: 'approximated' | 'none'
  mode?: 'gps' | 'virtual'; startedAt?: string; serverTime?: string
  destinationLat?: number; destinationLng?: number; destinationSource?: 'live' | 'saved'
}

export function useBookingTracking(bookingId?: string) {
  const [booking, setBooking] = useState<TrackingBooking | null>(null)
  const [fix, setFix] = useState<TrackingFix | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [route, setRoute] = useState<TrackingRoute | null>(null)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [clockOffset, setClockOffset] = useState(0)

  useEffect(() => {
    setBooking(null); setFix(null); setRoute(null); setConnected(false); setError(null)
    if (!bookingId) return
    let cancelled = false, subscribed = false, busy = false, refreshPending = false
    const refresh = async () => {
      if (busy) { refreshPending = true; return }
      busy = true
      try {
        const [b, f] = await Promise.all([
          supabase.from('service_bookings').select('id,mechanic_id,status,pin_lat,pin_lng,confirmed_lat,confirmed_lng').eq('id', bookingId).maybeSingle(),
          supabase.from('booking_locations').select('*').eq('booking_id', bookingId).maybeSingle(),
        ])
        if (cancelled) return
        if (b.error || !b.data) { setBooking(null); setFix(null); setError('Tracking is unavailable for this booking.'); return }
        setBooking({ ...b.data, pin_lat: b.data.confirmed_lat ?? b.data.pin_lat, pin_lng: b.data.confirmed_lng ?? b.data.pin_lng } as TrackingBooking)
        setFix(f.error ? null : f.data as TrackingFix | null)
        setError(f.error ? 'Location updates are unavailable.' : null)
      } catch { if (!cancelled) { setFix(null); setError('Tracking connection interrupted.') } }
      finally {
        busy = false
        if (refreshPending && !cancelled) { refreshPending = false; void refresh() }
      }
    }
    const channel = supabase.channel(`booking-tracking:${bookingId}:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_locations', filter: `booking_id=eq.${bookingId}` }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_bookings', filter: `id=eq.${bookingId}` }, () => void refresh())
      .subscribe(status => { subscribed = status === 'SUBSCRIBED'; if (!cancelled) setConnected(subscribed); if (subscribed) void refresh() })
    void refresh()
    const poll = window.setInterval(() => { if (!subscribed) void refresh() }, 15_000)
    const tick = window.setInterval(() => setNow(Date.now()), 1000)
    const resume = () => { if (!document.hidden) void refresh() }
    document.addEventListener('visibilitychange', resume)
    return () => { cancelled = true; clearInterval(poll); clearInterval(tick); document.removeEventListener('visibilitychange', resume); void supabase.removeChannel(channel) }
  }, [bookingId])

  const active = !!booking && ['assigned', 'en_route', 'in_progress'].includes(booking.status)
  const currentFix = active && fix?.mechanic_id === booking?.mechanic_id ? fix : null
  const ageSeconds = currentFix ? Math.max(0, (now - Date.parse(currentFix.recorded_at)) / 1000) : Infinity
  const fresh = ageSeconds < 60

  useEffect(() => {
    setRoute(null); setRouteError(null)
    if (!bookingId || !booking || booking.status !== 'en_route') return
    let cancelled = false, busy = false
    const calculate = async () => {
      if (busy) return
      busy = true
      try {
        const { data, error: invokeError } = await supabase.functions.invoke('booking-route', { body: { bookingId }, timeout: 15000 })
        if (cancelled) return
        if (invokeError || data?.error || !data?.data) {
          let message = data?.error?.message || invokeError?.message || 'Arrival estimate unavailable'
          if (invokeError && 'context' in invokeError && invokeError.context instanceof Response) {
            try { const body = await invokeError.context.json(); message = body?.error?.message || body?.message || message } catch { /* Retain the safe SDK message. */ }
          }
          if (!cancelled) { setRouteError(message); setRoute(null) }
        }
        else {
          setRoute(data.data as TrackingRoute); setRouteError(null)
          if (data.data.serverTime) setClockOffset(Date.parse(data.data.serverTime) - Date.now())
        }
      } catch { if (!cancelled) { setRoute(null); setRouteError('Arrival estimate unavailable') } }
      finally { busy = false }
    }
    void calculate()
    const interval = window.setInterval(() => void calculate(), 25_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [bookingId, booking?.status, booking?.mechanic_id, booking?.pin_lat, booking?.pin_lng])

  // Simulated journey only while live GPS is unavailable; fresh GPS replaces it on the next poll.
  const virtualRoute = !fresh && booking?.status === 'en_route' && route?.mode === 'virtual' && route.startedAt ? route : null
  const journey = virtualRoute ? virtualJourney(virtualRoute.geometry.coordinates, virtualRoute.durationSeconds, virtualRoute.startedAt!, now + clockOffset) : null
  return { booking, fix: currentFix, connected, error, ageSeconds, fresh, journey,
    route: virtualRoute || (fresh && route?.mode === 'gps' && now - Date.parse(route.calculatedAt) < 60_000 ? route : null), routeError }
}
