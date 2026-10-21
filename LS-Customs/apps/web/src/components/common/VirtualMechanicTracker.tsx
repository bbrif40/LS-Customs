import { useMemo, useState } from 'react'
import { Crosshair, Navigation, Phone } from 'lucide-react'
import { MapView } from './map'
import { useBookingTracking } from '../../hooks/useBookingTracking'
import { LoadingMessage } from './LoadingMessage'

export interface VirtualMechanicTrackerProps {
  bookingId?: string; status: string; mechanicName?: string | null; mechanicPhone?: string | null
  customerLocation?: { lat: number; lng: number } | null; customerAddress?: string | null
  isLightMode?: boolean
}
export function VirtualMechanicTracker(props: VirtualMechanicTrackerProps) {
  const tracking = useBookingTracking(props.bookingId)
  const [follow, setFollow] = useState(true)
  const [recenter, setRecenter] = useState(0)
  const status = tracking.booking?.status ?? props.status
  const destination = tracking.route?.destinationLat != null && tracking.route.destinationLng != null
    ? { lat: tracking.route.destinationLat, lng: tracking.route.destinationLng } : tracking.booking
    ? tracking.booking.pin_lat != null && tracking.booking.pin_lng != null ? { lat: tracking.booking.pin_lat, lng: tracking.booking.pin_lng } : null
    : props.customerLocation
  const pins = useMemo(() => [
    ...(destination ? [{ id: 'destination', ...destination, title: 'Customer destination', color: '#ef6258' }] : []),
    ...(tracking.fix ? [{ id: 'mechanic', lat: tracking.fix.lat, lng: tracking.fix.lng, title: tracking.fresh ? 'Mechanic live location' : 'Last seen', color: tracking.fresh ? '#1976e9' : '#777777', kind: 'mechanic' as const }] : []),
  ], [destination?.lat, destination?.lng, tracking.fix?.lat, tracking.fix?.lng, tracking.fresh])
  const heading = status === 'en_route' ? 'Your mechanic is on the way' : status === 'assigned' ? 'Your mechanic is assigned' : status === 'in_progress' ? 'Your service is in progress' : status.replace(/_/g, ' ')
  const minutes = tracking.fresh && tracking.route ? Math.ceil(tracking.route.durationSeconds / 60) : null
  const remainingRoute = tracking.route?.geometry
  return <section className={`arrival-tracker ${props.isLightMode ? 'light-theme' : ''}`} aria-label="Mechanic arrival tracking">
    <div className="arrival-tracker-heading"><Navigation size={18} /><strong>{heading}</strong><span>{tracking.fresh ? 'Live GPS' : 'Live location unavailable'}</span></div>
    <MapView pins={pins} route={remainingRoute} follow={follow} recenterKey={recenter} height={360} />
    <div className="arrival-tracker-controls"><label><input type="checkbox" checked={follow} onChange={event => setFollow(event.target.checked)} /> Follow mechanic</label><button type="button" className="outline-button" onClick={() => setRecenter(value => value + 1)}><Crosshair size={14} /> Recenter</button></div>
    <div className="arrival-tracker-card">
      {status === 'en_route' && tracking.fresh && !tracking.route && !tracking.routeError && !tracking.error && <LoadingMessage label="Preparing arrival estimate…" />}
      <div className="arrival-estimate"><strong>{minutes != null ? minutes < 1 ? 'Less than 1 min' : `${minutes} min` : '—'}</strong><span>{tracking.fresh ? tracking.routeError || 'Estimated arrival' : 'Arrival estimate unavailable without fresh GPS'}</span></div>
      <p><strong>{props.mechanicName || 'Awaiting mechanic assignment'}</strong></p>
      {props.customerAddress && <p className="muted">{props.customerAddress}</p>}
      <p role="status">{tracking.fix ? `${tracking.fresh ? 'Last update' : 'Last seen'} ${Math.floor(tracking.ageSeconds)} seconds ago` : tracking.error || 'Live location unavailable'}</p>
      {tracking.route && <p className="muted">{(tracking.route.distanceMeters / 1000).toFixed(1)} km remaining · Confirmed booking location</p>}

      {tracking.route?.provider === 'geoapify' && <p className="muted">Routing by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></p>}
      {props.mechanicPhone && <a className="outline-button" href={`tel:${props.mechanicPhone.replace(/[^+\d]/g, '')}`}><Phone size={14} /> Call mechanic</a>}
    </div>
  </section>
}
