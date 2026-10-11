import { useMemo, useState } from 'react'
import { Crosshair, Navigation, Phone } from 'lucide-react'
import { MapView } from './map'
import { useBookingTracking } from '../../hooks/useBookingTracking'

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
  const destination = tracking.booking
    ? tracking.booking.pin_lat != null && tracking.booking.pin_lng != null ? { lat: tracking.booking.pin_lat, lng: tracking.booking.pin_lng } : null
    : props.customerLocation
  const pins = useMemo(() => [
    ...(destination ? [{ id: 'destination', ...destination, title: 'Service destination', color: '#e8a838' }] : []),
    ...(tracking.fix ? [{ id: 'mechanic', lat: tracking.fix.lat, lng: tracking.fix.lng, title: tracking.fresh ? 'Your mechanic' : 'Last known mechanic location', color: tracking.fresh ? '#416e5b' : '#8b9098' }] : []),
  ], [destination?.lat, destination?.lng, tracking.fix, tracking.fresh])
  const heading = status === 'en_route' ? 'Your mechanic is on the way' : status === 'assigned' ? 'Your mechanic is assigned' : status === 'in_progress' ? 'Your service is in progress' : status.replace(/_/g, ' ')
  const minutes = tracking.route ? Math.max(1, Math.ceil(tracking.route.durationSeconds / 60)) : null
  return <section className={`arrival-tracker ${props.isLightMode ? 'light-theme' : ''}`} aria-label="Mechanic arrival tracking">
    <div className="arrival-tracker-heading"><Navigation size={18} /><strong>{heading}</strong><span className={tracking.connected ? 'tracking-connected' : ''}>{tracking.connected ? 'Connected' : 'Reconnecting'}</span></div>
    <MapView pins={pins} route={tracking.route?.geometry} follow={follow} recenterKey={recenter} height={320} />
    <div className="arrival-tracker-controls"><label><input type="checkbox" checked={follow} onChange={event => setFollow(event.target.checked)} /> Follow mechanic</label><button type="button" className="outline-button" onClick={() => setRecenter(value => value + 1)}><Crosshair size={14} /> Recenter</button></div>
    <div className="arrival-tracker-card">
      <div className="arrival-estimate"><strong>{minutes ? `${minutes}–${minutes + Math.max(2, Math.ceil(minutes * .2))} min` : '—'}</strong><span>{minutes ? 'Estimated arrival · traffic not included' : status === 'en_route' ? tracking.routeError || 'Waiting for route estimate' : 'Arrival estimate available when on the way'}</span></div>
      <p><strong>{props.mechanicName || 'Awaiting mechanic assignment'}</strong></p>
      {props.customerAddress && <p className="muted">{props.customerAddress}</p>}
      <p role="status">{tracking.error || (!tracking.fix ? 'Waiting for mechanic GPS' : tracking.ageSeconds > 90 ? 'Last known location · GPS unavailable' : tracking.ageSeconds > 30 ? 'Location delayed' : 'GPS updating')} {tracking.fix && `· updated ${Math.floor(tracking.ageSeconds)}s ago`}</p>
      {tracking.route && <p className="muted">{(tracking.route.distanceMeters / 1000).toFixed(1)} km by road · estimate updated {new Date(tracking.route.calculatedAt).toLocaleTimeString()}</p>}
      {tracking.route?.provider === 'geoapify' && <p className="muted">Routing by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></p>}
      {props.mechanicPhone && <a className="outline-button" href={`tel:${props.mechanicPhone.replace(/[^+\d]/g, '')}`}><Phone size={14} /> Call mechanic</a>}
    </div>
  </section>
}
