import { useState } from 'react'
import { ArrowLeft, CheckCircle2, CreditCard, Loader2 } from 'lucide-react'
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

  return (
    <div className="page">
      <button className="text-button" onClick={onBack}><ArrowLeft size={15} /> Back to rentals</button>
      <div className="payment-layout">
        <section className="step-panel">
          <p className="eyebrow">RENTAL PAYMENT</p>
          <h1>Complete your booking</h1>
          <p className="muted">{vehicle.name} · {startDate} to {endDate}</p>
          <div className="review-card">
            <div className="summary-row"><span>Vehicle</span><strong>{vehicle.name}</strong></div>
            <div className="summary-row"><span>Rental total</span><strong>₱{total.toLocaleString()}</strong></div>
            <div className="summary-row"><span>Booking reference</span><code>{bookingId}</code></div>
          </div>
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
        </section>
      </div>
    </div>
  )
}