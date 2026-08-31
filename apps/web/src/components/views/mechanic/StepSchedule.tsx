/**
 * StepSchedule — pick a date and a time slot. Surfaces the service
 * duration so the user can plan accordingly. Next is disabled until
 * both date and time are set.
 */
import { useMemo } from 'react'
import { ChevronLeft, Clock3 } from 'lucide-react'
import type { Service } from '../../../types'

interface StepScheduleProps {
  service: Service | null
  date: string | null
  time: string | null
  onChange: (date: string | null, time: string | null) => void
  onBack: () => void
  onNext: () => void
}

const TIME_SLOTS = [
  '08:00', '08:30',
  '09:00', '09:30',
  '10:00', '10:30',
  '11:00', '11:30',
  '13:00', '13:30',
  '14:00', '14:30',
  '15:00', '15:30',
  '16:00', '16:30',
]

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function shortLabel(d: Date): { day: string; date: string } {
  return {
    day: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }
}

export function StepSchedule({ service, date, time, onChange, onBack, onNext }: StepScheduleProps) {
  const dates = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      return {
        iso: toDateString(d),
        ...shortLabel(d),
        isToday: i === 0,
      }
    })
  }, [])

  const canProceed = date !== null && time !== null

  return (
    <section className="step-panel">
      <header className="step-panel-head">
        <button type="button" className="text-button step-back" onClick={onBack}>
          <ChevronLeft size={15} /> Back
        </button>
        <p className="eyebrow">STEP 3 OF 5</p>
        <h2>Pick a date & time</h2>
        <p className="muted">
          {service ? `${service.name} · Est. ${service.duration}` : 'Choose a service first.'}
        </p>
      </header>

      <div className="schedule-block">
        <p className="eyebrow">DATE</p>
        <div className="schedule-row" role="radiogroup" aria-label="Date">
          {dates.map((d) => (
            <button
              key={d.iso}
              type="button"
              className={`date-tile ${date === d.iso ? 'selected' : ''}`}
              onClick={() => onChange(d.iso, time)}
              role="radio"
              aria-checked={date === d.iso}
            >
              <small>{d.day}</small>
              <strong>{d.date}</strong>
              {d.isToday && <span className="date-tile-tag">Today</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="schedule-block">
        <p className="eyebrow">TIME</p>
        <div className="time-grid" role="radiogroup" aria-label="Time">
          {TIME_SLOTS.map((slot) => (
            <button
              key={slot}
              type="button"
              className={`time-tile ${time === slot ? 'selected' : ''}`}
              onClick={() => onChange(date, slot)}
              role="radio"
              aria-checked={time === slot}
            >
              {slot}
            </button>
          ))}
        </div>
        {service?.durationMinutes && (
          <p className="form-helper">
            <Clock3 size={12} /> Service takes about {service.durationMinutes} minutes
          </p>
        )}
      </div>

      <div className="step-actions">
        <button type="button" className="button dark-button" disabled={!canProceed} onClick={onNext}>
          Continue
        </button>
      </div>
    </section>
  )
}
