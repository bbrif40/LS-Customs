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
  const destination = tracking.route?.mode === 'virtual' && tracking.route.destinationLat != null && tracking.route.destinationLng != null
    ? { lat: tracking.route.destinationLat, lng: tracking.route.destinationLng } : tracking.booking
    ? tracking.booking.pin_lat != null && tracking.booking.pin_lng != null ? { lat: tracking.booking.pin_lat, lng: tracking.booking.pin_lng } : null
    : props.customerLocation
  const pins = useMemo(() => [
    ...(destination ? [{ id: 'destination', ...destination, title: 'Customer destination', color: '#ef6258' }] : []),
    ...(tracking.journey ? [{ id: 'mechanic', lat: tracking.journey.position[1], lng: tracking.journey.position[0], title: 'Virtual mechanic', color: '#1976e9', kind: 'mechanic' as const }] : []),
  ], [destination?.lat, destination?.lng, tracking.journey?.position[0], tracking.journey?.position[1]])
  const heading = status === 'en_route' ? 'Your mechanic is on the way' : status === 'assigned' ? 'Your mechanic is assigned' : status === 'in_progress' ? 'Your service is in progress' : status.replace(/_/g, ' ')
  const minutes = tracking.journey ? Math.ceil(tracking.journey.remainingSeconds / 60) : null
  const remainingRoute = useMemo(() => tracking.journey ? { type: 'LineString' as const, coordinates: tracking.journey.remainingCoordinates } : tracking.route?.geometry, [tracking.journey, tracking.route])
  return <section className={`arrival-tracker ${props.isLightMode ? 'light-theme' : ''}`} aria-label="Mechanic arrival tracking">
    <div className="arrival-tracker-heading"><Navigation size={18} /><strong>{tracking.journey?.arrived ? 'Virtual mechanic has arrived' : heading}</strong><span>Simulation</span></div>
    <MapView pins={pins} route={remainingRoute} follow={follow} recenterKey={recenter} height={360} />
    <div className="arrival-tracker-controls"><label><input type="checkbox" checked={follow} onChange={event => setFollow(event.target.checked)} /> Follow mechanic</label><button type="button" className="outline-button" onClick={() => setRecenter(value => value + 1)}><Crosshair size={14} /> Recenter</button></div>
    <div className="arrival-tracker-card">
      <div className="arrival-estimate"><strong>{tracking.journey?.arrived ? 'Arrived' : minutes != null ? minutes < 1 ? 'Less than 1 min' : `${minutes} min` : '—'}</strong><span>{tracking.journey ? 'Simulated ETA · traffic not included' : status === 'en_route' ? tracking.routeError || 'Preparing virtual journey…' : 'Arrival estimate available when on the way'}</span></div>
      <p><strong>{props.mechanicName || 'Awaiting mechanic assignment'}</strong></p>
      {props.customerAddress && <p className="muted">{props.customerAddress}</p>}
      <p role="status">{tracking.journey ? tracking.journey.arrived ? 'Virtual journey complete. The booking remains En route until its status is updated.' : 'Virtual mechanic moving along the road route.' : tracking.error || 'Waiting for a routable customer location.'}</p>
      {tracking.route && tracking.journey && <p className="muted">{(tracking.route.distanceMeters * tracking.journey.remainingFraction / 1000).toFixed(1)} km remaining · {tracking.route.destinationSource === 'live' ? 'Customer’s recent GPS location' : 'Saved booking location'}</p>}
      <p className="muted">This is a virtual dispatch, not a real mechanic GPS feed.</p>
      {tracking.route?.provider === 'geoapify' && <p className="muted">Routing by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></p>}
      {props.mechanicPhone && <a className="outline-button" href={`tel:${props.mechanicPhone.replace(/[^+\d]/g, '')}`}><Phone size={14} /> Call mechanic</a>}
    </div>
  </section>
}
