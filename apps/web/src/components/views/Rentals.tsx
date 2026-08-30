/**
 * Rentals — fleet collection page with filters and search.
 * Pulls the active fleet from Supabase via useCustomerVehicles.
 */
import { useState, useMemo } from 'react'
import { ChevronRight, Search, Loader2 } from 'lucide-react'
import { useCustomerVehicles } from '../../hooks/useCustomerVehicles'
import { VehicleCard } from '../common/VehicleCard'
import { PageHeading } from '../common/PageHeading'

interface RentalsProps {
  onNotify: (message: string) => void
}

type CategoryFilter = 'all' | 'short_term' | 'extended' | 'premium'

const CATEGORY_TABS: { id: CategoryFilter; label: string }[] = [
  { id: 'all', label: 'All vehicles' },
  { id: 'short_term', label: 'Short-term' },
  { id: 'extended', label: 'Extended' },
  { id: 'premium', label: 'Luxury' },
]

export function Rentals({ onNotify }: RentalsProps) {
  const { vehicles, loading, error, refetch } = useCustomerVehicles()
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')

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
          <button className="button dark-button" onClick={() => onNotify('Rental dates updated')}>
            Select dates <ChevronRight size={16} />
          </button>
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
              onBook={() => onNotify(`${vehicle.name} selected for booking`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
