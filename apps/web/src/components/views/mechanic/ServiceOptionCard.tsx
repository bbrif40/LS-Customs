/**
 * ServiceOptionCard — selectable card for a single mechanic service.
 * Wraps the existing `.service-row` visual with a button affordance so
 * the user can pick a service with one tap.
 */
import { Clock3 } from 'lucide-react'
import type { Service } from '../../../types'

interface ServiceOptionCardProps {
  service: Service
  selected: boolean
  onSelect: (service: Service) => void
}

export function ServiceOptionCard({ service, selected, onSelect }: ServiceOptionCardProps) {
  return (
    <button
      type="button"
      className={`service-row service-option ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(service)}
    >
      <div className="service-row-icon">{service.icon}</div>
      <div className="service-row-copy">
        <span className="eyebrow">{service.category}</span>
        <h3>{service.name}</h3>
        <p>Professional service performed at your location, with transparent pricing.</p>
        <small>
          <Clock3 size={13} /> Est. {service.duration}
        </small>
      </div>
      <div className="service-row-price">
        <strong>{service.price}</strong>
        <span className="select-indicator">{selected ? 'Selected' : 'Choose'}</span>
      </div>
    </button>
  )
}
