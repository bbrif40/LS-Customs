import { useWebsiteText } from "../../../hooks/useWebsiteText"
import { serviceCategoryLabel } from '../../../utils/serviceCategory'
/**
 * StepService — pick a specific service within the chosen category.
 */
import { ChevronLeft } from 'lucide-react'
import type { Service } from '../../../types'
import { ServiceOptionCard } from './ServiceOptionCard'

interface StepServiceProps {
  services: Service[]
  loading: boolean
  category: string | null
  selected: Service | null
  onSelect: (service: Service) => void
  onBack: () => void
}

export function StepService({ services, loading, category, selected, onSelect, onBack }: StepServiceProps) {
  const websiteText = useWebsiteText("Mechanic")

  const filtered = category ? services.filter((s) => s.category === category) : []

  return (
    <section className="step-panel">
      <header className="step-panel-head">
        <button type="button" className="text-button step-back" onClick={onBack}>
          <ChevronLeft size={15} />{' '}{websiteText("Back")}</button>
        <p className="eyebrow">{websiteText("STEP 2 OF 6")}</p>
        <h2>{websiteText("Choose a service")}</h2>
        <p className="muted">
          {category ? <>{websiteText("Available in")} {websiteText(serviceCategoryLabel(category))}.</> : websiteText("Pick a category first.")}
        </p>
      </header>

      {loading ? (
        <p className="muted" style={{ padding: '24px 0' }}>{websiteText("Loading services…")}</p>
      ) : filtered.length === 0 ? (
        <p className="muted" style={{ padding: '24px 0' }}>{websiteText("No services in this category yet.")}</p>
      ) : (
        <div className="service-list">
          {filtered.map((service) => (
            <ServiceOptionCard
              key={service.id ?? service.name}
              service={service}
              selected={selected?.name === service.name}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </section>
  )
}
