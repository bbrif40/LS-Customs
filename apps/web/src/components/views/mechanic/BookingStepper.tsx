/**
 * BookingStepper — visual progress for the multi-step mechanic flow.
 * Shows 1 — 2 — 3 — 4 — 5 with current, completed, and future states.
 * Clicking a past step jumps the user back to it.
 */
import { STEP_ORDER, STEP_LABEL, type Step } from './steps'

interface BookingStepperProps {
  current: Step
  onJump: (target: Step) => void
}

export function BookingStepper({ current, onJump }: BookingStepperProps) {
  const currentIndex = STEP_ORDER.indexOf(current)

  return (
    <ol className="booking-stepper" aria-label="Booking progress">
      {STEP_ORDER.map((step, i) => {
        const isDone = i < currentIndex
        const isCurrent = i === currentIndex
        const isClickable = isDone
        return (
          <li
            key={step}
            className={
              isCurrent
                ? 'stepper-item current'
                : isDone
                  ? 'stepper-item done'
                  : 'stepper-item future'
            }
          >
            <button
              type="button"
              className="stepper-button"
              disabled={!isClickable}
              onClick={() => isClickable && onJump(step)}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span className="stepper-bubble">{i + 1}</span>
              <span className="stepper-label">{STEP_LABEL[step]}</span>
            </button>
            {i < STEP_ORDER.length - 1 && <span className="stepper-connector" aria-hidden="true" />}
          </li>
        )
      })}
    </ol>
  )
}
