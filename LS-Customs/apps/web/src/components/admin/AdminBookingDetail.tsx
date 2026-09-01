/**
 * AdminBookingDetail — right-side drawer that opens when an admin
 * clicks a service-booking row. Shows the full booking context plus
 * a Leaflet map of the saved pickup spot. If the booking is active
 * (assigned / en_route / in_progress), renders a second Leaflet map
 * with the customer's live GPS position and a "last update" stamp
 * that ticks every 10 seconds.
 *
 * Reuses <MapView> from the shared map module — already lazy-loaded,
 * no new dependencies.
 */
import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { X, MapPin, Clock, User, Wrench, Calendar, Hash } from 'lucide-react'
import { MapView, type MapPin as MapPinData } from '../common/map'


// Statuses for which the customer streams live GPS. Mirrors the
// ACTIVE_STATUSES list in useLiveLocationForActiveBooking.
const LIVE_STREAMING_STATUSES = ['assigned', 'en_route', 'in_progress'] as const

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  assigned: 'Assigned',
  en_route: 'En Route',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const statusColors: Record<string, string> = {
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  assigned: '#8b5cf6',
  en_route: '#06b6d4',
  in_progress: '#e8a838',
  completed: '#22c55e',
  cancelled: '#ef4444',
}

export interface AdminBookingDetailBooking {
  id: string
  status: string
  scheduled_at: string
  total_price: number
  pin_lat: number | null
  pin_lng: number | null
  // The next three are present only after migration
  // 20260901120000_service_bookings_live_location has been applied.
  // Until then, the AdminBookings select does not project them, and
  // the detail panel treats them as absent (no live map shown).
  current_lat?: number | null
  current_lng?: number | null
  location_updated_at?: string | null
  customer_id: string
  profiles?: { id: string; full_name: string | null; phone: string | null }[] | null
  mechanic_profiles?: { id: string; profiles?: { id: string; full_name: string | null }[] | null }[] | null
  addresses?: { id: string; line1: string; city: string }[] | null
  service_booking_items?: { mechanic_services?: { name: string } | null }[] | null
}

interface AdminBookingDetailProps {
  booking: AdminBookingDetailBooking | null
  onClose: () => void
}

