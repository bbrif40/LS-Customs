import { useWebsiteText } from "../../../hooks/useWebsiteText"
import { serviceCategoryLabel } from '../../../utils/serviceCategory'
/**
 * ServiceOptionCard — selectable card for a single mechanic service.
 * Wraps the existing `.service-row` visual with a button affordance so
 * the user can pick a service with one tap.
 */
import { Clock3, Wrench } from 'lucide-react'
import type { Service } from '../../../types'

interface ServiceOptionCardProps {
  service: Service
  selected: boolean
  onSelect: (service: Service) => void
}

export function ServiceOptionCard({ service, selected, onSelect }: ServiceOptionCardProps) {
  const websiteText = useWebsiteText("Mechanic")

  return (
    <button
      type="button"
      className={`service-row service-option ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(service)}
      aria-pressed={selected}
    >
      <div className="service-row-icon"><Wrench size={22} /></div>
      <div className="service-row-copy">
        <span className="eyebrow">{websiteText(serviceCategoryLabel(service.category))}</span>
        <h3>{service.name}</h3>
        <p>{service.description || websiteText("Professional service performed at your location, with transparent pricing.")}</p>
        <small>
          <Clock3 size={13} />{' '}{websiteText("Est.")} {service.duration}
        </small>
      </div>
      <div className="service-row-price">
        <strong>{service.price}</strong>
        <small className="distance-fee-hint">{websiteText("+ ₱85/5km travel fee")}</small>
        <span className="select-indicator">{selected ? websiteText("Selected") : websiteText("Choose")}</span>
      </div>
    </button>
  )
}
