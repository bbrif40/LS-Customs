import { useEffect, useState } from 'react'
import { CarFront, Loader2, MapPin, Phone, RefreshCw, UserCircle2, Wrench, X, Calendar, Hash, Tag } from 'lucide-react'
import { PageHeading } from '../common/PageHeading'
import { MapView } from '../common/map'
import { useCustomerBookings, type CustomerServiceBooking, type CustomerVehicleBooking } from '../../hooks/useCustomerBookings'

interface BookingsProps {
  userId: string | undefined
  onNotify: (message: string) => void
  /** When set, the matching service booking auto-expands its mechanic
   *  detail block. Set by Header.tsx when the user clicks an
   *  assignment notification. */
  selectedBookingId?: string | null
  /** Cleared by the Bookings view after the user dismisses the deep link. */
  onClearSelection?: () => void
}
function statusLabel(status: string) { return status.replace('_', ' ').toUpperCase() }
function statusClass(status: string) { return ['assigned', 'en_route', 'in_progress', 'confirmed'].includes(status) ? 'green' : status === 'cancelled' ? 'red' : 'amber' }

/** Mechanic contact block — shown for service bookings that have a
 *  mechanic_id (i.e. status moved past pending). Phone is a tel: link. */
function MechanicBlock({ name, phone }: { name?: string | null; phone?: string | null }) {
  return (
    <div className="booking-mechanic">
      <div className="booking-mechanic-icon" aria-hidden="true">
        <UserCircle2 size={18} />
      </div>
      <div className="booking-mechanic-copy">
        <strong>{name ?? 'Assigned mechanic'}</strong>
        {phone ? (
          <a className="booking-mechanic-phone" href={`tel:${phone.replace(/[^+\d]/g, '')}`}>
            <Phone size={12} /> {phone}
          </a>
        ) : (
          <span className="muted">Phone not on file</span>
        )}
      </div>
    </div>
  )
}

/** Detail row used inside the booking-details modal. One label + one
 *  value, both small. */
function DetailRow({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value: string }) {
  return (
    <div className="booking-detail-row">
      <span className="booking-detail-icon" aria-hidden="true"><Icon size={14} /></span>
      <span className="booking-detail-label">{label}</span>
      <span className="booking-detail-value">{value}</span>
    </div>
  )
}

/** The modal that opens when a customer clicks a booking card. Shared
 *  between rentals and service bookings — the fields shown depend on
 *  which kind the user picked. */
type BookingDetails =
  | { kind: 'service'; booking: CustomerServiceBooking; onViewMap: () => void }
  | { kind: 'rental'; booking: CustomerVehicleBooking }

