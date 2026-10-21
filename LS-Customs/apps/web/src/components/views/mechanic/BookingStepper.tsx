import { useWebsiteText } from "../../../hooks/useWebsiteText"
import { Check } from 'lucide-react'
import { STEP_ORDER, STEP_LABEL, type Step } from './steps'

export function BookingStepper({ current, onJump }: { current: Step; onJump: (target: Step) => void }) {
  const websiteText = useWebsiteText("Mechanic")

  const index = STEP_ORDER.indexOf(current)
  return <nav className="mechanic-progress" aria-label={websiteText("Booking progress")}>
    <ol className="mechanic-progress-track">{STEP_ORDER.map((step, i) => <li key={step} className={i < index ? 'is-complete' : i === index ? 'is-current' : ''}>
      <button type="button" disabled={i > index} aria-current={step === current ? 'step' : undefined}
        aria-label={`${websiteText(STEP_LABEL[step])}${i < index ? `, ${websiteText("completed")}` : i === index ? `, ${websiteText("current step")}` : `, ${websiteText("upcoming")}`}`}
        onClick={() => onJump(step)}><span className="mechanic-progress-number">{i < index ? <Check size={15} strokeWidth={2.2} /> : i + 1}</span><span className="mechanic-progress-label">{websiteText(STEP_LABEL[step])}</span></button>
    </li>)}</ol>
  </nav>
}
