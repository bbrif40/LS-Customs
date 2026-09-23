import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CarFront, Loader2, MapPin, Phone, RefreshCw, Star, UserCircle2, Wrench, X, Calendar, Hash, Tag, CreditCard, Check, Ban, CalendarX, BookOpen } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { usePaymentStatus } from '../../hooks/usePaymentStatus'
import { PaymentForm } from '../common/PaymentForm'
import { PageHeading } from '../common/PageHeading'
import { MapView } from '../common/map'
import { VirtualMechanicTracker } from '../common/VirtualMechanicTracker'
import { useScrollAnimation } from '../../hooks/useScrollAnimation'
import { useCustomerBookings, type CustomerServiceBooking, type CustomerVehicleBooking } from '../../hooks/useCustomerBookings'

interface BookingsProps {
  userId: string | undefined
  onNotify: (message: string) => void
  onView?: (view: any) => void
  /** When set, the matching service booking auto-expands its mechanic
   *  detail block. Set by Header.tsx when the user clicks an
   *  assignment notification. */
  selectedBookingId?: string | null
  /** Cleared by the Bookings view after the user dismisses the deep link. */
  onClearSelection?: () => void
}
function statusLabel(status: string) { return status.replace('_', ' ').toUpperCase() }
function statusClass(status: string) { return ['assigned', 'en_route', 'in_progress', 'confirmed'].includes(status) ? 'green' : status === 'cancelled' ? 'red' : 'amber' }

function extractAddressFromNotes(notes?: string | null): string | null {
  if (!notes) return null
  const match = notes.match(/Address:\s*([^|]+)/i)
  return match && match[1]?.trim() ? match[1].trim() : null
}

/** Payment status pill — maps payment.status to a colored pill. */
function paymentStatusLabel(status: string): string {
  if (status === 'succeeded') return 'PAID'
  if (status === 'failed') return 'FAILED'
  if (status === 'refunded') return 'REFUNDED'
  if (status === 'pending') return 'PENDING'
  return status.toUpperCase()
}
function paymentStatusClass(status: string): string {
  if (status === 'succeeded') return 'green'
  if (status === 'failed') return 'red'
  if (status === 'refunded') return 'blue'
  if (status === 'pending') return 'amber'
  return 'amber'
}

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
/**
 * BookingTimeline — horizontal step-indicator for booking lifecycle.
 * Shows completed steps in green, the current step in amber, future steps grey.
 * Cancelled bookings show a red X on the last step they reached.
 */
const VEHICLE_STEPS = ['Pending', 'Confirmed', 'In Progress', 'Completed']
const VEHICLE_STATUS_IDX: Record<string, number> = {
  pending: 0, confirmed: 1, in_progress: 2, completed: 3, cancelled: -1,
}
const SERVICE_STEPS = ['Pending', 'Assigned', 'En Route', 'In Progress', 'Completed']
const SERVICE_STATUS_IDX: Record<string, number> = {
  pending: 0, confirmed: 0, assigned: 1, en_route: 2, in_progress: 3, completed: 4, cancelled: -1,
}

