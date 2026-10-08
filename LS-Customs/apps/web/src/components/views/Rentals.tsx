import { VehicleImage } from '../common/VehicleImage'
/**
 * Rentals — fleet collection page with filters and search.
 * Pulls the active fleet from Supabase via useCustomerVehicles.
 */
import { useState, useMemo, useEffect, useRef, lazy } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, Search, CalendarDays, Fuel, MapPin, Settings2, SlidersHorizontal, Star, Users, X } from 'lucide-react'
import { VehicleCardSkeleton } from '../common/Skeleton'
import { supabase } from '../../supabaseClient'
import { useCustomerVehicles } from '../../hooks/useCustomerVehicles'
import { useVehicleAvailability } from '../../hooks/useVehicleAvailability'
import { useScrollAnimation } from '../../hooks/useScrollAnimation'
import { useFavoriteVehicles } from '../../hooks/useFavoriteVehicles'
import { VehicleCard } from '../common/VehicleCard'
import { PageHeading } from '../common/PageHeading'
import { FleetTickerBanner } from '../common/FleetTickerBanner'
const RentalPayment = lazy(() => import('./RentalPayment').then(module => ({ default: module.RentalPayment })))
import { addCalendarDays, bookingToday } from '../../utils/bookingDates'
import { getActivePromo, calculatePromoDiscount } from '../../utils/promoHelper'

interface RentalsProps {
  userId?: string
  onNotify: (message: string) => void
  initialStartDate?: string
  initialEndDate?: string
}

type CategoryFilter =
  | 'all'
  | 'hybrid_ev'
  | 'hatchbacks'
  | 'sedans'
  | 'minivans'
  | 'suvs'
  | 'van'
  | 'pickup_trucks'

const CATEGORY_TABS: { id: CategoryFilter; label: string }[] = [
  { id: 'all', label: 'All vehicles' },
  { id: 'hybrid_ev', label: 'Hybrid EV' },
  { id: 'hatchbacks', label: 'Hatchbacks' },
  { id: 'sedans', label: 'Sedans' },
  { id: 'minivans', label: 'Minivans' },
  { id: 'suvs', label: 'SUVs' },
  { id: 'van', label: 'Van' },
  { id: 'pickup_trucks', label: 'Pick Up Trucks' },
]