function BookingDetailsModal({ details, onClose }: { details: BookingDetails; onClose: () => void }) {
  const isService = details.kind === 'service'
  const serviceNames = isService
    ? details.booking.service_booking_items?.map((item) => item.mechanic_services?.name).filter(Boolean).join(', ')
    : ''
  // Only show the mechanic's name/phone once the admin has actually
  // assigned one. The PostgREST embed for mechanic_profiles is null
  // when service_bookings.mechanic_id is null, so checking the embed
  // alone would be enough — but tying it to mechanic_id makes the
  // intent ("only after the admin assigns") explicit at the call site.
  const isAssigned = isService && details.booking.mechanic_id != null
  const mech = isAssigned ? details.booking.mechanic_profiles : null
  const mechName = isAssigned ? mech?.profiles?.full_name ?? null : null
  const mechPhone = isAssigned ? mech?.profiles?.phone ?? null : null
  // Convenience ref for fields both kinds share (status, id, total_price).
  // Type-narrowed via the isService branch — TS understands the union
  // narrows inside each branch even without `details.booking` here.
  const shared = details.booking

  return (
    <div className="map-modal-backdrop" onClick={onClose}>
      <div className="map-modal booking-details-modal" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="booking-details-eyebrow">{isService ? 'Mobile service' : 'Vehicle rental'}</span>
            <h3>{isService ? (serviceNames || 'Mobile mechanic service') : (details.booking.vehicles?.name ?? 'Vehicle rental')}</h3>
          </div>
          <button onClick={onClose} aria-label="Close details"><X size={18} /></button>
        </header>
        <div className="booking-details-body">
          <div className="booking-details-status">
            <span className={`status-pill ${statusClass(shared.status)}`}>{statusLabel(shared.status)}</span>
            <span className="muted"><Hash size={11} /> {shared.id.slice(0, 8)}</span>
          </div>

          {isService ? (
            <>
              <DetailRow icon={Calendar} label="Scheduled" value={new Date(details.booking.scheduled_at).toLocaleString()} />
              <DetailRow icon={MapPin} label="Service location" value={details.booking.pin_lat != null && details.booking.pin_lng != null ? `${details.booking.pin_lat.toFixed(4)}, ${details.booking.pin_lng.toFixed(4)}` : 'Location to be confirmed'} />
              {isAssigned && mechName && <DetailRow icon={UserCircle2} label="Mechanic" value={mechName} />}
              {isAssigned && mechPhone && <DetailRow icon={Phone} label="Mechanic phone" value={mechPhone} />}
              {serviceNames && <DetailRow icon={Tag} label="Services" value={serviceNames} />}
              <DetailRow icon={Tag} label="Total" value={`₱${Number(shared.total_price).toLocaleString()}`} />
            </>
          ) : (
            <>
              <DetailRow icon={Calendar} label="Pickup window" value={`${details.booking.start_date} → ${details.booking.end_date}`} />
              <DetailRow icon={MapPin} label="Pickup location" value={details.booking.pickup_location ?? 'Pickup location to be confirmed'} />
              {details.booking.vehicles?.image_url && <DetailRow icon={CarFront} label="Vehicle" value={details.booking.vehicles.name} />}
              <DetailRow icon={Tag} label="Total" value={`₱${Number(shared.total_price).toLocaleString()}`} />
            </>
          )}

          {/* Same gate as the rows above — only the call/tap card
              surfaces once the admin has actually assigned a mechanic. */}
          {isAssigned && (
            <MechanicBlock name={mechName ?? null} phone={mechPhone ?? null} />
          )}
        </div>
        <footer>
          {isService && (
            <button
              className="button dark-button"
              disabled={mech?.current_lat == null && (details.booking.pin_lat == null || details.booking.pin_lng == null)}
              onClick={() => {
                // Close the details modal and hand the live map modal
                // back to the parent — keeps the parent's setLiveBooking
                // state the single source of truth.
                onClose()
                details.onViewMap()
              }}
            >
              View live map
            </button>
          )}
          <button className="outline-button" onClick={onClose}>Close</button>
        </footer>
      </div>
    </div>
  )
}

