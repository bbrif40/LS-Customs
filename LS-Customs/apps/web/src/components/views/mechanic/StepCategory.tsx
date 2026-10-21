import { useWebsiteText } from "../../../hooks/useWebsiteText"
import { serviceCategoryLabel } from '../../../utils/serviceCategory'
/**
 * StepCategory — pick a service category. The available categories are
 * derived from the services list so the UI matches whatever the data
 * source provided (DB or static).
 */
import { useMemo } from 'react'
import type { Service } from '../../../types'

interface StepCategoryProps {
  services: Service[]
  loading: boolean
  source: 'supabase' | 'static'
  selected: string | null
  onSelect: (category: string) => void
}

const ICON_BY_KEYWORD: Array<{ keywords: string[]; icon: string }> = [
  { keywords: ['routine', 'fluid', 'oil'], icon: '◒' },
  { keywords: ['tire', 'wheel', 'suspension', 'brake'], icon: '◉' },
  { keywords: ['electrical', 'battery', 'alternator'], icon: '⚡' },
  { keywords: ['diagnostic', 'engine'], icon: '⌁' },
  { keywords: ['light', 'headlight', 'visibility'], icon: '✧' },
  { keywords: ['quick', 'wiper', 'fix'], icon: '⌒' },
]

const IMAGE_BY_CATEGORY: Array<{ keywords: string[]; image: string }> = [
  { keywords: ['routine', 'fluid', 'oil'], image: '/customer-services/fluidchange.png' },
  { keywords: ['tire', 'wheel', 'suspension', 'brake'], image: '/customer-services/tires.png' },
  { keywords: ['electrical', 'battery', 'alternator'], image: '/customer-services/batterycare.png' },
  { keywords: ['diagnostic', 'engine'], image: '/customer-services/diagnosticfix.png' },
  { keywords: ['light', 'headlight', 'visibility'], image: '/customer-services/lightingfix.png' },
  { keywords: ['quick', 'wiper', 'fix'], image: '/customer-services/quickfixes.png' },
]

function iconFor(category: string): string {
  const lower = category.toLowerCase()
  const match = ICON_BY_KEYWORD.find((entry) =>
    entry.keywords.some((kw) => lower.includes(kw)),
  )
  return match?.icon ?? '✳'
}

function imageFor(category: string): string | undefined {
  const lower = category.toLowerCase()
  return IMAGE_BY_CATEGORY.find((entry) => entry.keywords.some((keyword) => lower.includes(keyword)))?.image
}

const CATEGORY_ORDER: string[] = [
  'routine_fluid_service',
  'tire_wheel_care',
  'electrical_battery_care',
  'diagnostic_repair',
  'lighting_visibility',
  'quick_fixes',
]

export function StepCategory({ services, loading, source, selected, onSelect }: StepCategoryProps) {
  const websiteText = useWebsiteText("Mechanic")

  const categories = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of services) {
      map.set(s.category, (map.get(s.category) ?? 0) + 1)
    }
    const items = Array.from(map.entries()).map(([raw, count]) => ({
      raw,
      label: serviceCategoryLabel(raw),
      count,
      icon: iconFor(raw),
      image: imageFor(raw),
    }))

    return items.sort((a, b) => {
      const idxA = CATEGORY_ORDER.indexOf(a.raw)
      const idxB = CATEGORY_ORDER.indexOf(b.raw)
      if (idxA !== -1 && idxB !== -1) return idxA - idxB
      if (idxA !== -1) return -1
      if (idxB !== -1) return 1
      return a.label.localeCompare(b.label)
    })
  }, [services])

  return (
    <section className="step-panel">
      <header className="step-panel-head">
        <p className="eyebrow">{websiteText("STEP 1 OF 6")}</p>
        <h2>{websiteText("What kind of service do you need?")}</h2>
        <p className="muted">{websiteText("Pick a category to see available services.")}</p>
        {source === 'static' && !loading && (
          <p className="form-helper">{websiteText("Showing the demo catalog. Connect Supabase to load live services.")}</p>
        )}
      </header>

      {loading ? (
        <p className="muted" style={{ padding: '24px 0' }}>{websiteText("Loading services…")}</p>
      ) : categories.length === 0 ? (
        <p className="muted" style={{ padding: '24px 0' }}>{websiteText("No services available right now.")}</p>
      ) : (
        <div className="category-grid">
          {categories.map((cat) => (
            <button
              key={cat.raw}
              type="button"
              className={`category-tile ${selected === cat.raw ? 'selected' : ''}`}
              onClick={() => onSelect(cat.raw)}
            >
              {cat.image ? (
                <img className="category-image" src={cat.image} alt="" />
              ) : (
                <div className="category-icon">{cat.icon}</div>
              )}
              <strong>{websiteText(cat.label)}</strong>
              <small>
                {cat.count} {cat.count === 1 ? websiteText("service") : websiteText("services")}
              </small>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
