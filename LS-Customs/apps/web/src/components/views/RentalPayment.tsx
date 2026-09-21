import { useState, useEffect } from 'react'
import { ArrowLeft, CheckCircle2, CreditCard, Fuel, Gauge, Loader2, LockKeyhole, MapPin, Settings2, Star, Users, Zap, AlertTriangle } from 'lucide-react'
import { useProfile } from '../../hooks/useProfile'
import { usePaymentIntent } from '../../hooks/usePaymentIntent'
import { usePaymentStatus } from '../../hooks/usePaymentStatus'
import { useSmsNotification } from '../../hooks/useSmsNotification'
import { PaymentForm } from '../common/PaymentForm'
import { PaymentMethodBadges } from '../common/PaymentMethodBadges'
import type { Vehicle } from '../../types'
import type { PaymentIntentResult } from '../../hooks/usePaymentIntent'

interface RentalPaymentProps {
  vehicle: Vehicle
  bookingId: string
  startDate: string
  endDate: string
  total: number
  userId: string | undefined
  onBack: () => void
  onNotify: (message: string) => void
}

export function RentalPayment({ vehicle, bookingId, startDate, endDate, total, userId, onBack, onNotify }: RentalPaymentProps) {
  const [payment, setPayment] = useState<PaymentIntentResult | null>(null)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [formStatus, setFormStatus] = useState<'idle' | 'processing' | 'succeeded' | 'failed' | 'refunded'>('idle')
  const { profile, defaultAddress, loading } = useProfile(userId)
  const { creating, error: intentError, createIntent } = usePaymentIntent()
  const { sendSms: sendSmsNotification } = useSmsNotification()

  // Subscribe to the payment row's status for async webhook confirmations
  const paymentId = payment?.payment_id ?? null
  const { status: paymentStatus, loading: statusLoading } = usePaymentStatus(paymentId)

  // When the backend webhook flips the status to 'succeeded' or 'failed',
  // reflect it in the UI.
  useEffect(() => {
    if (paymentStatus?.status === 'succeeded') {
      setFormStatus('succeeded')
      onNotify('Payment confirmed. Your booking is now locked in.')
      // Send SMS confirmation
      if (userId) {
        void sendSmsNotification({
          userId,
          type: 'payment_confirmed',
          title: 'Payment confirmed',
          body: `Hi ${profile?.full_name || 'there'}! Your rental of ${vehicle.name} is confirmed. Booking ref: booking-${bookingId.slice(0, 8)}. See you soon!`,
        })
      }
    } else if (paymentStatus?.status === 'failed') {
      setFormStatus('failed')
      onNotify('Payment could not be processed. Please try a different payment method.')
    } else if (paymentStatus?.status === 'refunded') {
      setFormStatus('refunded')
    }
  }, [paymentStatus, onNotify, userId, bookingId, vehicle.name, profile?.full_name])

  const handleInitiatePayment = async () => {
    // Check profile completeness before proceeding
    const phoneMissing = !profile?.phone
    const addressMissing = !defaultAddress?.line1 || !defaultAddress?.city
    if (phoneMissing || addressMissing) {
      setShowProfileModal(true)
      return
    }

    const intent = await createIntent('vehicle', bookingId)
    if (intent) {
      setPayment(intent)
      onNotify('Payment intent created. Complete payment with your provider.')
    }
  }

  const handleFormComplete = (result: 'succeeded' | 'failed' | 'processing') => {
    setFormStatus(result === 'succeeded' ? 'succeeded' : result === 'failed' ? 'failed' : 'processing')
  }

  const gallery = vehicle.galleryImages?.length ? vehicle.galleryImages : vehicle.image ? [vehicle.image] : []
  const features = vehicle.features?.length ? vehicle.features : ['Comfortable interior', vehicle.detail.includes('Manual') ? 'Manual transmission' : 'Automatic transmission']
  const rules = vehicle.rentalRules?.length ? vehicle.rentalRules : ['Please return the vehicle in the same condition.']

  return (
    <div className="page rental-payment-page">
      <button className="text-button" onClick={onBack}><ArrowLeft size={15} /> Back to rentals</button>
      <section className="rental-detail-gallery">
        {gallery.slice(0, 5).map((image, index) => <img key={`${image}-${index}`} className={index === 0 ? 'is-featured' : ''} src={image} alt={`${vehicle.name} view ${index + 1}`} />)}
        {gallery.length === 0 && <div className="rental-gallery-empty">Vehicle images coming soon</div>}
      </section>
      <div className="rental-detail-heading">
        <div>
          <p className="eyebrow">{vehicle.tag}</p>
          <h1>{vehicle.name} <Star size={22} fill="currentColor" /></h1>
          <p className="muted"><MapPin size={15} /> {vehicle.location || 'Los Santos'} · {vehicle.detail}</p>
        </div>
        <span className="vehicle-rating"><Star size={15} fill="currentColor" /> {vehicle.rating}</span>
      </div>
      <div className="rental-detail-layout">
        <section className="rental-detail-copy">
          <div className="rental-detail-specs">
            <span><Users size={17} /> {vehicle.detail.match(/\d+ seats/)?.[0] || '5 seats'}</span>
            <span><Settings2 size={17} /> {vehicle.detail.includes('Manual') ? 'Manual' : 'Automatic'}</span>
            <span><Fuel size={17} /> {vehicle.detail.includes('Electric') ? 'Electric' : 'Regular unleaded'}</span>
          </div>
          <h2>Hosted by</h2>
          <p className="host-line"><span className="host-avatar">{(vehicle.hostName || 'LS').slice(0, 1)}</span><strong>{vehicle.hostName || 'LS Customs'}</strong><Star size={15} fill="currentColor" /> {vehicle.hostRating || 'N/A'}</p>
          <h2>Description</h2>
          <p className="detail-description">{vehicle.description || 'Always in good running condition.'}</p>
          <h2>Car features</h2>
          <div className="detail-feature-grid">{features.map((feature) => <span key={feature}><Zap size={15} /> {feature}</span>)}</div>
          <h2>Rental duration guide</h2>
          <p className="detail-description">Minimum rental duration: 1 day</p>
          <p className="detail-description">Maximum rental duration: {vehicle.maxTrip || 'Flexible'}</p>
          <h2>Car rules</h2>
          <ul className="detail-rules">{rules.map((rule) => <li key={rule}><LockKeyhole size={15} /> {rule}</li>)}</ul>
        </section>
        <aside className="rental-booking-panel">
          <h2>Car rental price</h2>
          <strong>₱{total.toLocaleString()}</strong><span> total</span>
          <div className="booking-summary-dates"><span>{startDate}</span><span>{endDate}</span></div>
          <p className="booking-reference">Booking reference: <code>booking-{bookingId.slice(0, 8)}</code></p>
          {intentError && <p className="form-helper review-error">{intentError}</p>}

          {payment && formStatus === 'succeeded' ? (
            <div className="confirmation-card">
              <CheckCircle2 size={28} />
              <h2>Payment confirmed</h2>
              <p className="muted">Your booking is now locked in. Payment ID: <code>{payment.payment_id}</code></p>
            </div>
          ) : payment && formStatus === 'failed' ? (
            <div className="payment-failed-state">
              <AlertTriangle size={24} />
              <h3>Payment failed</h3>
              <p className="muted">Your card was declined or could not be processed.</p>
              <button className="button dark-button" onClick={() => setFormStatus('idle')} style={{ marginTop: '8px' }}>
                Try again
              </button>
            </div>
          ) : payment ? (
            <div className="payment-form-wrapper">
              {formStatus === 'processing' && (
                <div className="payment-processing-banner">
                  <Loader2 size={16} className="spin" />
                  <span>Waiting for provider confirmation…</span>
                </div>
              )}
              <PaymentForm
                clientSecret={payment.client_secret}
                checkoutUrl={payment.checkout_url}
                amount={payment.amount}
                currency={payment.currency}
                provider={payment.provider}
                onComplete={handleFormComplete}
                onError={(msg) => onNotify(msg)}
              />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <PaymentMethodBadges />
              <button className="button dark-button" onClick={() => void handleInitiatePayment()} disabled={creating || loading}>
                {creating ? <Loader2 size={16} className="spin" /> : <CreditCard size={16} />}
                {creating ? 'Preparing payment…' : loading ? 'Loading profile…' : `Pay ₱${total.toLocaleString()} with PayMongo`}
              </button>
            </div>
          )}
          {showProfileModal && (
            <div className="modal-backdrop" onClick={() => setShowProfileModal(false)}>
              <div className="modal-card" onClick={(event) => event.stopPropagation()}>
                <div className="modal-icon-row"><AlertTriangle size={28} className="modal-icon-alert" /></div>
                <h2>Complete your profile first</h2>
                <p className="muted">
                  {!profile?.phone && <span>Your <strong>phone number</strong> is missing. </span>}
                  {(!defaultAddress?.line1 || !defaultAddress?.city) && <span>Your <strong>address</strong> is missing. </span>}
                  Please update your profile before proceeding with payment.
                </p>
                <button className="button dark-button" onClick={() => setShowProfileModal(false)}>Got it</button>
              </div>
            </div>
          )}
          <div className="booking-policy"><Gauge size={22} /><div><strong>{vehicle.mileagePolicy || 'Mileage terms provided at pickup'}</strong><span>{vehicle.maxTrip || 'Rental duration confirmed above'}</span></div></div>
          {vehicle.deliveryMethods?.length ? <p className="delivery-note">Delivery: {vehicle.deliveryMethods.join(' · ')}</p> : null}
        </aside>
      </div>
    </div>
  )
}