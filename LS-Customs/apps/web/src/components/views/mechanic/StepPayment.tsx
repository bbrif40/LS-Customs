/**
 * StepPayment — collects payment for a confirmed service booking.
 *
 * Rendered after StepReview confirms the booking details. The service_bookings
 * row is already persisted by the orchestrator; this step creates a payment
 * intent and collects the card details via <PaymentForm>.
 *
 * Flow:
 *   1. "Pay now" button → usePaymentIntent creates the intent on the backend
 *   2. <PaymentForm> renders with the client_secret
 *   3. On 'succeeded', calls onConfirm(booking) so the orchestrator can
 *      advance to StepConfirmed.
 */
import { useState, useEffect } from 'react'
import {
  CheckCircle2,
  ChevronLeft,
  CreditCard,
  Loader2,
  Hash,
  User,
  Phone,
  Wrench,
} from 'lucide-react'
import { usePaymentIntent } from '../../../hooks/usePaymentIntent'
import { usePaymentStatus } from '../../../hooks/usePaymentStatus'
import { useSmsNotification } from '../../../hooks/useSmsNotification'
import { PaymentForm } from '../../common/PaymentForm'
import { SummaryRow } from './SummaryRow'
import type { ServiceBooking } from '../../../types'

interface StepPaymentProps {
  /** The service booking that was just created. */
  bookingId: string
  serviceName: string
  servicePrice: string
  baseServicePrice?: string
  distanceFee?: string
  distanceKm?: string
  scheduledAt: string
  addressLabel: string
  addressCity: string
  userId: string | undefined
  customerName?: string | null
  customerPhone?: string | null
  mechanicName?: string | null
  mechanicPhone?: string | null
  onConfirm: (booking: ServiceBooking) => void
  onBack: () => void
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function StepPayment({
  bookingId,
  serviceName,
  servicePrice,
  baseServicePrice,
  distanceFee,
  distanceKm,
  scheduledAt,
  addressLabel,
  addressCity,
  userId,
  customerName,
  customerPhone,
  mechanicName,
  mechanicPhone,
  onConfirm,
  onBack,
}: StepPaymentProps) {
  const { creating, error: intentError, createIntent } = usePaymentIntent()
  const { sendSms: sendSmsNotification } = useSmsNotification()
  const [intent, setIntent] = useState<{
    payment_id: string
    client_secret: string
    checkout_url?: string
    provider: string
    amount: number
    currency: string
  } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [formStatus, setFormStatus] = useState<'idle' | 'processing' | 'succeeded' | 'failed'>('idle')
  const { status: paymentStatus } = usePaymentStatus(intent?.payment_id ?? null)

  // Catch async webhook confirmations (3DS, bank redirects)
  useEffect(() => {
    if (paymentStatus?.status === 'succeeded') {
      setFormStatus('succeeded')
      // Send SMS confirmation
      if (userId) {
        void sendSmsNotification({
          userId,
          type: 'service_payment_confirmed',
          title: 'Service payment confirmed',
          body: `Your mobile mechanic service (${serviceName}) is confirmed for ${new Date(scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}. Our team will be in touch shortly.`,
        })
      }
      onConfirm({
        id: bookingId,
        serviceName,
        servicePrice,
        scheduledAt,
        addressLine1: addressLabel,
        addressCity,
        status: 'confirmed',
      })
    } else if (paymentStatus?.status === 'failed') {
      setFormStatus('failed')
    }
  }, [paymentStatus, bookingId, serviceName, servicePrice, scheduledAt, addressLabel, addressCity, onConfirm, userId])

  const handleInitiatePayment = async () => {
    const result = await createIntent('service', bookingId)
    if (result) {
      setIntent(result)
      setFormStatus('processing')
    }
  }

  const handleFormComplete = (result: 'succeeded' | 'failed' | 'processing') => {
    setFormStatus(result === 'succeeded' ? 'succeeded' : result === 'failed' ? 'failed' : 'processing')
  }

  return (
    <section className="step-panel">
      <header className="step-panel-head">
        <button type="button" className="text-button step-back" onClick={onBack}>
          <ChevronLeft size={15} /> Back
        </button>
        <p className="eyebrow">STEP 6 OF 6</p>
        <h2>Secure payment</h2>
        <p className="muted">Your card is charged securely. You'll see a confirmation once the payment clears.</p>
      </header>

      <article className="review-card">
        <div className="review-section">
          <h3>Booking summary</h3>
          <SummaryRow
            label="Booking ID"
            value={
              <span className="summary-booking-id">
                <Hash size={12} style={{ display: 'inline', marginRight: 2, verticalAlign: 'middle' }} />
                {bookingId.length > 12 ? bookingId.slice(0, 8).toUpperCase() : bookingId}
              </span>
            }
            action={null}
          />
          <SummaryRow
            label="Customer"
            value={<strong>{customerName || 'Valued Customer'}</strong>}
            action={null}
          />
          <SummaryRow
            label="Customer phone"
            value={
              customerPhone ? (
                <a href={`tel:${customerPhone.replace(/[^+\d]/g, '')}`} className="summary-phone-link">
                  <Phone size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                  {customerPhone}
                </a>
              ) : (
                <span className="muted">Contact on file</span>
              )
            }
            action={null}
          />
          <SummaryRow
            label="Assigned mechanic"
            value={
              <span className="summary-mechanic-badge">
                <Wrench size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                {mechanicName || 'Mobile Roadside Specialist'}
              </span>
            }
            action={null}
          />
          <SummaryRow
            label="Mechanic phone"
            value={
              mechanicPhone ? (
                <a href={`tel:${mechanicPhone.replace(/[^+\d]/g, '')}`} className="summary-phone-link mechanic">
                  <Phone size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                  {mechanicPhone}
                </a>
              ) : (
                <span className="muted">+63 917 555 0192</span>
              )
            }
            action={null}
          />
          <SummaryRow label="Service" value={serviceName} action={null} />
          {baseServicePrice && <SummaryRow label="Base service" value={baseServicePrice} action={null} />}
          {distanceFee && (
            <SummaryRow
              label="Distance fee"
              value={`${distanceFee} (${distanceKm ? `${distanceKm}` : 'every 5km is ₱85'})`}
              action={null}
            />
          )}
          <SummaryRow label="When" value={formatDateTime(scheduledAt)} action={null} />
          <SummaryRow label="Where" value={`${addressLabel}, ${addressCity}`} action={null} />
          <SummaryRow label="Total" value={<strong className="review-total-highlight">{servicePrice}</strong>} action={null} />
        </div>

        {intentError && <p className="form-helper review-error">{intentError}</p>}
        {formError && <p className="form-helper review-error">{formError}</p>}

        {formStatus === 'succeeded' ? (
          <div className="payment-success-state">
            <CheckCircle2 size={24} className="payment-success-icon" />
            <p>Payment confirmed. Finishing up…</p>
          </div>
        ) : formStatus === 'failed' ? (
          <div className="payment-failed-state">
            <p className="form-helper review-error">Payment was declined. Please try a different card.</p>
            <button className="button dark-button" onClick={() => setFormStatus('idle')}>
              Try again
            </button>
          </div>
        ) : intent ? (
          <div className="payment-form-section">
            {formStatus === 'processing' && (
              <div className="payment-processing-banner">
                <Loader2 size={16} className="spin" />
                <span>Waiting for provider confirmation…</span>
              </div>
            )}
            <PaymentForm
              clientSecret={intent.client_secret}
              checkoutUrl={intent.checkout_url}
              amount={intent.amount}
              currency={intent.currency}
              provider={intent.provider}
              onComplete={handleFormComplete}
              onError={(msg) => setFormError(msg)}
            />
          </div>
        ) : (
          <div className="step-actions">
            <button
              className="button dark-button"
              onClick={() => void handleInitiatePayment()}
              disabled={creating}
            >
              {creating ? (
                <>
                  <Loader2 size={14} className="spin" /> Preparing payment…
                </>
              ) : (
                <>
                  <CreditCard size={14} /> Pay {servicePrice}
                </>
              )}
            </button>
          </div>
        )}
      </article>
    </section>
  )
}
