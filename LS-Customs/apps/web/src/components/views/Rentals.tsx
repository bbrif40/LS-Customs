/**
 * Rentals — fleet collection page with filters and search.
 * Pulls the active fleet from Supabase via useCustomerVehicles.
 */
import { useState, useMemo } from 'react'
import { ChevronRight, Search, Loader2, CalendarDays } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { useCustomerVehicles } from '../../hooks/useCustomerVehicles'
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
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [bookingError, setBookingError] = useState<string | null>(null)

  if (selectedVehicle && bookingId) {
    const days = Math.max(1, Math.ceil((new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) / 86400000))
    return <RentalPayment vehicle={selectedVehicle} bookingId={bookingId} startDate={startDate} endDate={endDate} total={days * selectedVehicle.pricePerDay} onBack={() => { setBookingId(null); setSelectedVehicle(null) }} onNotify={onNotify} />
  }

  const chooseVehicle = async (vehicle: typeof vehicles[number]) => {
    if (!startDate || !endDate || endDate <= startDate) { setBookingError('Select a valid pickup and return date first.'); return }
    setBookingError(null)
    const days = Math.max(1, Math.ceil((new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) / 86400000))
    if (!userId) { onNotify('Please sign in before booking a rental.'); return }
    const { data, error: insertError } = await supabase.from('vehicle_bookings').insert({ vehicle_id: vehicle.id, customer_id: userId, start_date: startDate, end_date: endDate, total_price: days * vehicle.pricePerDay, status: 'pending' }).select('id').single()
    if (insertError || !data) { setBookingError(insertError?.message ?? 'Booking could not be created.'); return }
    setSelectedVehicle(vehicle); setBookingId(data.id); onNotify('Rental booking created')
  }

  // Note: the UI Vehicle type doesn't carry the raw `category` field, so we
  // re-derive a simple tag-based filter from the visible `tag` text. This
  // works because the admin form uppercases sub_category into the tag, and
  // for sub-category-less vehicles the category itself is uppercased.
  const filteredVehicles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return vehicles.filter((v) => {
      if (activeCategory !== 'all') {
        // Best-effort match: tag should include the category or its alias.
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

  return (
    <div className="page">
      <PageHeading
        eyebrow="FLEET COLLECTION"
        title="Find your next drive"
        detail="Choose from a curated fleet, ready when you are."
        action={
          <span className="date-picker-group"><CalendarDays size={16} /><input aria-label="Pickup date" type="date" min={new Date().toISOString().slice(0, 10)} value={startDate} onChange={(e) => setStartDate(e.target.value)} /><span>to</span><input aria-label="Return date" type="date" min={startDate || new Date().toISOString().slice(0, 10)} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></span>
        }
      />

      <div className="filter-row">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`filter ${activeCategory === tab.id ? 'active' : ''}`}
            onClick={() => setActiveCategory(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        <label className="search-field">
          <Search size={17} />
          <input
            placeholder="Search vehicles..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
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
        <div className="vehicle-grid rentals-grid">
          {filteredVehicles.map((vehicle) => (
            <VehicleCard
              key={vehicle.name}
              vehicle={vehicle}
              onBook={() => void chooseVehicle(vehicle)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
