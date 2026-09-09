/**
 * VehicleCard — compact vehicle listing with image, tag, and booking action.
 */
import { ArrowUpRight, Heart, Star, Lock } from 'lucide-react'
import type { Vehicle } from '../../types'

interface VehicleCardProps {
  vehicle: Vehicle
  onBook: () => void
  onView?: () => void
  isFavorite?: boolean
  onToggleFavorite?: () => void
  /** When true, the vehicle has an active booking overlapping the
   *  selected dates — the card shows a small "unavailable" hint and
   *  disables the book button instead of letting the user hit the
   *  `no_overlapping_bookings` exclusion constraint at INSERT time. */
  unavailable?: boolean
}

export function VehicleCard({ vehicle, onBook, onView, unavailable, isFavorite = false, onToggleFavorite }: VehicleCardProps) {
  return (
    <article
      className={`vehicle-card ${unavailable ? 'is-unavailable' : ''} ${onView ? 'is-viewable' : ''}`}
      onClick={onView}
      onKeyDown={(event) => { if (onView && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onView() } }}
      tabIndex={onView ? 0 : undefined}
      role={onView ? 'button' : undefined}
    >
      <div className="vehicle-image">
        <img src={vehicle.image} alt={vehicle.name} />
        <span className="vehicle-tag">{vehicle.tag}</span>
        <button
          className={`heart-button ${isFavorite ? 'is-favorite' : ''}`}
          aria-label={`${isFavorite ? 'Remove' : 'Save'} ${vehicle.name} ${isFavorite ? 'from favorites' : 'to favorites'}`}
          aria-pressed={isFavorite}
          onClick={(event) => { event.stopPropagation(); onToggleFavorite?.() }}
        >
          <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
        {unavailable && (
          <span className="vehicle-unavailable-badge" aria-label="Unavailable for selected dates">
            <Lock size={12} /> Booked for these dates
          </span>
        )}
      </div>
      <div className="vehicle-info">
        <div className="vehicle-title">
          <h3>{vehicle.name}</h3>
          <span className="vehicle-rating"><Star size={13} fill="currentColor" /> {vehicle.rating}</span>
        </div>
        <p>{vehicle.detail}</p>
        <div className="vehicle-divider" />
        <div className="vehicle-footer">
          <strong className="vehicle-price">{vehicle.price}<small>/ day</small></strong>
          {unavailable ? (
            <button className="small-button" type="button" disabled aria-disabled="true">
              Unavailable
            </button>
          ) : (
            <button className="small-button" onClick={(event) => { event.stopPropagation(); onBook() }}>Book now <ArrowUpRight size={14} /></button>
          )}
        </div>
      </div>
    </article>
  )
}
