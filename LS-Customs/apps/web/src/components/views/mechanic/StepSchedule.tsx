/**
 * StepSchedule — pick a date and a time slot. Surfaces the service
 * duration so the user can plan accordingly. Next is disabled until
 * both date and time are set.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react'
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

function isSlotDisabled(slot: string, selectedDate: string | null): boolean {
  if (selectedDate === null) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const selected = new Date(selectedDate + 'T00:00:00')
  // If selected date is today, disable slots before the current time
  if (selected.getTime() === today.getTime()) {
    const now = new Date()
    const [slotHour, slotMinute] = slot.split(':').map(Number)
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const slotMinutes = slotHour * 60 + slotMinute
    return slotMinutes < currentMinutes
  }
  // Future dates: all slots available
  return false
}

type TimeFormat = '12h' | '24h'
const TIME_FORMAT_STORAGE_KEY = 'ls-customs-time-format'

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

function fullDateLabel(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function formatTime(slot: string, format: TimeFormat): string {
  if (format === '24h') return slot
  const [hour, minute] = slot.split(':').map(Number)
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 || 12
  return `${displayHour}:${pad(minute)} ${suffix}`
}

function getInitialTimeFormat(): TimeFormat {
  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem(TIME_FORMAT_STORAGE_KEY)
    if (saved === '12h' || saved === '24h') return saved
  }
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 ? '12h' : '24h'
}

export function StepSchedule({ service, date, time, onChange, onBack, onNext }: StepScheduleProps) {
  const [carouselDirection, setCarouselDirection] = useState<'next' | 'previous'>('next')
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(getInitialTimeFormat)
  const dates = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Array.from({ length: 13 }, (_, i) => {
      const d = new Date(today)
      const offset = i - 3
      d.setDate(today.getDate() + offset)
      return {
        iso: toDateString(d),
        ...shortLabel(d),
        isToday: offset === 0,
        isAvailable: offset >= 0 && offset < 7,
      }
    })
  }, [])

  const canProceed = date !== null && time !== null
  const firstAvailableIndex = dates.findIndex((item) => item.isAvailable)
  const lastAvailableIndex = dates.reduce((lastIndex, item, index) => item.isAvailable ? index : lastIndex, -1)
  const activeDateIndex = date
    ? Math.max(firstAvailableIndex, dates.findIndex((item) => item.iso === date))
    : firstAvailableIndex
  const selectedDate = date ? fullDateLabel(date) : 'Select a date'
  const selectedAppointment = date && time ? `${selectedDate} at ${formatTime(time, timeFormat)}` : 'Choose your appointment time'

  useEffect(() => {
    window.localStorage.setItem(TIME_FORMAT_STORAGE_KEY, timeFormat)
  }, [timeFormat])

  function selectDate(nextDate: string, nextIndex: number) {
    if (!dates[nextIndex].isAvailable) return
    setCarouselDirection(nextIndex >= activeDateIndex ? 'next' : 'previous')
    onChange(nextDate, time)
  }

  function moveDate(direction: 'next' | 'previous') {
    const nextIndex = activeDateIndex + (direction === 'next' ? 1 : -1)
    if (nextIndex < firstAvailableIndex || nextIndex > lastAvailableIndex) return
    setCarouselDirection(direction)
    onChange(dates[nextIndex].iso, time)
  }

  return (
    <section className="step-panel">
      <header className="step-panel-head">
        <button type="button" className="text-button step-back" onClick={onBack}>
          <ChevronLeft size={15} /> Back
        </button>
        <p className="eyebrow">STEP 3 OF 5</p>
        <h2>Pick a date & time</h2>
        <p className="muted schedule-intro">
          {service ? `${service.name} · Est. ${service.duration}` : 'Choose a service first.'}
        </p>
      </header>

      <div className="schedule-picker">
        <div className="schedule-selection-bar" role="status">
          <CalendarDays size={16} aria-hidden="true" />
          <span>{selectedAppointment}</span>
          {date && time && <Check size={16} aria-label="Appointment selected" />}
        </div>

        <div className="schedule-picker-body">
          <div className="schedule-block schedule-date-panel">
            <div className="schedule-section-heading">
              <div>
                <p className="eyebrow">DATE</p>
                <h3>{dates[0].date.split(' ')[0]} {dates[0].iso.slice(0, 4)}</h3>
              </div>
              <span className="schedule-month-note">Next 7 days</span>
            </div>
            <div className={`date-carousel is-${carouselDirection}`}>
              <button
                type="button"
                className="date-carousel-button date-carousel-previous"
                onClick={() => moveDate('previous')}
                disabled={activeDateIndex === firstAvailableIndex}
                aria-label="Show previous date"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="schedule-row" role="radiogroup" aria-label="Date" style={{ '--active-date-index': activeDateIndex } as CSSProperties}>
                {dates.map((d, index) => (
                  <button
                    key={d.iso}
                    type="button"
                    className={`date-tile ${date === d.iso ? 'selected' : ''}`}
                    onClick={() => selectDate(d.iso, index)}
                    disabled={!d.isAvailable}
                    role="radio"
                    aria-checked={date === d.iso}
                    aria-label={d.isToday ? `${fullDateLabel(d.iso)}, today` : fullDateLabel(d.iso)}
                  >
                    <small>{d.day}</small>
                    <strong>{d.date}</strong>
                    {d.isToday && <span className="date-tile-tag">Today</span>}
                    {date === d.iso && <Check className="date-tile-check" size={14} aria-hidden="true" />}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="date-carousel-button date-carousel-next"
                onClick={() => moveDate('next')}
                disabled={activeDateIndex === lastAvailableIndex}
                aria-label="Show next date"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="schedule-block schedule-time-panel">
            <div className="schedule-section-heading">
              <div>
                <p className="eyebrow">TIME</p>
                <h3>{time ? formatTime(time, timeFormat) : 'Choose a time'}</h3>
              </div>
              <div className="time-format-control" role="group" aria-label="Time format">
                <button
                  type="button"
                  className={timeFormat === '12h' ? 'active' : ''}
                  onClick={() => setTimeFormat('12h')}
                  aria-pressed={timeFormat === '12h'}
                >
                  AM/PM
                </button>
                <button
                  type="button"
                  className={timeFormat === '24h' ? 'active' : ''}
                  onClick={() => setTimeFormat('24h')}
                  aria-pressed={timeFormat === '24h'}
                >
                  24-hour
                </button>
              </div>
            </div>
            <div className="time-grid" role="radiogroup" aria-label="Time">
              {TIME_SLOTS.map((slot) => {
                const disabled = isSlotDisabled(slot, date)
                return (
                  <button
                    key={slot}
                    type="button"
                    className={`time-tile ${time === slot ? 'selected' : ''}`}
                    onClick={() => !disabled && onChange(date, slot)}
                    disabled={disabled}
                    role="radio"
                    aria-checked={time === slot}
                    aria-label={`${formatTime(slot, timeFormat)} ${Number(slot.slice(0, 2)) < 12 ? 'morning' : 'afternoon'}`}
                  >
                    <span>{formatTime(slot, timeFormat)}</span>
                    {time === slot && <Check size={14} aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
            {service?.durationMinutes && (
              <p className="form-helper">
                <Clock3 size={12} /> Service takes about {service.durationMinutes} minutes
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="step-actions">
        <button type="button" className="button dark-button" disabled={!canProceed} onClick={onNext}>
          Continue
        </button>
      </div>
    </section>
  )
}
