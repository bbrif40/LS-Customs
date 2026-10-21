import { useWebsiteText } from "../../../hooks/useWebsiteText"
import { serviceCategoryLabel } from '../../../utils/serviceCategory'
/**
 * StepReview — last step before submission. Shows the full booking summary
 * including base service price, assigned driver, distance from mechanic,
 * distance fee (every 5km is ₱85), and calculated total price.
 */
import { AlertCircle, ChevronLeft, Ticket } from 'lucide-react'
import type { Service } from '../../../types'
import type { ChosenAddress } from './MechanicBookingFlow'
import type { DispatchMechanic } from '../../../hooks/useMechanicDistance'
import { SummaryRow } from './SummaryRow'
import type { Step } from './steps'
import type { PromoVoucher } from '../../common/AvailableVouchersPromos'

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
  promo?: PromoVoucher | null
  promoDiscountPesos?: number
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
  promo,
  promoDiscountPesos = 0,
  submitting,
  submitError,
  onBack,
  onConfirm,
  onJumpTo,
}: StepReviewProps) {
  const websiteText = useWebsiteText("Mechanic")

  const missing: Step[] = []
  if (!service) missing.push('service')
  if (!date || !time) missing.push('schedule')
  if (!address) missing.push('location')

  const isIncomplete = missing.length > 0

  const basePriceNum = service?.priceCents != null ? service.priceCents / 100 : 0
  const grossTotal = basePriceNum + distanceFeePesos
  const finalTotal = totalPricePesos ?? Math.max(0, grossTotal - promoDiscountPesos)

  return (
    <section className="step-panel">
      <header className="step-panel-head">
        <button type="button" className="text-button step-back" onClick={onBack}>
          <ChevronLeft size={15} />{' '}{websiteText("Back")}</button>
        <p className="eyebrow">{websiteText("STEP 5 OF 6")}</p>
        <h2>{websiteText("Review & confirm")}</h2>
        <p className="muted">{websiteText("Double-check the details and total price before booking.")}</p>
      </header>

      <article className="review-card">
        <div className="review-section">
          <h3>{websiteText("Service Details")}</h3>
          <SummaryRow
            label={websiteText("Service")}
            value={service ? service.name : '—'}
            action={
              <button type="button" className="text-button" onClick={() => onJumpTo('service')}>{websiteText("Edit")}</button>
            }
          />
          <SummaryRow
            label={websiteText("Category")}
            value={service ? websiteText(serviceCategoryLabel(service.category)) : '—'}
            action={null}
          />
          <SummaryRow label={websiteText("Est. duration")} value={service ? service.duration : '—'} action={null} />
          <SummaryRow
            label={websiteText("Base Price")}
            value={<strong>{formatBasePrice(service)}</strong>}
            action={null}
          />
        </div>

        <div className="review-section">
          <h3>{websiteText("Driver & Distance Calculation")}</h3>
          <SummaryRow
            label={websiteText("Assigned Driver")}
            value={
              assignedMechanic
                ? `${assignedMechanic.full_name} (★ ${assignedMechanic.rating_avg.toFixed(1)})`
                : 'Assigned by admin after confirmation'
            }
            action={null}
          />
          <SummaryRow
            label={websiteText("Est. Distance")}
            value={`${distanceKm.toFixed(1)} km from dispatch hub`}
            action={null}
          />
          <SummaryRow
            label={websiteText("Distance Fee")}
            value={
              <span>
                <strong>{formattedDistanceFee}</strong>{' '}
                <small className="muted">{websiteText("(every 5km is ₱85)")}</small>
              </span>
            }
            action={null}
          />
          {promo && promoDiscountPesos > 0 && (
            <SummaryRow
              label={websiteText("Voucher / Promo")}
              value={
                <span style={{ color: '#10b981', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Ticket size={13} /> {promo.code} (-₱{promoDiscountPesos.toFixed(2)})
                </span>
              }
              action={null}
            />
          )}
          <SummaryRow
            label={websiteText("Total Price")}
            value={
              <strong className="review-total-highlight">
                ₱{finalTotal.toFixed(2)}
              </strong>
            }
            action={null}
          />
        </div>

        <div className="review-section">
          <h3>{websiteText("Schedule")}</h3>
          <SummaryRow
            label={websiteText("Date")}
            value={formatDate(date)}
            action={
              <button type="button" className="text-button" onClick={() => onJumpTo('schedule')}>{websiteText("Edit")}</button>
            }
          />
          <SummaryRow label={websiteText("Time")} value={time ?? '—'} action={null} />
        </div>

        <div className="review-section">
          <h3>{websiteText("Location")}</h3>
          <SummaryRow
            label={websiteText("Address")}
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
              <button type="button" className="text-button" onClick={() => onJumpTo('location')}>{websiteText("Edit")}</button>
            }
          />
        </div>

        {isIncomplete && (
          <p className="form-helper review-warning">{websiteText("You're missing")} {missing.join(', ')}{websiteText(". Use the stepper to go back and finish.")}</p>
        )}
        {submitError && <div className="booking-submit-error" role="alert"><AlertCircle size={21} strokeWidth={1.75} aria-hidden="true" /><div><strong>{/location|coverage|radius|pin/i.test(submitError) ? websiteText("Check your service location") : websiteText("Booking needs attention")}</strong><p>{submitError}</p><button type="button" onClick={() => onJumpTo(/location|coverage|radius|pin/i.test(submitError) ? 'location' : 'review')}>{websiteText("Review details")}</button></div></div>}

        <div className="step-actions">
          <button
            type="button"
            className="button dark-button"
            disabled={isIncomplete || submitting}
            onClick={onConfirm}
          >
            {submitting ? websiteText("Confirming…") : websiteText("Proceed to Payment (₱{value1})", { value1: String(finalTotal.toFixed(2)) })}
          </button>
        </div>
      </article>
    </section>
  )
}