export function Bookings({ userId, selectedBookingId, onClearSelection }: BookingsProps) {
  const { vehicleBookings, serviceBookings, loading, error, refetch } = useCustomerBookings(userId)
  const [liveBooking, setLiveBooking] = useState<CustomerServiceBooking | null>(null)
  const [details, setDetails] = useState<BookingDetails | null>(null)
  const [tab, setTab] = useState<'active' | 'history'>('active')

  // Auto-open the details modal when a notification deep-links to a
  // service booking. Auto-dismiss the selection once the user closes
  // the modal or switches tabs.
  useEffect(() => {
    if (!selectedBookingId) return
    const match = serviceBookings.find((b) => b.id === selectedBookingId)
    if (match) {
      setDetails({ kind: 'service', booking: match, onViewMap: () => setLiveBooking(match) })
    }
  }, [selectedBookingId, serviceBookings])

  // Terminal statuses move out of "Active" and into "All history" so the
  // active queue only shows work that still needs the customer's attention.
  const activeStatuses = ['pending', 'confirmed', 'assigned', 'en_route', 'in_progress']
  const historyStatuses = ['completed', 'cancelled']
  const matches = (status: string) => (tab === 'active' ? activeStatuses : historyStatuses).includes(status)
  const visibleVehicles = vehicleBookings.filter((b) => matches(b.status))
  const visibleServices = serviceBookings.filter((b) => matches(b.status))
  const activeCount = vehicleBookings.filter((b) => activeStatuses.includes(b.status)).length + serviceBookings.filter((b) => activeStatuses.includes(b.status)).length
  const historyCount = vehicleBookings.filter((b) => historyStatuses.includes(b.status)).length + serviceBookings.filter((b) => historyStatuses.includes(b.status)).length

  return (
    <div className="page">
      <PageHeading eyebrow="YOUR ACTIVITY" title="Bookings & progress" detail="Keep an eye on your rentals and mobile service appointments." action={<button className="outline-button" onClick={() => void refetch()}><RefreshCw size={15} /> Refresh</button>} />
      <div className="booking-tabs">
        <button className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>Active <b>{activeCount}</b></button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>All history <b>{historyCount}</b></button>
      </div>
      {loading ? <div className="loading-state"><Loader2 size={20} className="spin" /> Loading your bookings…</div> : error ? <div className="empty-state"><p>{error}</p><button className="button dark-button" onClick={() => void refetch()}>Retry</button></div> : vehicleBookings.length === 0 && serviceBookings.length === 0 ? <div className="empty-state"><p>No bookings yet. Your rental and service bookings will appear here.</p></div> : visibleVehicles.length === 0 && visibleServices.length === 0 ? <div className="empty-state"><p>{tab === 'active' ? 'No active bookings right now. Completed and cancelled bookings live in All history.' : 'No completed or cancelled bookings yet.'}</p></div> : (
        <div className="booking-grid">
          {visibleVehicles.map((booking) => {
            const isSelected = selectedBookingId === booking.id
            return (
              <button
                type="button"
                className={`booking-card booking-card-clickable ${isSelected ? 'selected' : ''}`}
                key={`vehicle-${booking.id}`}
                onClick={() => setDetails({ kind: 'rental', booking })}
                aria-label={`View details for ${booking.vehicles?.name ?? 'rental'}`}
              >
                <div className="booking-card-head"><div><span className={`status-pill ${statusClass(booking.status)}`}>{statusLabel(booking.status)}</span><p>Rental · {booking.start_date} to {booking.end_date}</p></div><CarFront size={22} /></div>
                <h3>{booking.vehicles?.name ?? 'Vehicle rental'}</h3><p className="muted">{booking.pickup_location ?? 'Pickup location to be confirmed'}</p>
                <div className="booking-actions"><strong>₱{Number(booking.total_price).toLocaleString()}</strong><span className="muted">Booking {booking.id.slice(0, 8)}</span></div>
              </button>
            )
          })}
          {visibleServices.map((booking) => {
            const mech = booking.mechanic_profiles
            const location = mech?.current_lat != null && mech?.current_lng != null
              || (booking.pin_lat != null && booking.pin_lng != null)
            const isSelected = selectedBookingId === booking.id
            return (
              <button
                type="button"
                className={`booking-card booking-card-clickable ${isSelected ? 'selected' : ''}`}
                key={`service-${booking.id}`}
                onClick={() => setDetails({ kind: 'service', booking, onViewMap: () => setLiveBooking(booking) })}
                aria-label={`View details for service booking`}
              >
                <div className="booking-card-head">
                  <div>
                    <span className={`status-pill ${statusClass(booking.status)}`}>{statusLabel(booking.status)}</span>
                    <p>Mobile service · {new Date(booking.scheduled_at).toLocaleString()}</p>
                  </div>
                  <Wrench size={22} />
                </div>
                <h3>{booking.service_booking_items?.map((item) => item.mechanic_services?.name).filter(Boolean).join(', ') || 'Mobile mechanic service'}</h3>
                <p className="muted"><MapPin size={13} /> Location saved for this booking</p>
                {/* Show the mechanic as soon as the booking has one. For
                    unassigned (pending) bookings the existing "Mechanic will
                    be assigned shortly" copy in StepConfirmed still applies. */}
                {booking.mechanic_id && mech && (
                  <MechanicBlock name={mech.profiles?.full_name ?? null} phone={mech.profiles?.phone ?? null} />
                )}
                <div className="booking-actions">
                  <strong>₱{Number(booking.total_price).toLocaleString()}</strong>
                  {/* The "View map" button used to live here. Now that the
                      whole card is clickable, the map lives inside the
                      details modal so the click target stays the card. */}
                  {location && <span className="muted">Tap card for details</span>}
                </div>
              </button>
            )
          })}
        </div>
      )}
      {details && (
        <BookingDetailsModal
          details={details}
          onClose={() => {
            setDetails(null)
            if (onClearSelection) onClearSelection()
          }}
        />
      )}
      {liveBooking && (() => { const mech = liveBooking.mechanic_profiles; const lat = mech?.current_lat ?? liveBooking.pin_lat!; const lng = mech?.current_lng ?? liveBooking.pin_lng!; return <div className="map-modal-backdrop" onClick={() => setLiveBooking(null)}><div className="map-modal" onClick={(event) => event.stopPropagation()}><header><h3>Service location</h3><button onClick={() => setLiveBooking(null)} aria-label="Close map"><X size={18} /></button></header><MapView pins={[{ id: liveBooking.id, lat, lng, title: 'Your service booking' }]} center={{ lat, lng }} zoom={15} height={420} /></div></div> })()}
    </div>
  )
}