function formatRelative(iso: string | null | undefined, now: number): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'never'
  const seconds = Math.max(0, Math.floor((now - then) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  return `${days} d ago`
}

function getCustomerName(b: AdminBookingDetailBooking): string {
  const profile = b.profiles?.[0]
  const name = profile?.full_name?.trim()
  if (name) return name
  if (profile?.phone) return profile.phone
  return `Customer #${b.customer_id.slice(0, 8).toUpperCase()}`
}

function getMechanicName(b: AdminBookingDetailBooking): string {
  const m = b.mechanic_profiles?.[0]
  return m?.profiles?.[0]?.full_name ?? 'Unassigned'
}

function getServiceNames(b: AdminBookingDetailBooking): string {
  const items = b.service_booking_items ?? []
  if (items.length === 0) return 'No services listed'
  return items.map((i) => i.mechanic_services?.name).filter(Boolean).join(', ')
}

function getAddress(b: AdminBookingDetailBooking): string {
  const a = b.addresses?.[0]
  if (a) return `${a.line1}, ${a.city}`
  if (b.pin_lat != null && b.pin_lng != null) {
    return `Pin: ${b.pin_lat.toFixed(4)}, ${b.pin_lng.toFixed(4)}`
  }
  return 'No address on file'
}

export function AdminBookingDetail(props: AdminBookingDetailProps) {
  return (
    <DetailErrorBoundary>
      <AdminBookingDetailInner {...props} />
    </DetailErrorBoundary>
  )
}

/**
 * DetailErrorBoundary — catches any runtime error inside the drawer
 * (e.g. a malformed booking row, a Leaflet crash, an unexpected null
 * from the join) and renders a small "couldn't load" panel instead of
 * letting the error bubble up and white-screen the whole admin page.
 */
class DetailErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[AdminBookingDetail] runtime error:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          style={{
            position: 'fixed', top: 0, right: 0, bottom: 0,
            width: 'min(480px, 100vw)', background: '#0f1320',
            borderLeft: '1px solid #2d3748', zIndex: 50,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            color: '#d4d9e6', padding: 24, textAlign: 'center',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Couldn't load booking detail</div>
          <div style={{ fontSize: 12, color: '#9ca3af', maxWidth: 320 }}>
            {this.state.error.message || 'An unexpected error occurred while rendering this booking.'}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 12 }}>
            Click outside the panel to close it.
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function AdminBookingDetailInner({ booking, onClose }: AdminBookingDetailProps) {
  // Tick a `now` value every 10s while the drawer is open so the
  // "last update" line stays fresh. Mounted only when the drawer is
  // actually visible (parent passes null otherwise), so the interval
  // is cheap and only runs when the user is looking at the panel.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 10_000)
    return () => window.clearInterval(id)
  }, [])

  if (!booking) return null

  const isLive = (LIVE_STREAMING_STATUSES as readonly string[]).includes(booking.status)
  const hasSavedPin = booking.pin_lat != null && booking.pin_lng != null
  const hasLivePin =
    booking.current_lat != null && booking.current_lng != null

  const savedPinMap: MapPinData[] = hasSavedPin
    ? [
        {
          id: `${booking.id}-saved`,
          lat: booking.pin_lat as number,
          lng: booking.pin_lng as number,
          title: 'Saved pickup',
          description: 'Where the customer asked the mechanic to arrive',
          color: '#e8a838',
        },
      ]
    : []

  const livePinMap: MapPinData[] =
    isLive && hasLivePin
      ? [
          {
            id: `${booking.id}-live`,
            lat: booking.current_lat as number,
            lng: booking.current_lng as number,
            title: 'Customer live location',
            description: `Last update: ${formatRelative(booking.location_updated_at, now)}`,
            color: '#22c55e',
          },
        ]
      : []

  const statusColor = statusColors[booking.status] ?? '#9ca3af'

  return (
    <>
      <div
        className="admin-booking-detail-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="admin-booking-detail"
        role="dialog"
        aria-label={`Booking ${booking.id} details`}
      >
        <header className="admin-booking-detail-head">
          <div>
            <h2>Booking {booking.id.slice(0, 8)}</h2>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, fontFamily: 'monospace' }}>
              {booking.id}
            </div>
          </div>
          <div className="admin-booking-detail-head-meta">
            <span
              className="admin-status-badge"
              style={{
                background: `${statusColor}20`,
                color: statusColor,
                border: `1px solid ${statusColor}40`,
                fontSize: 11,
                padding: '3px 8px',
                borderRadius: 6,
                fontWeight: 600,
              }}
            >
              {statusLabels[booking.status] ?? booking.status}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="admin-booking-detail-close"
              aria-label="Close detail panel"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="admin-booking-detail-body">
          {/* Customer */}
          <section className="admin-booking-detail-section">
            <h4>
              <User size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              Customer
            </h4>
            <p>
              <strong>{getCustomerName(booking)}</strong>
            </p>
            {booking.profiles?.[0]?.phone && (
              <p style={{ marginTop: 4, color: '#9ca3af', fontSize: 12 }}>
                📞 {booking.profiles[0].phone}
              </p>
            )}
          </section>

          {/* Service */}
          <section className="admin-booking-detail-section">
            <h4>
              <Wrench size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              Service
            </h4>
            <p>
              <strong>{getServiceNames(booking)}</strong>
            </p>
            <p style={{ marginTop: 6, color: '#9ca3af', fontSize: 12 }}>
              Mechanic: <strong style={{ color: '#d4d9e6' }}>{getMechanicName(booking)}</strong>
            </p>
          </section>

          {/* Schedule */}
          <section className="admin-booking-detail-section">
            <h4>
              <Calendar size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              Scheduled
            </h4>
            <p>
              {new Date(booking.scheduled_at).toLocaleString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </p>
            <p style={{ marginTop: 6, color: '#9ca3af', fontSize: 12 }}>
              Total: <strong style={{ color: '#e8a838' }}>₱{booking.total_price.toLocaleString()}</strong>
            </p>
          </section>

          {/* Address */}
          <section className="admin-booking-detail-section">
            <h4>
              <MapPin size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              Address
            </h4>
            <p>{getAddress(booking)}</p>
          </section>

          {/* Saved pickup map */}
          <section className="admin-booking-detail-section">
            <h4>
              <MapPin size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              Saved pickup location
            </h4>
            <div className="admin-booking-detail-map-wrap">
              {hasSavedPin ? (
                <MapView pins={savedPinMap} height={220} zoom={15} />
              ) : (
                <div className="admin-booking-detail-empty-map">
                  Customer did not provide a saved pickup pin.
                </div>
              )}
            </div>
          </section>

          {/* Live location map (only for active bookings) */}
          {isLive && (
            <section className="admin-booking-detail-section">
              <h4>
                <span className="admin-booking-detail-live-dot" style={{ display: 'inline-block', marginRight: 4, verticalAlign: 'middle' }} />
                Live location
              </h4>
              <div className="admin-booking-detail-map-wrap">
                {hasLivePin ? (
                  <MapView pins={livePinMap} height={220} zoom={15} />
                ) : (
                  <div className="admin-booking-detail-empty-map">
                    Waiting for the customer to share their location.
                  </div>
                )}
              </div>
              <div className="admin-booking-detail-live-stamp">
                <Clock size={11} />
                Last update: {formatRelative(booking.location_updated_at, now)}
              </div>
            </section>
          )}

          {/* Booking metadata footer */}
          <section className="admin-booking-detail-section" style={{ borderTop: '1px solid #2d3748', paddingTop: 16 }}>
            <h4>
              <Hash size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              Metadata
            </h4>
            <p style={{ fontSize: 12, color: '#9ca3af' }}>
              Booked {new Date(booking.id).toISOString().slice(0, 16).replace('T', ' ')} (server time)
            </p>
          </section>
        </div>
      </aside>
    </>
  )
}
