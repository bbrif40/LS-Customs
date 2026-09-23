/**
 * BookingCalendar — Interactive schedule and historical calendar for customer bookings.
 * Visualizes scheduled/active, previous, and completed/done bookings and vehicle rentals.
 * Features month navigation, day inspection, category filtering, and direct receipt modal integration.
 */
import { useState, useMemo } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  CarFront,
  Wrench,
  CheckCircle2,
  Clock,
  MapPin,
  ExternalLink,
  Ban,
  CalendarCheck,
} from 'lucide-react'
import type { CustomerVehicleBooking, CustomerServiceBooking } from '../../hooks/useCustomerBookings'

export interface BookingCalendarProps {
  vehicleBookings: CustomerVehicleBooking[]
  serviceBookings: CustomerServiceBooking[]
  bookingType: 'all' | 'rentals' | 'services'
  onSelectBooking: (details: {
    kind: 'rental' | 'service'
    booking: any
    onViewMap?: () => void
  }) => void
  onView?: (view: any) => void
}

interface CalendarEvent {
  id: string
  kind: 'rental' | 'service'
  title: string
  subtitle?: string
  status: string
  isCompleted: boolean
  isScheduled: boolean
  isCancelled: boolean
  timeLabel: string
  price: number
  location?: string
  raw: CustomerVehicleBooking | CustomerServiceBooking
  isPickupDay?: boolean
  isReturnDay?: boolean
}

function formatDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function BookingCalendar({
  vehicleBookings,
  serviceBookings,
  bookingType,
  onSelectBooking,
  onView,
}: BookingCalendarProps) {
  const today = useMemo(() => new Date(), [])
  const todayKey = useMemo(() => formatDateKey(today), [today])

  // Current viewed month and year
  const [currentDate, setCurrentDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDateKey, setSelectedDateKey] = useState<string>(todayKey)

  // Map all bookings to date-keyed events
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()

    const addEvent = (key: string, ev: CalendarEvent) => {
      const list = map.get(key) ?? []
      list.push(ev)
      map.set(key, list)
    }

    const activeStatuses = ['pending', 'confirmed', 'assigned', 'en_route', 'in_progress']

    // 1. Process Vehicle Rentals
    if (bookingType !== 'services') {
      for (const vb of vehicleBookings) {
        if (!vb.start_date || !vb.end_date) continue
        const start = parseLocalDate(vb.start_date)
        const end = parseLocalDate(vb.end_date)
        const isCompleted = vb.status === 'completed'
        const isCancelled = vb.status === 'cancelled'
        const isScheduled = activeStatuses.includes(vb.status)

        // Iterate through each day of the rental period
        const cur = new Date(start)
        while (cur <= end) {
          const key = formatDateKey(cur)
          const isPickup = key === vb.start_date
          const isReturn = key === vb.end_date

          addEvent(key, {
            id: `v-${vb.id}-${key}`,
            kind: 'rental',
            title: vb.vehicles?.name ?? 'Vehicle Rental',
            subtitle: isPickup ? 'Pickup Day' : isReturn ? 'Return Day' : 'Active Rental Period',
            status: vb.status,
            isCompleted,
            isScheduled,
            isCancelled,
            timeLabel: `${vb.start_date} → ${vb.end_date}`,
            price: Number(vb.total_price),
            location: vb.pickup_location ?? 'Pickup location confirmed in booking',
            raw: vb,
            isPickupDay: isPickup,
            isReturnDay: isReturn,
          })

          cur.setDate(cur.getDate() + 1)
        }
      }
    }

    // 2. Process Mechanical Services
    if (bookingType !== 'rentals') {
      for (const sb of serviceBookings) {
        if (!sb.scheduled_at) continue
        const d = new Date(sb.scheduled_at)
        const key = formatDateKey(d)
        const isCompleted = sb.status === 'completed'
        const isCancelled = sb.status === 'cancelled'
        const isScheduled = activeStatuses.includes(sb.status)

        const serviceTitle =
          sb.service_booking_items?.map((item) => item.mechanic_services?.name).filter(Boolean).join(', ') ||
          'Mobile Mechanic Service'

        const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

        addEvent(key, {
          id: `s-${sb.id}`,
          kind: 'service',
          title: serviceTitle,
          subtitle: `Scheduled for ${timeStr}`,
          status: sb.status,
          isCompleted,
          isScheduled,
          isCancelled,
          timeLabel: `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${timeStr}`,
          price: Number(sb.total_price),
          location: 'Location saved on file',
          raw: sb,
        })
      }
    }

    return map
  }, [vehicleBookings, serviceBookings, bookingType])

  // Calendar matrix calculations
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const startDayOfWeek = firstDayOfMonth.getDay() // 0 = Sun, 1 = Mon ...
  const daysInMonth = lastDayOfMonth.getDate()

  // Days from previous month to fill the first row
  const prevMonthLastDay = new Date(year, month, 0).getDate()
  const prevMonthDays: { day: number; key: string; isCurrentMonth: boolean }[] = []
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = prevMonthLastDay - i
    const key = formatDateKey(new Date(year, month - 1, d))
    prevMonthDays.push({ day: d, key, isCurrentMonth: false })
  }

  // Days of current month
  const currentMonthDays: { day: number; key: string; isCurrentMonth: boolean }[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const key = formatDateKey(new Date(year, month, d))
    currentMonthDays.push({ day: d, key, isCurrentMonth: true })
  }

  // Days of next month to fill remaining slots (up to multiple of 7)
  const totalSlotsSoFar = prevMonthDays.length + currentMonthDays.length
  const nextMonthDaysCount = totalSlotsSoFar % 7 === 0 ? 0 : 7 - (totalSlotsSoFar % 7)
  const nextMonthDays: { day: number; key: string; isCurrentMonth: boolean }[] = []
  for (let d = 1; d <= nextMonthDaysCount; d++) {
    const key = formatDateKey(new Date(year, month + 1, d))
    nextMonthDays.push({ day: d, key, isCurrentMonth: false })
  }

  const allCalendarDays = [...prevMonthDays, ...currentMonthDays, ...nextMonthDays]

  // Month navigation handlers
  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  const handleGoToday = () => {
    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelectedDateKey(todayKey)
  }

  // Bookings on the selected day
  const selectedDayEvents = eventsByDate.get(selectedDateKey) ?? []

  // Formatted label for selected date header
  const selectedDateFormatted = useMemo(() => {
    if (!selectedDateKey) return ''
    const [y, m, d] = selectedDateKey.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    return dt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }, [selectedDateKey])

  // Count total scheduled and completed in the active month
  const monthStats = useMemo(() => {
    let scheduled = 0
    let completed = 0
    currentMonthDays.forEach(({ key }) => {
      const list = eventsByDate.get(key) ?? []
      list.forEach((ev) => {
        if (ev.isScheduled) scheduled++
        if (ev.isCompleted) completed++
      })
    })
    return { scheduled, completed }
  }, [currentMonthDays, eventsByDate])

  return (
    <div className="booking-calendar-wrapper" style={{ marginTop: 12 }}>
      {/* ── Calendar Controls & Header ────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          padding: '16px 20px',
          background: 'var(--card-bg, #ffffff)',
          border: '1px solid var(--line, #e2e8f0)',
          borderRadius: '16px 16px 0 0',
          borderBottom: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              background: '#e1eee4',
              color: '#35684f',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <CalendarIcon size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--ink, #1a202c)' }}>
              {MONTH_NAMES[month]} {year}
            </h2>
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--muted, #64748b)', marginTop: 2 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ae7c30' }} />
                {monthStats.scheduled} Scheduled / Active
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3e7958' }} />
                {monthStats.completed} Completed / Done
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="outline-button"
            onClick={handleGoToday}
            style={{ fontSize: 11, padding: '6px 14px', borderRadius: 20 }}
          >
            Today
          </button>
          <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: 3, borderRadius: 20 }}>
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Previous month"
              style={{
                background: 'transparent',
                border: 'none',
                padding: '6px 10px',
                borderRadius: 16,
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--ink, #1a202c)',
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Next month"
              style={{
                background: 'transparent',
                border: 'none',
                padding: '6px 10px',
                borderRadius: 16,
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--ink, #1a202c)',
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Layout: Calendar Grid + Day Details Inspector ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.8fr) minmax(320px, 1.1fr)',
          gap: 0,
          background: 'var(--card-bg, #ffffff)',
          border: '1px solid var(--line, #e2e8f0)',
          borderRadius: '0 0 16px 16px',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)',
        }}
      >
        {/* Left Pane: Monthly Calendar Grid */}
        <div style={{ padding: '16px 20px 20px', borderRight: '1px solid var(--line, #e2e8f0)' }}>
          {/* Weekday Header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              textAlign: 'center',
              marginBottom: 8,
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--muted, #64748b)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {WEEKDAY_NAMES.map((w) => (
              <div key={w} style={{ padding: '8px 0' }}>
                {w}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 4,
            }}
          >
            {allCalendarDays.map(({ day, key, isCurrentMonth }) => {
              const dayEvents = eventsByDate.get(key) ?? []
              const isToday = key === todayKey
              const isSelected = key === selectedDateKey

              // Quick category flags
              const hasRental = dayEvents.some((e) => e.kind === 'rental')
              const hasService = dayEvents.some((e) => e.kind === 'service')
              const hasCompleted = dayEvents.some((e) => e.isCompleted)
              const hasScheduled = dayEvents.some((e) => e.isScheduled)

              return (
                <div
                  key={key}
                  onClick={() => setSelectedDateKey(key)}
                  style={{
                    minHeight: 82,
                    padding: '6px 8px',
                    borderRadius: 10,
                    background: isSelected
                      ? '#f0f7f3'
                      : isToday
                      ? '#fafcfb'
                      : isCurrentMonth
                      ? '#ffffff'
                      : '#f8fafc',
                    border: isSelected
                      ? '2px solid #35684f'
                      : isToday
                      ? '1.5px dashed #4d8b67'
                      : '1px solid #f1f5f9',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    opacity: isCurrentMonth ? 1 : 0.45,
                    position: 'relative',
                  }}
                  title={dayEvents.length > 0 ? `${dayEvents.length} booking(s)` : undefined}
                >
                  {/* Day Number Header */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: isToday || isSelected ? 800 : 600,
                        color: isSelected
                          ? '#203c3a'
                          : isToday
                          ? '#35684f'
                          : 'var(--ink, #1e293b)',
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        display: 'grid',
                        placeItems: 'center',
                        background: isToday ? '#e1eee4' : 'transparent',
                      }}
                    >
                      {day}
                    </span>

                    {/* Indicator dots for day with events */}
                    {dayEvents.length > 0 && (
                      <div style={{ display: 'flex', gap: 3 }}>
                        {hasRental && (
                          <span
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: '50%',
                              background: '#ae7c30',
                            }}
                            title="Vehicle Rental"
                          />
                        )}
                        {hasService && (
                          <span
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: '50%',
                              background: '#3e7958',
                            }}
                            title="Mechanical Service"
                          />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Event Badges list inside cell */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                    {dayEvents.slice(0, 2).map((ev) => (
                      <div
                        key={ev.id}
                        style={{
                          fontSize: 9,
                          fontWeight: 600,
                          padding: '2px 5px',
                          borderRadius: 4,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3,
                          background: ev.isCompleted
                            ? '#edf7f0'
                            : ev.isCancelled
                            ? '#fef2f2'
                            : ev.kind === 'rental'
                            ? '#fef8ee'
                            : '#f0f9ff',
                          color: ev.isCompleted
                            ? '#2b6b47'
                            : ev.isCancelled
                            ? '#b91c1c'
                            : ev.kind === 'rental'
                            ? '#926017'
                            : '#0369a1',
                          border: ev.isCompleted
                            ? '1px solid #d1ebd8'
                            : ev.isCancelled
                            ? '1px solid #fecaca'
                            : ev.kind === 'rental'
                            ? '1px solid #fae8c8'
                            : '1px solid #e0f2fe',
                        }}
                      >
                        {ev.isCompleted ? (
                          <CheckCircle2 size={9} style={{ flexShrink: 0 }} />
                        ) : ev.kind === 'rental' ? (
                          <CarFront size={9} style={{ flexShrink: 0 }} />
                        ) : (
                          <Wrench size={9} style={{ flexShrink: 0 }} />
                        )}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {ev.title}
                        </span>
                      </div>
                    ))}

                    {dayEvents.length > 2 && (
                      <span
                        style={{
                          fontSize: 8,
                          color: '#64748b',
                          fontWeight: 700,
                          paddingLeft: 2,
                        }}
                      >
                        +{dayEvents.length - 2} more
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 16,
              marginTop: 18,
              paddingTop: 14,
              borderTop: '1px solid #f1f5f9',
              fontSize: 11,
              color: 'var(--muted, #64748b)',
            }}
          >
            <span style={{ fontWeight: 700, color: 'var(--ink, #1a202c)' }}>Legend:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: '#fae8c8', border: '1px solid #ae7c30' }} />
              <span>Rental Booking</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: '#e0f2fe', border: '1px solid #0369a1' }} />
              <span>Mechanical Service</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: '#edf7f0', border: '1px solid #2b6b47' }} />
              <span>Completed / Done</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: '#fef2f2', border: '1px solid #b91c1c' }} />
              <span>Cancelled</span>
            </div>
          </div>
        </div>

        {/* Right Pane: Day Details Inspector */}
        <div style={{ padding: '20px 22px', background: '#fafcfb', display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--line, #e2e8f0)' }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#35684f',
              }}
            >
              Selected Date
            </span>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: '4px 0 2px', color: 'var(--ink, #1a202c)' }}>
              {selectedDateFormatted}
            </h3>
            <span style={{ fontSize: 12, color: 'var(--muted, #64748b)' }}>
              {selectedDayEvents.length === 0
                ? 'No appointments or rentals on this day'
                : `${selectedDayEvents.length} booking${selectedDayEvents.length > 1 ? 's' : ''} found`}
            </span>
          </div>

          {/* List of events on this day */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflowY: 'auto' }}>
            {selectedDayEvents.length === 0 ? (
              <div
                style={{
                  padding: '36px 16px',
                  textAlign: 'center',
                  background: '#ffffff',
                  border: '1px dashed #cbd5e1',
                  borderRadius: 12,
                  marginTop: 10,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: '#f1f5f9',
                    color: '#94a3b8',
                    display: 'grid',
                    placeItems: 'center',
                    margin: '0 auto 10px',
                  }}
                >
                  <CalendarCheck size={20} />
                </div>
                <strong style={{ display: 'block', fontSize: 13, color: 'var(--ink, #1a202c)', marginBottom: 4 }}>
                  Day is Free
                </strong>
                <p style={{ fontSize: 11, color: 'var(--muted, #64748b)', margin: 0 }}>
                  There are no scheduled, active, or previous bookings for this date.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                  <button
                    type="button"
                    className="outline-button"
                    onClick={() => onView?.('rentals')}
                    style={{ fontSize: 11, padding: '6px 12px' }}
                  >
                    Rent a car
                  </button>
                  <button
                    type="button"
                    className="outline-button"
                    onClick={() => onView?.('services')}
                    style={{ fontSize: 11, padding: '6px 12px' }}
                  >
                    Book service
                  </button>
                </div>
              </div>
            ) : (
              selectedDayEvents.map((ev) => (
                <div
                  key={ev.id}
                  onClick={() => {
                    if (ev.kind === 'rental') {
                      onSelectBooking({ kind: 'rental', booking: ev.raw as CustomerVehicleBooking })
                    } else {
                      onSelectBooking({
                        kind: 'service',
                        booking: ev.raw as CustomerServiceBooking,
                      })
                    }
                  }}
                  style={{
                    background: '#ffffff',
                    border: '1px solid var(--line, #e2e8f0)',
                    borderRadius: 12,
                    padding: '14px 16px',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#35684f'
                    e.currentTarget.style.transform = 'translateY(-1px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--line, #e2e8f0)'
                    e.currentTarget.style.transform = 'none'
                  }}
                >
                  {/* Card Header: Type Badge & Status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: ev.kind === 'rental' ? '#926017' : '#0369a1',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      {ev.kind === 'rental' ? <CarFront size={13} /> : <Wrench size={13} />}
                      {ev.kind === 'rental' ? 'Vehicle Rental' : 'Mobile Service'}
                    </span>
                    <span
                      className={`status-pill ${
                        ev.isCompleted ? 'green' : ev.isCancelled ? 'red' : 'amber'
                      }`}
                    >
                      {ev.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>

                  {/* Title */}
                  <h4 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px', color: 'var(--ink, #1a202c)' }}>
                    {ev.title}
                  </h4>
                  {ev.subtitle && (
                    <p style={{ fontSize: 11, color: '#35684f', fontWeight: 600, margin: '0 0 8px' }}>
                      {ev.subtitle}
                    </p>
                  )}

                  {/* Time / Location */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--muted, #64748b)', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Clock size={12} />
                      <span>{ev.timeLabel}</span>
                    </div>
                    {ev.location && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <MapPin size={12} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ev.location}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Footer: Price + View Receipt Button */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingTop: 8,
                      borderTop: '1px solid #f1f5f9',
                    }}
                  >
                    <strong style={{ fontSize: 14, color: 'var(--ink, #1a202c)' }}>
                      ₱{ev.price.toLocaleString()}
                    </strong>
                    <span
                      style={{
                        fontSize: 11,
                        color: '#35684f',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                    >
                      View receipt <ExternalLink size={11} />
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
