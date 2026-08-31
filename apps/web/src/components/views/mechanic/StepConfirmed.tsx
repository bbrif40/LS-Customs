/**
 * StepConfirmed — final success state. Shown after the orchestrator
 * resolves a booking. Offers "Book another" and "Back to home" actions.
 */
import { Check, Home, Wrench } from 'lucide-react'
import type { ServiceBooking } from '../../../types'
import { SummaryRow } from './SummaryRow'

interface StepConfirmedProps {
  booking: ServiceBooking
  onBookAnother: () => void
  onBackToHome?: () => void
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

function prettyStatus(s: ServiceBooking['status']): string {
  return s.replace('_', ' ')
}

export function StepConfirmed({ booking, onBookAnother, onBackToHome }: StepConfirmedProps) {
  return (
    <article className="confirmation-card">
      <div className="confirmation-check" aria-hidden="true">
        <Check size={28} />
      </div>
      <p className="eyebrow">BOOKING CONFIRMED</p>
      <h2>You're all set</h2>
      <p className="muted">
        A certified mobile mechanic will be on the way. We'll send a notification once a mechanic
        is assigned.
      </p>

      <div className="confirmation-ref">
        <span className="confirmation-ref-label">BOOKING REFERENCE</span>
        <code className="confirmation-ref-value">{booking.id}</code>
      </div>

      <div className="confirmation-summary">
        <SummaryRow label="Service" value={booking.serviceName} action={null} />
        <SummaryRow label="When" value={formatDateTime(booking.scheduledAt)} action={null} />
        <SummaryRow
          label="Where"
          value={
            <>
              {booking.addressLine1}
              <br />
              {booking.addressCity}
            </>
          }
          action={null}
        />
        <SummaryRow
          label="Total"
          value={<strong>{booking.servicePrice}</strong>}
          action={null}
        />
        <SummaryRow
          label="Status"
          value={<span className="status-pill green">{prettyStatus(booking.status).toUpperCase()}</span>}
          action={null}
        />
      </div>

      <div className="mechanic-mini confirmation-mechanic">
        <div className="avatar mechanic-avatar">
          <Wrench size={14} />
        </div>
        <div>
          <strong>Mechanic will be assigned shortly</strong>
          <span>You can track progress from the Bookings tab.</span>
        </div>
        <span className="online-dot" />
      </div>

      <div className="step-actions">
        <button type="button" className="button dark-button" onClick={onBookAnother}>
          Book another service
        </button>
        {onBackToHome && (
          <button type="button" className="outline-button" onClick={onBackToHome}>
            <Home size={14} /> Back to home
          </button>
        )}
      </div>
    </article>
  )
}