function BookingTimeline({ status, kind }: { status: string; kind: 'rental' | 'service' }) {
  const steps = kind === 'service' ? SERVICE_STEPS : VEHICLE_STEPS
  const statusMap = kind === 'service' ? SERVICE_STATUS_IDX : VEHICLE_STATUS_IDX
  const isCancelled = status === 'cancelled'
  const currentIdx = statusMap[status] ?? 0

  // For cancelled, find last reached step before cancellation
  const cancelledAt = isCancelled
    ? (kind === 'service' ? 0 : 0) // cancelled bookings just show first step as red
    : -1

  return (
    <div className="booking-timeline">
      <div className="booking-timeline-track">
        {steps.map((label, idx) => {
          const isDone    = !isCancelled && idx < currentIdx
          const isCurrent = !isCancelled && idx === currentIdx
          const isCancelledStep = isCancelled && idx === cancelledAt

          return (
            <div
              key={label}
              className={`booking-timeline-step${isDone ? ' is-done' : ''}${isCurrent ? ' is-current' : ''}${isCancelledStep ? ' is-cancelled' : ''}`}
            >
              <div className="booking-timeline-dot">
                {isDone && <Check size={11} />}
                {isCancelledStep && <X size={11} />}
              </div>
              <span className="booking-timeline-label">{label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** The modal that opens when a customer clicks a booking card. Shared
 *  between rentals and service bookings — the fields shown depend on
 *  which kind the user picked. */
type BookingDetails =
  | { kind: 'service'; booking: CustomerServiceBooking; onViewMap: () => void }
  | { kind: 'rental'; booking: CustomerVehicleBooking }

function BookingDetailsModal({ details, userId, onClose, onNotify }: { details: BookingDetails; userId: string | undefined; onClose: () => void; onNotify: (message: string) => void }) {
  const isService = details.kind === 'service'
  const serviceNames = isService
    ? details.booking.service_booking_items?.map((item) => item.mechanic_services?.name).filter(Boolean).join(', ')
    : ''
  // Only show the mechanic's name/phone once the admin has actually
  // assigned one.
  const isAssigned = isService && ['assigned', 'en_route', 'in_progress', 'completed'].includes(details.booking.status) && details.booking.mechanic_id != null
  const mech = isAssigned ? details.booking.mechanic_profiles : null
  const mechName = isAssigned ? mech?.profiles?.full_name ?? null : null
  const mechPhone = isAssigned ? mech?.profiles?.phone ?? null : null

  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  // Convenience ref for fields both kinds share (status, id, total_price).
  // Type-narrowed via the isService branch — TS understands the union
  // narrows inside each branch even without `details.booking` here.
  const shared = details.booking
  const canRate = shared.status === 'completed' && Boolean(userId) && (isService ? Boolean(details.booking.mechanic_id) : Boolean(details.booking.vehicle_id))
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [ratingError, setRatingError] = useState<string | null>(null)
  const [savingRating, setSavingRating] = useState(false)
  const [retryingPayment, setRetryingPayment] = useState(false)
  const [retryIntent, setRetryIntent] = useState<{ payment_id: string; client_secret: string; checkout_url?: string; provider: string; amount: number; currency: string } | null>(null)
  const [retryError, setRetryError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  // Track the original payment's status for realtime webhook updates
  const { status: originalPaymentStatus } = usePaymentStatus(shared.payments?.id ?? null)
  const { status: retryPaymentInfo } = usePaymentStatus(retryIntent?.payment_id ?? null)

  useEffect(() => {
    let active = true
    setRating(0)
    setComment('')
    setReviewId(null)
    setRatingError(null)
    if (!userId || !canRate) return () => { active = false }
    void supabase
      .from('reviews')
      .select('id, rating, comment')
      .eq('booking_id', shared.id)
      .eq('customer_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        if (error) setRatingError(error.message)
        if (data) {
          setReviewId(data.id)
          setRating(data.rating)
          setComment(data.comment ?? '')
        }
      })
    return () => { active = false }
  }, [canRate, shared.id, userId])

  async function saveRating() {
    if (!userId || !rating || !canRate) return
    setSavingRating(true)
    setRatingError(null)
    const payload = {
      booking_type: isService ? 'service' as const : 'vehicle' as const,
      booking_id: shared.id,
      customer_id: userId,
      target_vehicle_id: isService ? null : details.booking.vehicle_id,
      target_mechanic_id: isService ? details.booking.mechanic_id : null,
      rating,
      comment: comment.trim() || null,
    }
    const result = reviewId
      ? await supabase.from('reviews').update({ rating, comment: payload.comment }).eq('id', reviewId).select('id').single()
      : await supabase.from('reviews').insert(payload).select('id').single()
    if (result.error) setRatingError(result.error.message)
    else setReviewId(result.data.id)
    setSavingRating(false)
  }

  async function cancelBooking() {
    if (!userId) return
    setCancelling(true)
    setCancelError(null)
    const table = isService ? 'service_bookings' : 'vehicle_bookings'
    const { error: cancelErr } = await supabase
      .from(table)
      .update({ status: 'cancelled' })
      .eq('id', shared.id)
      .eq(isService ? 'user_id' : 'user_id', userId)
    if (cancelErr) {
      setCancelError(cancelErr.message)
    } else {
      onNotify('Booking cancelled successfully.')
      onClose()
    }
    setCancelling(false)
    setConfirmCancel(false)
  }

  return createPortal(
    <div className="map-modal-backdrop" onClick={onClose}>
      <div className="map-modal booking-details-modal" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="booking-details-eyebrow">Transaction receipt · {isService ? 'Mobile service' : 'Vehicle rental'}</span>
            <h3>{isService ? (serviceNames || 'Mobile mechanic service') : (details.booking.vehicles?.name ?? 'Vehicle rental')}</h3>
          </div>
          <button onClick={onClose} aria-label="Close details"><X size={18} /></button>
        </header>
        <div className="booking-details-body">
          <div className="booking-details-status">
            <span className={`status-pill ${statusClass(shared.status)}`}>{statusLabel(shared.status)}</span>
            <span className="muted"><Hash size={11} /> {isService ? `service-${shared.id.slice(0, 8)}` : `booking-${shared.id.slice(0, 8)}`}</span>
          </div>
          <BookingTimeline status={shared.status} kind={isService ? 'service' : 'rental'} />

          {/* Payment section */}
          {shared.payments ? (
            <div className="booking-payment-section">
              <h4>Payment</h4>
              <div className="booking-payment-status-row">
                <span className={`status-pill ${paymentStatusClass(shared.payments.status)}`}>{paymentStatusLabel(shared.payments.status)}</span>
                <span className="muted">{shared.payments.provider ?? 'Unknown provider'} · ₱{Number(shared.payments.amount).toLocaleString()}</span>
              </div>
              {shared.payments.status === 'failed' && !retryIntent && (
                <button
                  className="button dark-button payment-retry-button"
                  disabled={retryingPayment}
                  onClick={async () => {
                    setRetryingPayment(true)
                    setRetryError(null)
                    const { data, error: invokeError } = await supabase.functions.invoke('create-payment-intent', {
                      body: { booking_type: isService ? 'service' : 'vehicle', booking_id: shared.id },
                    })
                    const payload = (data as any)?.data?.payment_id ? (data as any).data : ((data as any)?.data ?? data)
                    const wrappedError = (data as any)?.error?.message
                    if (invokeError || wrappedError || !payload?.payment_id) {
                      setRetryError(invokeError?.message ?? wrappedError ?? payload?.message ?? 'Could not create payment intent')
                    } else {
                      setRetryIntent(payload)
                    }
                    setRetryingPayment(false)
                  }}
                >
                  {retryingPayment ? <Loader2 size={14} className="spin" /> : <CreditCard size={14} />}
                  {retryingPayment ? 'Preparing…' : 'Retry payment'}
                </button>
              )}
              {retryError && <p className="form-helper review-error">{retryError}</p>}
            </div>
          ) : (
            <div className="booking-payment-section">
              <h4>Payment</h4>
              <p className="muted">No payment record found for this booking.</p>
            </div>
          )}

          {/* Retry payment form */}
          {retryIntent && retryPaymentInfo?.status !== 'succeeded' && retryPaymentInfo?.status !== 'refunded' && (
            <div className="payment-retry-form">
              <PaymentForm
                clientSecret={retryIntent.client_secret}
                checkoutUrl={retryIntent.checkout_url}
                amount={retryIntent.amount}
                currency={retryIntent.currency}
                provider={retryIntent.provider}
                onComplete={(result) => {
                  if (result === 'succeeded') {
                    setRetryIntent(null)
                    onNotify('Payment confirmed. Booking is now locked in.')
                  } else if (result === 'failed') {
                    setRetryError('Payment failed. Please try a different card.')
                  }
                }}
                onError={(msg) => setRetryError(msg)}
              />
            </div>
          )}

          {/* Virtual Mechanic En Route Live Simulation */}
          {isService && details.booking.status === 'en_route' && (
            <div style={{ marginBottom: 16 }}>
              <VirtualMechanicTracker
                status="en_route"
                mechanicName={mechName ?? 'Assigned Mechanic'}
                mechanicPhone={mechPhone ?? null}
                customerAddress={extractAddressFromNotes(details.booking.notes)}
                customerLocation={
                  details.booking.pin_lat != null && details.booking.pin_lng != null
                    ? { lat: details.booking.pin_lat, lng: details.booking.pin_lng }
                    : null
                }
                initialDistanceKm={4.5}
                etaMinutes={12}
                unitName="UNIT #04 • LS DISPATCH"
                isLightMode={true}
              />
            </div>
          )}

          {isService ? (
            <>
              <DetailRow icon={Calendar} label="Scheduled" value={new Date(details.booking.scheduled_at).toLocaleString()} />
              <DetailRow
                icon={MapPin}
                label="Service location"
                value={
                  extractAddressFromNotes(details.booking.notes) ??
                  (details.booking.pin_lat != null && details.booking.pin_lng != null
                    ? `${details.booking.pin_lat.toFixed(4)}, ${details.booking.pin_lng.toFixed(4)}`
                    : 'Location to be confirmed')
                }
              />
              {isAssigned && mechName && <DetailRow icon={UserCircle2} label="Mechanic" value={mechName} />}
              {isAssigned && mechPhone && <DetailRow icon={Phone} label="Mechanic phone" value={mechPhone} />}
              {serviceNames && <DetailRow icon={Tag} label="Services" value={serviceNames} />}
              <DetailRow icon={Tag} label="Total" value={`₱${Number(shared.total_price).toLocaleString()}`} />
              <DetailRow icon={Calendar} label="Booked on" value={new Date(shared.created_at).toLocaleString()} />
            </>
          ) : (
            <>
              <DetailRow icon={Calendar} label="Pickup window" value={`${details.booking.start_date} → ${details.booking.end_date}`} />
              <DetailRow icon={MapPin} label="Pickup location" value={details.booking.pickup_location ?? 'Pickup location to be confirmed'} />
              {details.booking.vehicles?.image_url && <DetailRow icon={CarFront} label="Vehicle" value={details.booking.vehicles.name} />}
              <DetailRow icon={Tag} label="Total" value={`₱${Number(shared.total_price).toLocaleString()}`} />
              <DetailRow icon={Calendar} label="Booked on" value={new Date(shared.created_at).toLocaleString()} />
            </>
          )}

          {/* Same gate as the rows above — only the call/tap card
              surfaces once the admin has actually assigned a mechanic. */}
          {isAssigned && (
            <MechanicBlock name={mechName ?? null} phone={mechPhone ?? null} />
          )}
          {canRate && (
            <div className="booking-rating-panel">
              <div>
                <strong>{reviewId ? 'Your rating' : `Rate this ${isService ? 'mechanic' : 'vehicle'}`}</strong>
                <span>{reviewId ? 'You can update it within 24 hours.' : 'Share your experience with future customers.'}</span>
              </div>
              <div className="rating-stars" aria-label="Choose a rating from 1 to 5">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button key={value} type="button" className={value <= rating ? 'active' : ''} aria-label={`${value} star${value === 1 ? '' : 's'}`} onClick={() => setRating(value)}>
                    <Star size={20} fill={value <= rating ? 'currentColor' : 'none'} />
                  </button>
                ))}
              </div>
              <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add an optional comment" rows={2} />
              {ratingError && <p className="form-helper review-error">{ratingError}</p>}
              <button className="button dark-button" type="button" disabled={!rating || savingRating} onClick={() => void saveRating()}>
                {savingRating ? <Loader2 size={15} className="spin" /> : <Star size={15} />}
                {reviewId ? 'Update rating' : 'Submit rating'}
              </button>
            </div>
          )}
        </div>
        {/* Cancel booking — only shown for pending (not-yet-actioned) bookings */}
        {shared.status === 'pending' && (
          <div className="booking-cancel-section">
            {!confirmCancel ? (
              <button
                className="booking-cancel-btn"
                type="button"
                onClick={() => setConfirmCancel(true)}
              >
                <Ban size={13} /> Cancel booking
              </button>
            ) : (
              <div className="cancel-confirm-row">
                <p>Are you sure you want to cancel this booking? This cannot be undone.</p>
                <button
                  className="booking-cancel-btn"
                  type="button"
                  disabled={cancelling}
                  onClick={() => void cancelBooking()}
                >
                  {cancelling ? <Loader2 size={13} className="spin" /> : <Ban size={13} />}
                  {cancelling ? 'Cancelling…' : 'Yes, cancel'}
                </button>
                <button
                  className="outline-button"
                  type="button"
                  style={{ fontSize: 12, padding: '6px 12px' }}
                  onClick={() => setConfirmCancel(false)}
                >
                  Keep booking
                </button>
                {cancelError && <p style={{ color: '#dc2626' }}>{cancelError}</p>}
              </div>
            )}
          </div>
        )}
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
    </div>,
    document.body
  )
}

export function Bookings({ userId, onNotify, onView, selectedBookingId, onClearSelection }: BookingsProps) {
  const { vehicleBookings, serviceBookings, loading, error, refetch } = useCustomerBookings(userId)
  const [liveBooking, setLiveBooking] = useState<CustomerServiceBooking | null>(null)
  const [details, setDetails] = useState<BookingDetails | null>(null)
  const [tab, setTab] = useState<'active' | 'history'>('active')
  const [bookingType, setBookingType] = useState<'all' | 'rentals' | 'services'>('all')

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
  const visibleVehicles = bookingType === 'services' ? [] : vehicleBookings.filter((b) => matches(b.status))
  const visibleServices = bookingType === 'rentals' ? [] : serviceBookings.filter((b) => matches(b.status))
  const activeCount = vehicleBookings.filter((b) => activeStatuses.includes(b.status)).length + serviceBookings.filter((b) => activeStatuses.includes(b.status)).length
  const historyCount = vehicleBookings.filter((b) => historyStatuses.includes(b.status)).length + serviceBookings.filter((b) => historyStatuses.includes(b.status)).length
  const scrollRef = useScrollAnimation<HTMLDivElement>()

  return (
    <div className={`page ${scrollRef.className}`} ref={scrollRef.ref}>
      <PageHeading eyebrow="YOUR ACTIVITY" title="Bookings & progress" detail="Keep an eye on your rentals and mobile service appointments." action={<button className="outline-button" onClick={() => void refetch()}><RefreshCw size={15} /> Refresh</button>} />
      <div className="booking-tabs">
        <button className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>Active <b>{activeCount}</b></button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>All history <b>{historyCount}</b></button>
      </div>
      <div className="booking-type-filter" aria-label="Filter bookings by type">
        <span>Show</span>
        {(['all', 'rentals', 'services'] as const).map((type) => (
          <button key={type} className={bookingType === type ? 'active' : ''} onClick={() => setBookingType(type)}>
            {type === 'all' ? 'Everything' : type === 'rentals' ? 'Rentals' : 'Mechanical services'}
          </button>
        ))}
      </div>
      {loading ? <div className="loading-state"><Loader2 size={20} className="spin" /> Loading your bookings…</div> : error ? <div className="empty-state"><p>{error}</p><button className="button dark-button" onClick={() => void refetch()}>Retry</button></div> : vehicleBookings.length === 0 && serviceBookings.length === 0 ? (
        <div className="bookings-empty-state">
          <div className="bookings-empty-icon"><BookOpen size={28} /></div>
          <h3>No bookings yet</h3>
          <p>Your rental and service bookings will appear here once you make your first booking.</p>
          <div className="bookings-empty-actions">
            <button className="button dark-button" onClick={() => onView?.('rentals')} type="button"><CalendarX size={14} /> Rent a vehicle</button>
            <button className="outline-button" onClick={() => onView?.('services')} type="button">Book a mechanic</button>
          </div>
        </div>
      ) : visibleVehicles.length === 0 && visibleServices.length === 0 ? <div className="empty-state"><p>{tab === 'active' ? 'No active bookings right now. Completed and cancelled bookings live in All history.' : 'No completed or cancelled bookings yet.'}</p></div> : (
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
                <div className="booking-card-head"><div><span className={`status-pill ${statusClass(booking.status)}`}>{statusLabel(booking.status)}</span>{booking.payments && <span className={`status-pill ${paymentStatusClass(booking.payments.status)}`}>{paymentStatusLabel(booking.payments.status)}</span>}<p>Rental · {booking.start_date} to {booking.end_date}</p></div><CarFront size={22} /></div>
                <h3>{booking.vehicles?.name ?? 'Vehicle rental'}</h3><p className="muted">{booking.pickup_location ?? 'Pickup location to be confirmed'}</p>
                <div className="booking-actions"><strong>₱{Number(booking.total_price).toLocaleString()}</strong><span className="muted">booking-{booking.id.slice(0, 8)}</span></div>
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
                    {booking.payments && <span className={`status-pill ${paymentStatusClass(booking.payments.status)}`}>{paymentStatusLabel(booking.payments.status)}</span>}
                    <p>Mobile service · {new Date(booking.scheduled_at).toLocaleString()}</p>
                  </div>
                  <Wrench size={22} />
                </div>
                <h3>{booking.service_booking_items?.map((item) => item.mechanic_services?.name).filter(Boolean).join(', ') || 'Mobile mechanic service'}</h3>
                <p className="muted"><MapPin size={13} /> Location saved for this booking</p>
                {/* Only display the mechanic once assigned */}
                {['assigned', 'en_route', 'in_progress', 'completed'].includes(booking.status) && booking.mechanic_id && mech && (
                  <MechanicBlock name={mech.profiles?.full_name ?? null} phone={mech.profiles?.phone ?? null} />
                )}
                <div className="booking-actions">
                  <strong>₱{Number(booking.total_price).toLocaleString()}</strong>
                  <span className="muted">service-{booking.id.slice(0, 8)}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}
      {details && (
        <BookingDetailsModal
          details={details}
          userId={userId}
          onNotify={onNotify}
          onClose={() => {
            setDetails(null)
            if (onClearSelection) onClearSelection()
          }}
        />
      )}
      {liveBooking && (() => {
        const mech = liveBooking.mechanic_profiles
        const lat = mech?.current_lat ?? liveBooking.pin_lat!
        const lng = mech?.current_lng ?? liveBooking.pin_lng!
        const customerAddress = extractAddressFromNotes(liveBooking.notes)
        const isEnRoute = liveBooking.status === 'en_route'
        return createPortal(
          <div className="map-modal-backdrop" onClick={() => setLiveBooking(null)}>
            <div className="map-modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: isEnRoute ? 640 : 540 }}>
              <header>
                <h3>{isEnRoute ? 'Live Virtual Mechanic En Route' : 'Service location'}</h3>
                <button onClick={() => setLiveBooking(null)} aria-label="Close map"><X size={18} /></button>
              </header>
              <div style={{ padding: '12px 16px' }}>
                {isEnRoute && (
                  <div style={{ marginBottom: 14 }}>
                    <VirtualMechanicTracker
                      status="en_route"
                      mechanicName={mech?.profiles?.full_name ?? 'Assigned Mechanic'}
                      mechanicPhone={mech?.profiles?.phone ?? null}
                      customerAddress={customerAddress}
                      customerLocation={
                        liveBooking.pin_lat != null && liveBooking.pin_lng != null
                          ? { lat: liveBooking.pin_lat, lng: liveBooking.pin_lng }
                          : null
                      }
                      initialDistanceKm={4.5}
                      etaMinutes={12}
                      unitName="UNIT #04 • LS DISPATCH"
                      isLightMode={true}
                    />
                  </div>
                )}
                <MapView
                  pins={[{ id: liveBooking.id, lat, lng, title: 'Your service location' }]}
                  center={{ lat, lng }}
                  zoom={15}
                  height={isEnRoute ? 240 : 420}
                />
              </div>
            </div>
          </div>,
          document.body
        )
      })()}
    </div>
  )
}
