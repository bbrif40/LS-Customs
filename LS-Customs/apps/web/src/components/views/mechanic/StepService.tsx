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

const CATEGORY_NAMES: Record<string, string> = {
  routine_fluid_service: 'Routine Fluid Service',
  tire_wheel_care: 'Tire & Wheel Care',
  electrical_battery_care: 'Electrical & Battery Care',
  diagnostic_repair: 'Diagnostic Repair',
  lighting_visibility: 'Lighting Visibility',
  quick_fixes: 'Quick Fixes',
}

function prettyLabel(raw: string): string {
  if (CATEGORY_NAMES[raw]) return CATEGORY_NAMES[raw]
  return raw
    .replace(/_/g, ' ')
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

export function StepService({ services, loading, category, selected, onSelect, onBack }: StepServiceProps) {
  const filtered = category ? services.filter((s) => s.category === category) : []

  return (
    <section className="step-panel">
      <header className="step-panel-head">
        <button type="button" className="text-button step-back" onClick={onBack}>
          <ChevronLeft size={15} /> Back
        </button>
        <p className="eyebrow">STEP 2 OF 5</p>
        <h2>Choose a service</h2>
        <p className="muted">
          {category ? `Available in ${prettyLabel(category)}.` : 'Pick a category first.'}
        </p>
      </header>

      {loading ? (
        <p className="muted" style={{ padding: '24px 0' }}>Loading services…</p>
      ) : filtered.length === 0 ? (
        <p className="muted" style={{ padding: '24px 0' }}>No services in this category yet.</p>
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
