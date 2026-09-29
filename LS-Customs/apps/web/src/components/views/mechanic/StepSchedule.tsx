/**
 * StepSchedule — interactive calendar & time slot picker.
 * Redesigned for supreme mobile usability, intuitive calendar navigation,
 * quick date chips, and grouped time slots.
 */
import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Sparkles, Sun, Sunset } from 'lucide-react'
import type { Service } from '../../../types'

interface StepScheduleProps {
  service: Service | null
  date: string | null
  time: string | null
  onChange: (date: string | null, time: string | null) => void
  onBack: () => void
  onNext: () => void
}

const MORNING_SLOTS = [
  '08:00', '08:30',
  '09:00', '09:30',
  '10:00', '10:30',
  '11:00', '11:30',
]

const AFTERNOON_SLOTS = [
  '13:00', '13:30',
  '14:00', '14:30',
  '15:00', '15:30',
  '16:00', '16:30',
]

const ALL_SLOTS = [...MORNING_SLOTS, ...AFTERNOON_SLOTS]

function isSlotDisabled(slot: string, selectedDate: string | null): boolean {
  if (!selectedDate) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const selected = new Date(selectedDate + 'T00:00:00')
  // If selected date is today, disable slots before the current time
  if (selected.getTime() === today.getTime()) {
    const now = new Date()
    const [slotHour, slotMinute] = slot.split(':').map(Number)
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const slotMinutes = slotHour * 60 + slotMinute
    return slotMinutes <= currentMinutes
  }
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

function fullDateLabel(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
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

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function StepSchedule({ service, date, time, onChange, onBack, onNext }: StepScheduleProps) {
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(getInitialTimeFormat)

  const today = useMemo(() => {
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    return t
  }, [])
  const todayIso = useMemo(() => toDateString(today), [today])

  // Calendar view month & year
  const [viewYear, setViewYear] = useState<number>(() => {
    if (date) {
      const [y] = date.split('-').map(Number)
      if (!isNaN(y)) return y
    }
    return today.getFullYear()
  })

  const [viewMonth, setViewMonth] = useState<number>(() => {
    if (date) {
      const [, m] = date.split('-').map(Number)
      if (!isNaN(m)) return m - 1
    }
    return today.getMonth()
  })

  // Synchronize calendar view if date changes externally
  useEffect(() => {
    if (date) {
      const [y, m] = date.split('-').map(Number)
      if (!isNaN(y) && !isNaN(m)) {
        setViewYear(y)
        setViewMonth(m - 1)
      }
    }
  }, [date])

  useEffect(() => {
    window.localStorage.setItem(TIME_FORMAT_STORAGE_KEY, timeFormat)
  }, [timeFormat])

  // Month navigation boundaries (cannot go into the past, max 3 months forward)
  const canGoPrevMonth = viewYear > today.getFullYear() || (viewYear === today.getFullYear() && viewMonth > today.getMonth())
  const maxViewDate = useMemo(() => new Date(today.getFullYear(), today.getMonth() + 3, 1), [today])
  const canGoNextMonth = viewYear < maxViewDate.getFullYear() || (viewYear === maxViewDate.getFullYear() && viewMonth < maxViewDate.getMonth())

  function handlePrevMonth() {
    if (!canGoPrevMonth) return
    if (viewMonth === 0) {
      setViewYear((y) => y - 1)
      setViewMonth(11)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  function handleNextMonth() {
    if (!canGoNextMonth) return
    if (viewMonth === 11) {
      setViewYear((y) => y + 1)
      setViewMonth(0)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  // Quick pick dates: Today, Tomorrow, Upcoming Saturday
  const quickPicks = useMemo(() => {
    const list = []

    // 1. Today
    list.push({
      label: 'Today',
      sub: today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      iso: todayIso,
    })

    // 2. Tomorrow
    const tom = new Date(today)
    tom.setDate(today.getDate() + 1)
    list.push({
      label: 'Tomorrow',
      sub: tom.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      iso: toDateString(tom),
    })

    // 3. Upcoming Saturday
    const daysUntilSat = (6 - today.getDay() + 7) % 7 || 7
    const sat = new Date(today)
    sat.setDate(today.getDate() + daysUntilSat)
    list.push({
      label: 'This Saturday',
      sub: sat.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      iso: toDateString(sat),
    })

    return list
  }, [today, todayIso])

  function selectDate(targetIso: string) {
    const [y, m] = targetIso.split('-').map(Number)
    if (!isNaN(y) && !isNaN(m)) {
      setViewYear(y)
      setViewMonth(m - 1)
    }
    // If selecting a new date causes the existing time slot to be invalid (e.g. past slot today), reset time
    let nextTime = time
    if (nextTime && isSlotDisabled(nextTime, targetIso)) {
      nextTime = null
    }
    onChange(targetIso, nextTime)
  }

  // Generate calendar days for the current viewMonth
  const calendarGrid = useMemo(() => {
    const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate()
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay() // 0 = Sun ... 6 = Sat

    const days: {
      dayNumber: number
      iso: string
      isPast: boolean
      isToday: boolean
      isSelected: boolean
    }[] = []

    for (let day = 1; day <= totalDays; day++) {
      const iso = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`
      const cellDate = new Date(viewYear, viewMonth, day)
      cellDate.setHours(0, 0, 0, 0)
      const isPast = cellDate.getTime() < today.getTime()
      const isToday = iso === todayIso
      const isSelected = iso === date

      days.push({
        dayNumber: day,
        iso,
        isPast,
        isToday,
        isSelected,
      })
    }

    return {
      firstDayIndex,
      days,
    }
  }, [viewYear, viewMonth, today, todayIso, date])

  const monthLabel = useMemo(() => {
    return new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    })
  }, [viewYear, viewMonth])

  const canProceed = Boolean(date && time)

  const selectedSummary = useMemo(() => {
    if (date && time) {
      return `${fullDateLabel(date)} at ${formatTime(time, timeFormat)}`
    }
    if (date) {
      return `${fullDateLabel(date)} · Please choose an available time slot`
    }
    return 'Select a date and time slot to book your mechanic'
  }, [date, time, timeFormat])

  return (
    <section className="step-panel">
      <header className="step-panel-head">
        <button type="button" className="text-button step-back" onClick={onBack}>
          <ChevronLeft size={16} /> Back
        </button>
        <p className="eyebrow">STEP 3 OF 5</p>
        <h2>Pick a date & time</h2>
        <p className="muted schedule-intro">
          {service ? `${service.name} · Est. ${service.duration}` : 'Choose your preferred appointment schedule.'}
        </p>
      </header>

      {/* Appointment Selection Bar */}
      <div className={`schedule-selection-bar ${date && time ? 'has-selection' : ''}`} role="status">
        <CalendarDays size={18} aria-hidden="true" />
        <span className="selection-text">{selectedSummary}</span>
        {date && time && (
          <span className="selection-badge">
            <Check size={14} /> Confirmed
          </span>
        )}
      </div>

      <div className="schedule-picker">
        <div className="schedule-picker-body">
          {/* LEFT: Calendar & Quick Picks */}
          <div className="schedule-block schedule-date-panel">
            <div className="schedule-section-heading">
              <div>
                <p className="eyebrow">SELECT DATE</p>
                <h3>{date ? fullDateLabel(date) : 'Choose date'}</h3>
              </div>
            </div>

            {/* Quick date chips */}
            <div className="quick-date-row" role="group" aria-label="Quick date selection">
              {quickPicks.map((pick) => {
                const isActive = date === pick.iso
                return (
                  <button
                    key={pick.iso}
                    type="button"
                    className={`quick-date-chip ${isActive ? 'active' : ''}`}
                    onClick={() => selectDate(pick.iso)}
                  >
                    <Sparkles size={12} />
                    <span>{pick.label}</span>
                    <small style={{ opacity: 0.85 }}>({pick.sub})</small>
                  </button>
                )
              })}
            </div>

            {/* Calendar Month Header */}
            <div className="calendar-month-bar">
              <h4 className="calendar-month-title">{monthLabel}</h4>
              <div className="calendar-nav-buttons">
                <button
                  type="button"
                  className="calendar-nav-btn"
                  onClick={handlePrevMonth}
                  disabled={!canGoPrevMonth}
                  aria-label="Previous month"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  className="calendar-nav-btn"
                  onClick={handleNextMonth}
                  disabled={!canGoNextMonth}
                  aria-label="Next month"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Weekdays Row */}
            <div className="calendar-weekdays" aria-hidden="true">
              {WEEKDAYS.map((w) => (
                <div key={w} className="calendar-weekday">
                  {w}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="calendar-days-grid" role="grid" aria-label="Calendar">
              {/* Blank cells for offset */}
              {Array.from({ length: calendarGrid.firstDayIndex }).map((_, i) => (
                <div key={`blank-${i}`} className="calendar-day-cell is-empty" aria-hidden="true" />
              ))}

              {/* Day cells */}
              {calendarGrid.days.map((item) => {
                const dayLabel = `${item.dayNumber}, ${item.isToday ? 'Today' : ''}`
                return (
                  <button
                    key={item.iso}
                    type="button"
                    className={`calendar-day-cell ${item.isSelected ? 'is-selected' : ''} ${item.isToday ? 'is-today' : ''} ${item.isPast ? 'is-disabled' : ''}`}
                    disabled={item.isPast}
                    onClick={() => selectDate(item.iso)}
                    aria-label={dayLabel}
                    aria-selected={item.isSelected}
                    role="gridcell"
                  >
                    <span>{item.dayNumber}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* RIGHT: Time Slots */}
          <div className="schedule-block schedule-time-panel">
            <div className="schedule-section-heading">
              <div>
                <p className="eyebrow">SELECT TIME</p>
                <h3>{time ? formatTime(time, timeFormat) : 'Choose slot'}</h3>
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
                  24h
                </button>
              </div>
            </div>

            {/* Morning Slots */}
            <div>
              <div className="time-group-label">
                <Sun size={14} /> Morning (8:00 AM – 11:30 AM)
              </div>
              <div className="time-slots-grid" role="radiogroup" aria-label="Morning time slots">
                {MORNING_SLOTS.map((slot) => {
                  const disabled = isSlotDisabled(slot, date)
                  const isSelected = time === slot
                  return (
                    <button
                      key={slot}
                      type="button"
                      className={`time-slot-btn ${isSelected ? 'is-selected' : ''}`}
                      disabled={disabled}
                      onClick={() => onChange(date, slot)}
                      role="radio"
                      aria-checked={isSelected}
                    >
                      <span>{formatTime(slot, timeFormat)}</span>
                      {isSelected && <Check size={14} />}
                      {disabled && <span className="slot-past-tag">Past</span>}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Afternoon Slots */}
            <div>
              <div className="time-group-label">
                <Sunset size={14} /> Afternoon (1:00 PM – 4:30 PM)
              </div>
              <div className="time-slots-grid" role="radiogroup" aria-label="Afternoon time slots">
                {AFTERNOON_SLOTS.map((slot) => {
                  const disabled = isSlotDisabled(slot, date)
                  const isSelected = time === slot
                  return (
                    <button
                      key={slot}
                      type="button"
                      className={`time-slot-btn ${isSelected ? 'is-selected' : ''}`}
                      disabled={disabled}
                      onClick={() => onChange(date, slot)}
                      role="radio"
                      aria-checked={isSelected}
                    >
                      <span>{formatTime(slot, timeFormat)}</span>
                      {isSelected && <Check size={14} />}
                      {disabled && <span className="slot-past-tag">Past</span>}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Service Duration Hint */}
            {service?.durationMinutes && (
              <div className="service-duration-hint">
                <Clock3 size={15} />
                <span>Estimated service duration: ~{service.durationMinutes} minutes</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="step-actions">
        <button
          type="button"
          className="button dark-button"
          disabled={!canProceed}
          onClick={onNext}
        >
          {canProceed ? 'Continue to Location' : 'Select Date & Time to Continue'}
        </button>
      </div>
    </section>
  )
}
