import { useWebsiteText } from "../../../hooks/useWebsiteText"
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
  Ticket,
} from 'lucide-react'
import { usePaymentIntent } from '../../../hooks/usePaymentIntent'
import { useServiceCheckout } from '../../../hooks/useServiceCheckout'
import { useTransactionTerms } from '../../common/TransactionTerms'
import { supabase } from '../../../supabaseClient'
import { usePaymentStatus } from '../../../hooks/usePaymentStatus'
import { useSmsNotification } from '../../../hooks/useSmsNotification'
import { PaymentForm } from '../../common/PaymentForm'
import { PaymentMethodBadges } from '../../common/PaymentMethodBadges'
import { SummaryRow } from './SummaryRow'
import type { ServiceBooking } from '../../../types'
import type { PromoVoucher } from '../../common/AvailableVouchersPromos'

interface StepPaymentProps {
  /** The service booking that was just created. */
  bookingId: string
  serviceName: string
  servicePrice: string
  baseServicePrice?: string
  distanceFee?: string
  distanceKm?: string
  promo?: PromoVoucher | null
  promoDiscount?: string
  scheduledAt: string
  addressLabel: string
  addressCity: string
  userId: string | undefined
  customerName?: string | null
  customerPhone?: string | null
  mechanicName?: string | null
  mechanicPhone?: string | null
  onConfirm: (booking: ServiceBooking) => void
  onRestart?: () => void
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
  promo,
  promoDiscount,
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
  onRestart,
}: StepPaymentProps) {
  const websiteText = useWebsiteText("Mechanic")

  const { checkout, error: checkoutError, remaining, load: reloadCheckout } = useServiceCheckout(bookingId)
  const reviewTerms = useTransactionTerms()
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
    if ((paymentStatus?.status === 'succeeded' && ['legacy', 'confirmed'].includes(checkout?.checkout_state ?? '')) || (checkout?.checkout_state === 'confirmed' && checkout.payment_method === 'cash')) {
      setFormStatus('succeeded')
      // Send SMS confirmation
      if (userId && checkout?.payment_method !== 'cash') {
        void sendSmsNotification({
          userId,
          type: 'service_payment_confirmed',
          title: 'Service payment confirmed',
          body: `Your mobile mechanic service (${serviceName}, service-${bookingId.slice(0, 8)}) is confirmed for ${new Date(scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}. Our team will be in touch shortly.`,
        })
      }
      onConfirm({
        id: bookingId,
        serviceName,
        servicePrice,
        scheduledAt,
        addressLine1: addressLabel,
        addressCity,
        status: checkout?.status === 'assigned' ? 'assigned' : 'confirmed',
      })
    } else if (paymentStatus?.status === 'failed') {
      setFormStatus('failed')
    }
  }, [paymentStatus, checkout?.checkout_state, checkout?.payment_method, bookingId, serviceName, servicePrice, scheduledAt, addressLabel, addressCity, onConfirm, userId])

  const switchToCash = async () => {
    try {
      if (!await reviewTerms(bookingId, 'payment')) return
      const { error: cashError } = await supabase.rpc('confirm_service_cash', { p_booking: bookingId })
      if (cashError) throw cashError
      await reloadCheckout()
    } catch (failure) { setFormError(failure instanceof Error ? failure.message : 'Cash confirmation failed.') }
  }

  const handleInitiatePayment = async () => {
    const result = await createIntent('service', bookingId)
    if (result) {
      setIntent(result)
      setFormStatus('processing')
    }
  }

  const handleFormComplete = (result: 'succeeded' | 'failed' | 'processing') => {
    setFormStatus(result === 'failed' ? 'failed' : 'processing')
  }

  return (
    <section className="step-panel">
      <header className="step-panel-head">
        <button type="button" className="text-button step-back" onClick={onBack}>
          <ChevronLeft size={15} />{' '}{websiteText("Back")}</button>
        <p className="eyebrow">{websiteText("STEP 6 OF 6")}</p>
        <h2>{websiteText("Secure payment")}</h2>
        {checkoutError && <p role="alert">{checkoutError}</p>}
        {checkout?.checkout_state === 'offering' && <p role="status">{websiteText("Waiting for a mechanic to accept.")} {remaining ?? 0}{' '}{websiteText("s remaining. No payment is taken before acceptance.")}</p>}
        {checkout?.checkout_state === 'awaiting_payment' && <p role="status">{websiteText("Mechanic accepted. Complete payment now ·")} {remaining ?? 0}{' '}{websiteText("s remaining.")}</p>}
        {checkout?.checkout_state === 'awaiting_payment' && remaining !== 0 && paymentStatus?.status === 'failed' && <button type="button" onClick={() => void switchToCash()}>{websiteText("Switch failed payment to cash after service")}</button>}
        {(checkout?.checkout_state === 'expired' || (remaining === 0 && checkout?.checkout_state !== 'confirmed')) && <p role="alert">{websiteText("The offer or checkout window expired. Retry with a new availability check, choose another time, or contact support.")} {onRestart && <button type="button" onClick={onRestart}>{websiteText("Start a fresh availability check")}</button>}</p>}
        <p className="muted">{websiteText("Your card is charged securely. You'll see a confirmation once the payment clears.")}</p>
      </header>

      <article className="review-card">
        <div className="review-section">
          <h3>{websiteText("Booking summary")}</h3>
          <SummaryRow
            label={websiteText("Booking ID")}
            value={
              <span className="summary-booking-id">
                <Hash size={12} style={{ display: 'inline', marginRight: 2, verticalAlign: 'middle' }} />{' '}{websiteText("service-")}{bookingId.length > 8 ? bookingId.slice(0, 8) : bookingId}
              </span>
            }
            action={null}
          />
          <SummaryRow
            label={websiteText("Customer")}
            value={<strong>{customerName || websiteText("Valued Customer")}</strong>}
            action={null}
          />
          <SummaryRow
            label={websiteText("Customer phone")}
            value={
              customerPhone ? (
                <a href={`tel:${customerPhone.replace(/[^+\d]/g, '')}`} className="summary-phone-link">
                  <Phone size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                  {customerPhone}
                </a>
              ) : (
                <span className="muted">{websiteText("Contact on file")}</span>
              )
            }
            action={null}
          />
          {mechanicName ? (
            <>
              <SummaryRow
                label={websiteText("Assigned mechanic")}
                value={
                  <span className="summary-mechanic-badge">
                    <Wrench size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                    {mechanicName}
                  </span>
                }
                action={null}
              />
              {mechanicPhone && (
                <SummaryRow
                  label={websiteText("Mechanic phone")}
                  value={
                    <a href={`tel:${mechanicPhone.replace(/[^+\d]/g, '')}`} className="summary-phone-link mechanic">
                      <Phone size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                      {mechanicPhone}
                    </a>
                  }
                  action={null}
                />
              )}
            </>
          ) : (
            <SummaryRow
              label={websiteText("Assigned mechanic")}
              value={<span className="muted">{websiteText("Assigned upon dispatch")}</span>}
              action={null}
            />
          )}
          <SummaryRow label={websiteText("Service")} value={serviceName} action={null} />
          {baseServicePrice && <SummaryRow label={websiteText("Base service")} value={baseServicePrice} action={null} />}
          {distanceFee && (
            <SummaryRow
              label={websiteText("Distance fee")}
              value={`${distanceFee} (${distanceKm ? `${distanceKm}` : 'every 5km is ₱85'})`}
              action={null}
            />
          )}
          <SummaryRow label={websiteText("When")} value={formatDateTime(scheduledAt)} action={null} />
          <SummaryRow label={websiteText("Where")} value={`${addressLabel}, ${addressCity}`} action={null} />
          {promo && (
            <SummaryRow
              label={websiteText("Voucher / Promo")}
              value={
                <span style={{ color: '#10b981', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Ticket size={13} /> {promo.code} ({promoDiscount || promo.discount})
                </span>
              }
              action={null}
            />
          )}
          <SummaryRow label={websiteText("Total")} value={<strong className="review-total-highlight">{servicePrice}</strong>} action={null} />
        </div>

        {intentError && <p className="form-helper review-error">{intentError}</p>}
        {formError && <p className="form-helper review-error">{formError}</p>}

        {formStatus === 'succeeded' ? (
          <div className="payment-success-state">
            <CheckCircle2 size={24} className="payment-success-icon" />
            <p>{websiteText("Payment confirmed. Finishing up…")}</p>
          </div>
        ) : formStatus === 'failed' ? (
          <div className="payment-failed-state">
            <p className="form-helper review-error">{websiteText("Payment was declined. Please try a different card.")}</p>
            <button className="button dark-button" onClick={() => setFormStatus('idle')}>{websiteText("Try again")}</button>
          </div>
        ) : intent ? (
          <div className="payment-form-section">
            {formStatus === 'processing' && (
              <div className="payment-processing-banner">
                <Loader2 size={16} className="spin" />
                <span>{websiteText("Waiting for provider confirmation…")}</span>
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
          <div className="step-actions" style={{ flexDirection: 'column', gap: '12px' }}>
            <PaymentMethodBadges />
            <button
              className="button dark-button"
              onClick={() => void handleInitiatePayment()}
              disabled={creating || !checkout || !['legacy', 'awaiting_payment'].includes(checkout.checkout_state) || remaining === 0}
              style={{ width: '100%' }}
            >
              {creating ? (
                <>
                  <Loader2 size={14} className="spin" />{' '}{websiteText("Preparing payment…")}</>
              ) : (
                <>
                  <CreditCard size={14} />{' '}{websiteText("Pay")} {servicePrice}{' '}{websiteText("with PayMongo")}</>
              )}
            </button>
            {checkout?.checkout_state === 'awaiting_payment' && remaining !== 0 && (!intent || paymentStatus?.status === 'failed') && <button type="button" className="outline-button" onClick={() => void switchToCash()}>{websiteText("Confirm cash payment after service")}</button>}
          </div>
        )}
      </article>
    </section>
  )
}
