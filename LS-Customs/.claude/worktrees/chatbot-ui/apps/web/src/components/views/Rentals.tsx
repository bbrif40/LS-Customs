/**
 * Rentals — fleet collection page with filters and search.
 */
import { ChevronRight, Search } from 'lucide-react'
import { vehicles } from '../../data/vehicles'
import { VehicleCard } from '../common/VehicleCard'
import { PageHeading } from '../common/PageHeading'

interface RentalsProps {
  onNotify: (message: string) => void
}

export function Rentals({ onNotify }: RentalsProps) {
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
        <button className="filter active">All vehicles</button>
        <button className="filter">Short-term</button>
        <button className="filter">Extended</button>
        <button className="filter">Luxury</button>
        <label className="search-field">
          <Search size={17} />
          <input placeholder="Search vehicles..." />
        </label>
      </div>
      <div className="vehicle-grid rentals-grid">
        {vehicles.map((vehicle) => (
          <VehicleCard
            key={vehicle.name}
            vehicle={vehicle}
            onBook={() => onNotify(`${vehicle.name} selected for booking`)}
          />
        ))}
      </div>
    </div>
  )
}
