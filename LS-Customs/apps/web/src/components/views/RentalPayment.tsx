import { useState } from 'react'
import { ArrowLeft, CheckCircle2, CreditCard, Fuel, Gauge, Loader2, LockKeyhole, MapPin, Settings2, Star, Users, Zap } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import type { Vehicle } from '../../types'

interface RentalPaymentProps {
  vehicle: Vehicle
  bookingId: string
  startDate: string
  endDate: string
  total: number
  onBack: () => void
  onNotify: (message: string) => void
}

export function RentalPayment({ vehicle, bookingId, startDate, endDate, total, onBack, onNotify }: RentalPaymentProps) {
  const [creating, setCreating] = useState(false)
  const [payment, setPayment] = useState<{ payment_id: string; provider: string; client_secret: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function createPaymentIntent() {
    setCreating(true); setError(null)
    const { data, error: invokeError } = await supabase.functions.invoke('create-payment-intent', {
      body: { booking_type: 'vehicle', booking_id: bookingId },
      headers: { 'Idempotency-Key': `vehicle:${bookingId}` },
    })
    if (invokeError) setError(invokeError.message)
    else if (!data?.payment_id) setError(data?.message ?? 'Payment intent could not be created')
    else { setPayment(data); onNotify('Payment intent created. Complete payment with your provider.') }
    setCreating(false)
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
          <p className="booking-reference">Booking reference: <code>{bookingId}</code></p>
          {error && <p className="form-helper review-error">{error}</p>}
          {payment ? (
            <div className="confirmation-card">
              <CheckCircle2 size={28} />
              <h2>Payment session ready</h2>
              <p className="muted">Provider: {payment.provider}. Your booking stays pending until the provider webhook confirms payment.</p>
              <code>{payment.payment_id}</code>
            </div>
          ) : (
            <button className="button dark-button" onClick={() => void createPaymentIntent()} disabled={creating}>
              {creating ? <Loader2 size={16} className="spin" /> : <CreditCard size={16} />}
              {creating ? 'Preparing payment…' : 'Continue to payment'}
            </button>
          )}
          <div className="booking-policy"><Gauge size={22} /><div><strong>{vehicle.mileagePolicy || 'Mileage terms provided at pickup'}</strong><span>{vehicle.maxTrip || 'Rental duration confirmed above'}</span></div></div>
          {vehicle.deliveryMethods?.length ? <p className="delivery-note">Delivery: {vehicle.deliveryMethods.join(' · ')}</p> : null}
        </aside>
      </div>
    </div>
  )
}