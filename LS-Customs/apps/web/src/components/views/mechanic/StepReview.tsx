/**
 * StepReview — last step before submission. Shows the full booking summary
 * with per-section "Edit" links that jump back to the relevant step.
 */
import { ChevronLeft } from 'lucide-react'
import type { Service } from '../../../types'
import type { ChosenAddress } from './MechanicBookingFlow'
import { SummaryRow } from './SummaryRow'
import type { Step } from './steps'

interface StepReviewProps {
  service: Service | null
  date: string | null
  time: string | null
  address: ChosenAddress | null
  submitting: boolean
  submitError: string | null
  onBack: () => void
  onConfirm: () => void
  onJumpTo: (step: Step) => void
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function formatPrice(service: Service | null): string {
  if (!service) return '—'
  if (service.priceCents != null) return `$${(service.priceCents / 100).toFixed(2)}`
  return service.price
}

export function StepReview({
  service,
  date,
  time,
  address,
  submitting,
  submitError,
  onBack,
  onConfirm,
  onJumpTo,
}: StepReviewProps) {
  const missing: Step[] = []
  if (!service) missing.push('service')
  if (!date || !time) missing.push('schedule')
  if (!address) missing.push('location')

  const isIncomplete = missing.length > 0

  return (
    <section className="step-panel">
      <header className="step-panel-head">
        <button type="button" className="text-button step-back" onClick={onBack}>
          <ChevronLeft size={15} /> Back
        </button>
        <p className="eyebrow">STEP 5 OF 5</p>
        <h2>Review & confirm</h2>
        <p className="muted">Double-check the details before we book the mechanic.</p>
      </header>

      <article className="review-card">
        <div className="review-section">
          <h3>Service</h3>
          <SummaryRow
            label="Type"
            value={service ? service.name : '—'}
            action={
              <button type="button" className="text-button" onClick={() => onJumpTo('service')}>
                Edit
              </button>
            }
          />
          <SummaryRow
            label="Category"
            value={service ? service.category : '—'}
            action={null}
          />
          <SummaryRow label="Est. duration" value={service ? service.duration : '—'} action={null} />
          <SummaryRow
            label="Price"
            value={<strong>{formatPrice(service)}</strong>}
            action={null}
          />
        </div>

        <div className="review-section">
          <h3>Schedule</h3>
          <SummaryRow
            label="Date"
            value={formatDate(date)}
            action={
              <button type="button" className="text-button" onClick={() => onJumpTo('schedule')}>
                Edit
              </button>
            }
          />
          <SummaryRow label="Time" value={time ?? '—'} action={null} />
        </div>

        <div className="review-section">
          <h3>Location</h3>
          <SummaryRow
            label="Address"
            value={
              address ? (
                <>
                  {address.label && <small className="summary-tag">{address.label}</small>}
                  <br />
                  {address.line1}, {address.city}
                </>
              ) : (
                '—'
              )
            }
            action={
              <button type="button" className="text-button" onClick={() => onJumpTo('location')}>
                Edit
              </button>
            }
          />
        </div>

        {isIncomplete && (
          <p className="form-helper review-warning">
            You're missing {missing.join(', ')}. Use the stepper to go back and finish.
          </p>
        )}
        {submitError && <p className="form-helper review-error">{submitError}</p>}

        <div className="step-actions">
          <button
            type="button"
            className="button dark-button"
            disabled={isIncomplete || submitting}
            onClick={onConfirm}
          >
            {submitting ? 'Confirming…' : 'Confirm booking'}
          </button>
        </div>
      </article>
    </section>
  )
}
