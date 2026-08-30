/**
 * VehicleCard — compact vehicle listing with image, tag, and booking action.
 */
import { Star } from 'lucide-react'
import type { Vehicle } from '../../types'

interface VehicleCardProps {
  vehicle: Vehicle
  onBook: () => void
}

export function VehicleCard({ vehicle, onBook }: VehicleCardProps) {
  return (
    <article className="vehicle-card">
      <div className="vehicle-image">
        <img src={vehicle.image} alt={vehicle.name} />
        <span>{vehicle.tag}</span>
        <button className="heart-button" aria-label={`Save ${vehicle.name}`}>♡</button>
      </div>
      <div className="vehicle-info">
        <div className="vehicle-title">
          <h3>{vehicle.name}</h3>
          <span><Star size={13} fill="currentColor" /> {vehicle.rating}</span>
        </div>
        <p>{vehicle.detail}</p>
        <div className="vehicle-footer">
          <strong>{vehicle.price}<small>/ day</small></strong>
          <button className="small-button" onClick={onBook}>Book</button>
        </div>
      </div>
    </article>
  )
}
