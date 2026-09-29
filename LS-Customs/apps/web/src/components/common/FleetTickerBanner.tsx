/**
 * FleetTickerBanner — continuous infinite moving carousel banner
 * showcasing all vehicles in the LS Customs fleet.
 * Seamless CSS animation with NO pause button, continuously moving.
 */
import { useMemo } from 'react'
import type { Vehicle } from '../../types'

interface FleetTickerBannerProps {
  vehicles: Vehicle[]
  onSelectVehicle?: (vehicle: Vehicle) => void
}

const FALLBACK_FLEET: { name: string; tag: string; price: string }[] = [
  { name: 'BYD Atto 3 EV', tag: 'Electric Crossover', price: '₱2,800/day' },
  { name: 'Nissan Kicks 1.2 e-POWER', tag: 'Hybrid Crossover', price: '₱3,200/day' },
  { name: 'Toyota Yaris Cross 1.5 S HEV', tag: 'Subcompact Hybrid', price: '₱3,500/day' },
  { name: 'Hyundai Ioniq 5', tag: 'Electric SUV', price: '₱5,500/day' },
  { name: 'Mitsubishi Xpander Cross', tag: '7-Seater MPV', price: '₱3,400/day' },
  { name: 'Toyota Fortuner 2.8 GR-S', tag: 'Midsize SUV', price: '₱4,500/day' },
  { name: 'Ford Ranger Raptor 2.0L', tag: 'Performance Truck', price: '₱4,800/day' },
  { name: 'Toyota HiAce Super Grandia', tag: 'Luxury Van', price: '₱5,200/day' },
  { name: 'Honda Civic RS Turbo', tag: 'Sedan', price: '₱3,600/day' },
  { name: 'Mazda 3 Fastback', tag: 'Hatchback', price: '₱3,100/day' },
]

export function FleetTickerBanner({ vehicles, onSelectVehicle }: FleetTickerBannerProps) {
  // Use loaded vehicles if available, otherwise fallback
  const items = useMemo(() => {
    if (vehicles && vehicles.length > 0) {
      return vehicles.map((v) => ({
        id: v.id,
        name: v.name.toUpperCase(),
        tag: (v.tag || v.category || '').toUpperCase().replace('_', ' '),
        price: (v.price.includes('/day') ? v.price : `${v.price}/day`).toUpperCase(),
        rawVehicle: v,
      }))
    }
    return FALLBACK_FLEET.map((f, i) => ({
      id: `fallback-${i}`,
      name: f.name.toUpperCase(),
      tag: f.tag.toUpperCase(),
      price: f.price.toUpperCase(),
      rawVehicle: null,
    }))
  }, [vehicles])

  // Duplicate items twice to ensure completely seamless infinite scrolling
  const duplicatedItems = useMemo(() => [...items, ...items], [items])

  return (
    <div
      className="fleet-ticker-banner"
      role="region"
      aria-label="Active Fleet Collection Live Ticker"
    >
      <div className="fleet-ticker-track" aria-hidden="false">
        {duplicatedItems.map((item, index) => (
          <span key={`${item.id}-${index}`} className="fleet-ticker-segment">
            <button
              type="button"
              className="fleet-ticker-item"
              onClick={() => {
                if (item.rawVehicle && onSelectVehicle) {
                  onSelectVehicle(item.rawVehicle)
                }
              }}
              title={item.rawVehicle ? `View ${item.name}` : undefined}
            >
              <span className="ticker-car-name">{item.name}</span>
              <span className="ticker-car-dot" aria-hidden="true">•</span>
              <span className="ticker-car-tag">{item.tag}</span>
              <span className="ticker-car-dot" aria-hidden="true">•</span>
              <span className="ticker-car-price">{item.price}</span>
            </button>
            <span className="fleet-ticker-sep" aria-hidden="true">•</span>
          </span>
        ))}
      </div>
    </div>
  )
}
