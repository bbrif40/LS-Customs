import { ArrowRight, CarFront, MapPinned, Wrench } from 'lucide-react'
import type { ChatPlannerMode, ChatRecommendation } from '../../types'

const START_OPTIONS: {
  mode: ChatPlannerMode
  title: string
  description: string
  Icon: typeof MapPinned
}[] = [
  {
    mode: 'trip',
    title: 'Plan a trip or rental',
    description: 'Share your dates and destination to explore a route and vehicle.',
    Icon: MapPinned,
  },
  {
    mode: 'diagnosis',
    title: 'Diagnose a car problem',
    description: 'Describe the symptoms and get a careful service suggestion.',
    Icon: Wrench,
  },
]

export function PlannerModePicker({
  disabled,
  onChoose,
}: {
  disabled: boolean
  onChoose: (mode: ChatPlannerMode) => void
}) {
  return (
    <section className="planner-mode-picker" aria-labelledby="planner-mode-heading">
      <h4 id="planner-mode-heading">Choose a starting point</h4>
      <div className="planner-mode-options">
        {START_OPTIONS.map(({ mode, title, description, Icon }) => (
          <button
            key={mode}
            type="button"
            className="planner-mode-option"
            onClick={() => onChoose(mode)}
            disabled={disabled}
          >
            <span className="planner-mode-icon" aria-hidden="true"><Icon size={17} /></span>
            <span className="planner-mode-copy">
              <strong>{title}</strong>
              <span>{description}</span>
            </span>
            <ArrowRight className="planner-mode-arrow" size={16} aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  )
}

export function PlannerModeBar({
  mode,
  onChange,
}: {
  mode: ChatPlannerMode
  onChange: () => void
}) {
  const Icon = mode === 'trip' ? MapPinned : Wrench
  const label = mode === 'trip' ? 'Trip and rental guide' : 'Car problem guide'

  return (
    <div className="planner-mode-bar">
      <span className="planner-mode-bar-label"><Icon size={14} aria-hidden="true" />{label}</span>
      <button type="button" onClick={onChange} aria-label="Change guide and start a new conversation">
        Change guide
      </button>
    </div>
  )
}

export function PlannerItinerary({
  itinerary,
  variant = 'card',
}: {
  itinerary: NonNullable<ChatRecommendation['itinerary']>
  variant?: 'card' | 'message'
}) {
  if (itinerary.days.length === 0) return null

  return (
    <section
      className={`planner-itinerary${variant === 'message' ? ' planner-itinerary--message' : ''}`}
      aria-label={itinerary.title || 'Suggested itinerary'}
    >
      <h5>{itinerary.title || 'Suggested itinerary'}</h5>
      <ol>
        {itinerary.days.map((day, index) => (
          <li key={`${day.day}-${day.title}-${index}`}>
            <strong>Day {day.day}: {day.title}</strong>
            {day.activities.length > 0 && <span>{day.activities.join(' · ')}</span>}
          </li>
        ))}
      </ol>
    </section>
  )
}

export function PlannerRecommendations({
  recommendations,
  mode,
  onSelect,
  hideNestedItinerary = false,
}: {
  recommendations: ChatRecommendation[]
  mode: ChatPlannerMode | null
  onSelect?: (recommendation: ChatRecommendation) => void
  hideNestedItinerary?: boolean
}) {
  if (recommendations.length === 0) return null

  return (
    <div className="planner-recommendations" aria-label="Recommendations">
      {recommendations.map((recommendation, index) => (
        <RecommendationCard
          key={`${recommendation.kind}-${recommendation.id}-${index}`}
          recommendation={recommendation}
          mode={mode}
          onSelect={onSelect}
          hideItinerary={hideNestedItinerary}
        />
      ))}
    </div>
  )
}

function RecommendationCard({
  recommendation,
  mode,
  onSelect,
  hideItinerary,
}: {
  recommendation: ChatRecommendation
  mode: ChatPlannerMode | null
  onSelect?: (recommendation: ChatRecommendation) => void
  hideItinerary: boolean
}) {
  const isVehicle = recommendation.kind === 'vehicle'
  const Icon = isVehicle ? CarFront : Wrench
  const actionLabel = isVehicle ? 'View vehicle' : 'View service details'
  const isDiagnosis = mode === 'diagnosis' && !isVehicle
  const rentalDays = recommendation.dates
    ? Math.round((Date.parse(`${recommendation.dates.end}T00:00:00Z`) - Date.parse(`${recommendation.dates.start}T00:00:00Z`)) / 86400000)
    : 0

  return (
    <article className="planner-recommendation">
      <div className="planner-recommendation-heading">
        <span className="planner-recommendation-icon" aria-hidden="true"><Icon size={16} /></span>
        <div>
          <span className="planner-recommendation-kind">{isVehicle ? 'Rental vehicle' : 'Mechanic service'}</span>
          <h4>{recommendation.title}</h4>
        </div>
      </div>

      <p className="planner-recommendation-reason">{recommendation.reason}</p>

      {isDiagnosis && (
        <p className="planner-diagnostic-note">
          This suggestion is based on the symptoms shared. A mechanic must confirm the cause.
        </p>
      )}

      <div className="planner-recommendation-meta">
        {typeof recommendation.price === 'number' && Number.isFinite(recommendation.price) && (
          <span className="planner-recommendation-price">
            {formatPrice(recommendation.price, recommendation.currency)}{isVehicle ? ' / day' : ''}
          </span>
        )}
        {recommendation.dates && (
          <span className="planner-recommendation-dates">
            {formatDateRange(recommendation.dates.start, recommendation.dates.end)}
          </span>
        )}
        {isVehicle && typeof recommendation.price === 'number' && rentalDays > 0 && rentalDays <= 30 && (
          <span className="planner-recommendation-dates">{rentalDays} rental {rentalDays === 1 ? 'day' : 'days'} · {formatPrice(recommendation.price * rentalDays)} before fees or discounts</span>
        )}
        {isVehicle && recommendation.availability_status && (
          <span className="planner-availability">
            {recommendation.availability_status === 'available_for_dates'
              ? `Shown available${recommendation.checked_at ? ` when checked ${formatCheckedAt(recommendation.checked_at)}` : ' for these dates'}; rechecked during booking`
              : 'Availability not checked; checked again during booking'}
          </span>
        )}
      </div>

      {!isVehicle && typeof recommendation.price === 'number' && Number.isFinite(recommendation.price) && (
        <p className="planner-pricing-note">Base service price before additional fees.</p>
      )}

      {!hideItinerary && recommendation.itinerary && (
        <PlannerItinerary itinerary={recommendation.itinerary} />
      )}

      <button
        type="button"
        className="planner-recommendation-action"
        onClick={() => onSelect?.(recommendation)}
        disabled={!onSelect}
      >
        {onSelect ? actionLabel : 'Sign in to continue'}
        <ArrowRight size={15} aria-hidden="true" />
      </button>
    </article>
  )
}

function formatPrice(amount: number, currency: 'PHP' = 'PHP') {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDateRange(start: string, end: string) {
  return `${formatDate(start)} – ${formatDate(end)}`
}

function formatDate(value: string) {
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

function formatCheckedAt(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
