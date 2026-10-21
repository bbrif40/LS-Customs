import { useWebsiteText } from "../../hooks/useWebsiteText"
import { useState } from 'react'
import { useRentalCheckout, RentalLicenseReview } from './RentalLicenseReview'
import { StepPayment } from '../views/mechanic/StepPayment'

export function RentalBookingCheckout({ bookingId }: { bookingId: string }) {
  const { checkout, error, load } = useRentalCheckout(bookingId)
  return <>{error && <p role="alert">{error}</p>}{checkout && checkout.checkout_state !== 'legacy' && <RentalLicenseReview checkout={checkout} reload={load} />}</>
}
export function ServiceBookingCheckout({ bookingId, userId, name, total, scheduledAt }: { bookingId: string; userId?: string; name: string; total: number; scheduledAt: string }) {
  const websiteText = useWebsiteText("Bookings")

  const [confirmed, setConfirmed] = useState(false)
  return confirmed ? <p role="status">{websiteText("Appointment confirmed. Refresh booking details for the latest status.")}</p> : <StepPayment bookingId={bookingId} userId={userId} serviceName={name} servicePrice={`PHP ${Number(total).toFixed(2)}`} scheduledAt={scheduledAt} addressLabel="Confirmed booking location" addressCity="" onBack={() => setConfirmed(true)} onConfirm={() => setConfirmed(true)} />
}
