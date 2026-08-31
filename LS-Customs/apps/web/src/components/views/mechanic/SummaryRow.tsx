/**
 * SummaryRow — small label/value row used in StepReview and StepConfirmed.
 * The `action` slot typically holds an "Edit" link that jumps back to a step.
 */
import type { ReactNode } from 'react'

interface SummaryRowProps {
  label: string
  value: ReactNode
  action?: ReactNode
}

export function SummaryRow({ label, value, action }: SummaryRowProps) {
  return (
    <div className="summary-row">
      <span className="summary-label">{label}</span>
      <span className="summary-value">{value}</span>
      {action && <span className="summary-action">{action}</span>}
    </div>
  )
}
