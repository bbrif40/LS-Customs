/**
 * StepReview — last step before submission. Shows the full booking summary
 * including base service price, assigned driver, distance from mechanic,
 * distance fee (every 5km is ₱85), and calculated total price.
 */
import { ChevronLeft } from 'lucide-react'
import type { Service } from '../../../types'
import type { ChosenAddress } from './MechanicBookingFlow'
import type { DispatchMechanic } from '../../../hooks/useMechanicDistance'
import { SummaryRow } from './SummaryRow'
import type { Step } from './steps'

interface StepReviewProps {
  service: Service | null
  date: string | null
  time: string | null
  address: ChosenAddress | null
  assignedMechanic?: DispatchMechanic | null
  distanceKm?: number
  distanceFeePesos?: number
  formattedDistanceFee?: string
  totalPricePesos?: number
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

function formatBasePrice(service: Service | null): string {
  if (!service) return '—'
  if (service.priceCents != null) return `₱${(service.priceCents / 100).toFixed(2)}`
  return service.price.startsWith('$') ? `₱${service.price.slice(1)}` : service.price
}

export function StepReview({
  service,
  date,
  time,
  address,
  assignedMechanic,
  distanceKm = 0,
  distanceFeePesos = 85,
  formattedDistanceFee = '₱85.00',
  totalPricePesos,
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

  const basePriceNum = service?.priceCents != null ? service.priceCents / 100 : 0
  const finalTotal = totalPricePesos ?? (basePriceNum + distanceFeePesos)

  return (
    <section className="step-panel">
      <header className="step-panel-head">
        <button type="button" className="text-button step-back" onClick={onBack}>
          <ChevronLeft size={15} /> Back
        </button>
        <p className="eyebrow">STEP 5 OF 6</p>
        <h2>Review & confirm</h2>
        <p className="muted">Double-check the details and total price before booking.</p>
      </header>

      <article className="review-card">
        <div className="review-section">
          <h3>Service Details</h3>
          <SummaryRow
            label="Service"
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
            label="Base Price"
            value={<strong>{formatBasePrice(service)}</strong>}
            action={null}
          />
        </div>

        <div className="review-section">
          <h3>Driver & Distance Calculation</h3>
          <SummaryRow
            label="Assigned Driver"
            value={
              assignedMechanic
                ? `${assignedMechanic.full_name} (★ ${assignedMechanic.rating_avg.toFixed(1)})`
                : 'Closest Active Driver'
            }
            action={null}
          />
          <SummaryRow
            label="Est. Distance"
            value={`${distanceKm > 0 ? distanceKm.toFixed(1) : '3.5'} km from mechanic`}
            action={null}
          />
          <SummaryRow
            label="Distance Fee"
            value={
              <span>
                <strong>{formattedDistanceFee}</strong>{' '}
                <small className="muted">(every 5km is ₱85)</small>
              </span>
            }
            action={null}
          />
          <SummaryRow
            label="Total Price"
            value={
              <strong className="review-total-highlight">
                ₱{finalTotal.toFixed(2)}
              </strong>
            }
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
            {submitting ? 'Confirming…' : `Proceed to Payment (₱${finalTotal.toFixed(2)})`}
          </button>
        </div>
      </article>
    </section>
  )
}