export function Rentals({ userId, onNotify, initialStartDate, initialEndDate }: RentalsProps) {
  const { vehicles, loading, error, refetch } = useCustomerVehicles()
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [startDate, setStartDate] = useState(initialStartDate || '')
  const [endDate, setEndDate] = useState(() => {
    if (initialEndDate) return initialEndDate
    if (initialStartDate) {
      return addCalendarDays(initialStartDate, 1)
    }
    return ''
  })

  const maxEndDate = useMemo(() => {
    if (!startDate) return ''
    return addCalendarDays(startDate, 30)
  }, [startDate])

  useEffect(() => {
    if (initialStartDate) {
      setStartDate(initialStartDate)
      const d = new Date(initialStartDate + 'T00:00:00')
      d.setDate(d.getDate() + 1)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      setEndDate(initialEndDate || `${y}-${m}-${day}`)
    }
  }, [initialStartDate, initialEndDate])
  const [selectedVehicle, setSelectedVehicle] = useState<typeof vehicles[number] | null>(null)
  const [previewVehicle, setPreviewVehicle] = useState<typeof vehicles[number] | null>(null)
  const [bookingTotal, setBookingTotal] = useState<number | null>(null)
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null)
  const [creatingBooking, setCreatingBooking] = useState(false)
  const bookingAttempt = useRef<{ key: string; id: string } | null>(null)
  const bookingInFlight = useRef(false)
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [bookingError, setBookingError] = useState<string | null>(null)
  // Mark vehicles as unavailable when they have an active booking
  // overlapping the selected date range. The RPC keeps this fresh
  // whenever the dates change, so the cards update as the user
  // shifts their trip.
  const { unavailableIds } = useVehicleAvailability(startDate, endDate)
  const { isFavorite, toggleFavorite } = useFavoriteVehicles()
  // Re-validate against the latest availability whenever the user
  // changes the dates. If they had a vehicle selected and that
  // vehicle is now blocked, drop the selection.
  useEffect(() => {
    if (!bookingId && selectedVehicle && unavailableIds.has(selectedVehicle.id)) {
      setSelectedVehicle(null)
    }
  }, [unavailableIds, selectedVehicle, bookingId])

  const scrollRef = useScrollAnimation<HTMLDivElement>()
  const isPageVisible = scrollRef.className.includes('visible')

  useEffect(() => {
    if (!previewVehicle) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [previewVehicle])

  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  const filteredVehicles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return vehicles.filter((v) => {
      if (activeCategory !== 'all') {
        const cat = (v.category || '').toLowerCase()
        const tag = (v.tag || '').toLowerCase()
        const target = activeCategory.toLowerCase()
        const targetSpaced = target.replace('_', ' ')
        const norm = (s: string) => s.replace(/[\s_-]+/g, '')
        const matchesCategory =
          cat === target ||
          cat === targetSpaced ||
          norm(cat) === norm(target)
        const matchesTag =
          tag.includes(target) ||
          tag.includes(targetSpaced) ||
          norm(tag).includes(norm(target))
        if (!matchesCategory && !matchesTag) return false
      }
      if (q) {
        const hay = `${v.name} ${v.detail} ${v.tag} ${v.category} ${v.location}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [vehicles, activeCategory, searchQuery])

  const totalPages = Math.max(1, Math.ceil(filteredVehicles.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedVehicles = filteredVehicles.slice((safePage - 1) * pageSize, safePage * pageSize)

  const activePromo = getActivePromo()

  if (selectedVehicle && bookingId) {
    const days = Math.max(1, Math.ceil((new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) / 86400000))
    const baseTotal = days * selectedVehicle.pricePerDay
    const { discountAmount, finalTotal } = calculatePromoDiscount(baseTotal, activePromo, 'rentals')

    return (
      <RentalPayment
        vehicle={selectedVehicle}
        bookingId={bookingId}
        holdExpiresAt={holdExpiresAt}
        startDate={startDate}
        endDate={endDate}
        total={bookingTotal ?? finalTotal}
        originalTotal={baseTotal}
        discountAmount={baseTotal - (bookingTotal ?? finalTotal)}
        promo={discountAmount > 0 ? activePromo : null}
        userId={userId}
        onBack={() => { setBookingId(null); setSelectedVehicle(null) }}
        onNotify={onNotify}
      />
    )
  }

  const chooseVehicle = async (vehicle: typeof vehicles[number]) => {
    if (bookingInFlight.current) return
    if (!startDate || !endDate || endDate <= startDate) {
      setBookingError('Select a valid pickup and return date first.')
      document.querySelector('.rental-planner')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    const days = Math.max(1, Math.ceil((new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) / 86400000))
    if (days > 30) {
      setBookingError('You can only rent a vehicle for a maximum of 30 days.')
      document.querySelector('.rental-planner')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setBookingError(null)
    if (unavailableIds.has(vehicle.id)) {
      setBookingError(`${vehicle.name} is already booked for those dates. Try a different vehicle or shift your dates.`)
      document.querySelector('.rental-planner')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (!userId) { onNotify('Please sign in before booking a rental.'); return }

    const attemptKey = [vehicle.id, startDate, endDate, activePromo?.code ?? ''].join(':')
    if (bookingAttempt.current?.key !== attemptKey) bookingAttempt.current = { key: attemptKey, id: crypto.randomUUID() }
    bookingInFlight.current = true
    setCreatingBooking(true)
    const { data, error: insertError } = await supabase.rpc('create_vehicle_booking', {
      p_request_id: bookingAttempt.current.id, p_vehicle_id: vehicle.id,
      p_start: startDate, p_end: endDate, p_promo_code: activePromo?.code ?? null,
    })
    bookingInFlight.current = false
    setCreatingBooking(false)
    if (insertError || !data) {
      const msg = insertError?.message ?? 'Booking could not be created.'
      if (msg.toLowerCase().includes('no_overlapping_bookings') || msg.toLowerCase().includes('conflicting key')) {
        setBookingError(`${vehicle.name} is already booked for those dates. Try a different vehicle or shift your dates.`)
      } else {
        setBookingError(msg)
      }
      return
    }
    bookingAttempt.current = null
    setBookingTotal(Number(data.total_price))
    setHoldExpiresAt(data.hold_expires_at)
    setSelectedVehicle(vehicle); setBookingId(data.id); onNotify('Rental booking created')
  }

  return (
    <div className={`page ${scrollRef.className}`} ref={scrollRef.ref}>
      <PageHeading
        eyebrow="FLEET COLLECTION"
        title="Find your next drive"
        detail="Choose from a curated fleet, ready when you are."
      />

      <FleetTickerBanner vehicles={vehicles} />

      <section className="rental-planner" aria-label="Rental dates">
        <div className="rental-planner-heading">
          <div className="planner-icon"><CalendarDays size={20} /></div>
          <div><strong>Plan your trip</strong><span>Select your dates to see the right daily rate.</span></div>
        </div>
        <div className="date-picker-group">
          <label><span>Pickup</span><input aria-label="Pickup date" type="date" min={bookingToday()} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
          <span className="date-arrow">to</span>
          <label><span>Return</span><input aria-label="Return date" type="date" min={startDate || bookingToday()} max={maxEndDate || undefined} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
        </div>
        {bookingError ? (
          <span className="planner-status error" style={{ color: '#b91c1c', fontWeight: 600, background: '#fef2f2', padding: '6px 12px', borderRadius: 6, border: '1px solid #fecaca', fontSize: 12 }}>
            {bookingError}
          </span>
        ) : (
          <span className={`planner-status ${startDate && endDate && endDate > startDate ? 'ready' : ''}`}>
            {startDate && endDate && endDate > startDate ? 'Dates selected' : 'Dates required to book'}
          </span>
        )}
      </section>

      <div className="rental-toolbar">
        <div className="rental-toolbar-label"><SlidersHorizontal size={15} /><strong>Browse fleet</strong></div>
        <div className="filter-row">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`filter ${activeCategory === tab.id ? 'active' : ''}`}
              onClick={() => {
                setActiveCategory(tab.id)
                setCurrentPage(1)
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={17} />
          <input
            placeholder="Search vehicles..."
            aria-label="Search vehicles"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value)
              setCurrentPage(1)
            }}
          />
        </label>
      </div>

      {loading ? (
        <div className="rentals-grid" aria-hidden="true" style={{ marginTop: 24 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <VehicleCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '64px 0',
            color: '#b91c1c',
            gap: 12,
          }}
        >
            <p>Failed to load vehicles: {error}</p>
          <button className="button dark-button" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : filteredVehicles.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '64px 0',
            color: 'var(--muted, #6b7280)',
          }}
        >
          {vehicles.length === 0
            ? 'No vehicles are available right now. Check back soon.'
            : 'No vehicles match your filters.'}
        </div>
      ) : (
        <>
          <div className={`vehicle-grid rentals-grid stagger-children ${isPageVisible ? 'visible' : ''}`}>
            {paginatedVehicles.map((vehicle) => (
              <VehicleCard
                key={vehicle.name}
                vehicle={vehicle}
                unavailable={unavailableIds.has(vehicle.id)}
                isFavorite={isFavorite(vehicle.id)}
                onToggleFavorite={() => toggleFavorite(vehicle.id)}
                onView={() => setPreviewVehicle(vehicle)}
                onBook={() => void chooseVehicle(vehicle)}
              />
            ))}
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, padding: '14px 20px', background: 'var(--surface, #ffffff)', borderRadius: 12, border: '1px solid var(--border, #e5e7eb)' }}>
              <span style={{ fontSize: 13, color: 'var(--muted, #6b7280)' }}>
                Showing {((safePage - 1) * pageSize) + 1}–{Math.min(safePage * pageSize, filteredVehicles.length)} of {filteredVehicles.length} vehicles
              </span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="button"
                  style={{
                    padding: '6px 14px',
                    fontSize: 13,
                    opacity: safePage === 1 ? 0.5 : 1,
                    cursor: safePage === 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  Previous
                </button>
                <span style={{ fontSize: 13, color: 'var(--foreground, #374151)', padding: '0 8px', fontWeight: 500 }}>
                  Page {safePage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="button"
                  style={{
                    padding: '6px 14px',
                    fontSize: 13,
                    opacity: safePage === totalPages ? 0.5 : 1,
                    cursor: safePage === totalPages ? 'not-allowed' : 'pointer',
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {previewVehicle && createPortal(
        <div className="vehicle-preview-backdrop" onClick={() => setPreviewVehicle(null)}>
          <div className="vehicle-preview-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <p className="eyebrow">{previewVehicle.tag}</p>
                <h2>{previewVehicle.name}</h2>
              </div>
              <button type="button" onClick={() => setPreviewVehicle(null)} aria-label="Close vehicle details"><X size={20} /></button>
            </header>
            <div className="vehicle-preview-content">
              <VehicleImage src={previewVehicle.galleryImages?.[0] || previewVehicle.image} name={previewVehicle.name} />
              <div className="vehicle-preview-copy">
                <div className="vehicle-preview-rating"><Star size={15} fill="currentColor" /> {previewVehicle.rating} rating</div>
                <p>{previewVehicle.description || previewVehicle.detail}</p>
                <div className="vehicle-preview-specs">
                  <span><Users size={15} /> {previewVehicle.detail.match(/\d+ seats/)?.[0] || 'Seats available'}</span>
                  <span><Settings2 size={15} /> {previewVehicle.detail.includes('Manual') ? 'Manual' : 'Automatic'}</span>
                  <span><Fuel size={15} /> {previewVehicle.detail.includes('Electric') ? 'Electric' : 'Gasoline'}</span>
                  <span><MapPin size={15} /> {previewVehicle.location || 'Los Santos'}</span>
                </div>
                <strong className="vehicle-preview-price">{previewVehicle.price}<small>/ day</small></strong>
                <button type="button" className="button dark-button" onClick={() => { setPreviewVehicle(null); document.querySelector('.rental-planner')?.scrollIntoView({ behavior: 'smooth' }) }}>
                  Choose dates to book <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
