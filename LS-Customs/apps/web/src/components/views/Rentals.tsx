/**
 * Rentals — fleet collection page with filters and search.
 * Pulls the active fleet from Supabase via useCustomerVehicles.
 */
import { useState, useMemo, useEffect } from 'react'
import { ChevronRight, Search, Loader2, CalendarDays, Fuel, MapPin, Settings2, SlidersHorizontal, Star, Users, X } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { useCustomerVehicles } from '../../hooks/useCustomerVehicles'
import { useVehicleAvailability } from '../../hooks/useVehicleAvailability'
import { useScrollAnimation } from '../../hooks/useScrollAnimation'
import { useFavoriteVehicles } from '../../hooks/useFavoriteVehicles'
import { VehicleCard } from '../common/VehicleCard'
import { PageHeading } from '../common/PageHeading'
import { RentalPayment } from './RentalPayment'

interface RentalsProps {
  userId?: string
  onNotify: (message: string) => void
}

type CategoryFilter = 'all' | 'short_term' | 'extended' | 'premium'

const CATEGORY_TABS: { id: CategoryFilter; label: string }[] = [
  { id: 'all', label: 'All vehicles' },
  { id: 'short_term', label: 'Short-term' },
  { id: 'extended', label: 'Extended' },
  { id: 'premium', label: 'Luxury' },
]

export function Rentals({ userId, onNotify }: RentalsProps) {
  const { vehicles, loading, error, refetch } = useCustomerVehicles()
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedVehicle, setSelectedVehicle] = useState<typeof vehicles[number] | null>(null)
  const [previewVehicle, setPreviewVehicle] = useState<typeof vehicles[number] | null>(null)
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
    if (selectedVehicle && unavailableIds.has(selectedVehicle.id)) {
      setSelectedVehicle(null)
    }
  }, [unavailableIds, selectedVehicle])

  const scrollRef = useScrollAnimation<HTMLDivElement>()
  const isPageVisible = scrollRef.className.includes('visible')

  const filteredVehicles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return vehicles.filter((v) => {
      if (activeCategory !== 'all') {
        const t = v.tag.toLowerCase()
        const alias = activeCategory === 'premium' ? 'luxury' : activeCategory.replace('_', ' ')
        if (!t.includes(alias)) return false
      }
      if (q) {
        const hay = `${v.name} ${v.detail} ${v.tag}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [vehicles, activeCategory, searchQuery])

  if (selectedVehicle && bookingId) {
    const days = Math.max(1, Math.ceil((new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) / 86400000))
    return <RentalPayment vehicle={selectedVehicle} bookingId={bookingId} startDate={startDate} endDate={endDate} total={days * selectedVehicle.pricePerDay} onBack={() => { setBookingId(null); setSelectedVehicle(null) }} onNotify={onNotify} />
  }

  const chooseVehicle = async (vehicle: typeof vehicles[number]) => {
    if (!startDate || !endDate || endDate <= startDate) { setBookingError('Select a valid pickup and return date first.'); return }
    // Last-mile guard: the card might have been rendered as
    // "available" using a slightly older snapshot of the RPC result,
    // and a different customer could have taken the slot in the
    // meantime. Re-check before INSERT so we surface a friendly
    // message instead of the raw constraint text.
    setBookingError(null)
    if (unavailableIds.has(vehicle.id)) {
      setBookingError(`${vehicle.name} is already booked for those dates. Try a different vehicle or shift your dates.`)
      return
    }
    const days = Math.max(1, Math.ceil((new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) / 86400000))
    if (!userId) { onNotify('Please sign in before booking a rental.'); return }
    const { data, error: insertError } = await supabase.from('vehicle_bookings').insert({ vehicle_id: vehicle.id, customer_id: userId, start_date: startDate, end_date: endDate, total_price: days * vehicle.pricePerDay, status: 'pending' }).select('id').single()
    if (insertError || !data) {
      // Map the exclusion-constraint text to a human message; fall
      // back to the raw error for anything else.
      const msg = insertError?.message ?? 'Booking could not be created.'
      if (msg.toLowerCase().includes('no_overlapping_bookings') || msg.toLowerCase().includes('conflicting key')) {
        setBookingError(`${vehicle.name} is already booked for those dates. Try a different vehicle or shift your dates.`)
      } else {
        setBookingError(msg)
      }
      return
    }
    setSelectedVehicle(vehicle); setBookingId(data.id); onNotify('Rental booking created')
  }

  return (
    <div className={`page ${scrollRef.className}`} ref={scrollRef.ref}>
      <PageHeading
        eyebrow="FLEET COLLECTION"
        title="Find your next drive"
        detail="Choose from a curated fleet, ready when you are."
      />

      <section className="rental-planner" aria-label="Rental dates">
        <div className="rental-planner-heading">
          <div className="planner-icon"><CalendarDays size={20} /></div>
          <div><strong>Plan your trip</strong><span>Select your dates to see the right daily rate.</span></div>
        </div>
        <div className="date-picker-group">
          <label><span>Pickup</span><input aria-label="Pickup date" type="date" min={new Date().toISOString().slice(0, 10)} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
          <span className="date-arrow">to</span>
          <label><span>Return</span><input aria-label="Return date" type="date" min={startDate || new Date().toISOString().slice(0, 10)} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
        </div>
        <span className={`planner-status ${startDate && endDate && endDate > startDate ? 'ready' : ''}`}>{startDate && endDate && endDate > startDate ? 'Dates selected' : 'Dates required to book'}</span>
      </section>

      <div className="rental-toolbar">
        <div className="rental-toolbar-label"><SlidersHorizontal size={15} /><strong>Browse fleet</strong></div>
        <div className="filter-row">
          {CATEGORY_TABS.map((tab) => <button key={tab.id} className={`filter ${activeCategory === tab.id ? 'active' : ''}`} onClick={() => setActiveCategory(tab.id)}>{tab.label}</button>)}
        </div>
        <label className="search-field">
          <Search size={17} />
          <input placeholder="Search vehicles..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
        </label>
      </div>

      {bookingError && <p className="form-helper review-error">{bookingError}</p>}
      {loading ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '64px 0',
            color: 'var(--muted, #6b7280)',
            gap: 10,
          }}
        >
          <Loader2 size={20} className="spin" /> Loading fleet…
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
        <div className={`vehicle-grid rentals-grid stagger-children ${isPageVisible ? 'visible' : ''}`}>
          {filteredVehicles.map((vehicle) => (
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
      )}
      {previewVehicle && (
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
              <img src={previewVehicle.galleryImages?.[0] || previewVehicle.image} alt={previewVehicle.name} />
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
        </div>
      )}
    </div>
  )
}
