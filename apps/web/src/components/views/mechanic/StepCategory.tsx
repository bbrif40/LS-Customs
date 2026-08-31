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

function iconFor(category: string): string {
  const lower = category.toLowerCase()
  const match = ICON_BY_KEYWORD.find((entry) =>
    entry.keywords.some((kw) => lower.includes(kw)),
  )
  return match?.icon ?? '✳'
}

function prettyLabel(raw: string): string {
  // snake_case → Title Case
  return raw
    .replace(/_/g, ' ')
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

export function StepCategory({ services, loading, source, selected, onSelect }: StepCategoryProps) {
  const categories = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of services) {
      map.set(s.category, (map.get(s.category) ?? 0) + 1)
    }
    return Array.from(map.entries()).map(([raw, count]) => ({
      raw,
      label: prettyLabel(raw),
      count,
      icon: iconFor(raw),
    }))
  }, [services])

  return (
    <section className="step-panel">
      <header className="step-panel-head">
        <p className="eyebrow">STEP 1 OF 5</p>
        <h2>What kind of service do you need?</h2>
        <p className="muted">Pick a category to see available services.</p>
        {source === 'static' && !loading && (
          <p className="form-helper">
            Showing the demo catalog. Connect Supabase to load live services.
          </p>
        )}
      </header>

      {loading ? (
        <p className="muted" style={{ padding: '24px 0' }}>Loading services…</p>
      ) : categories.length === 0 ? (
        <p className="muted" style={{ padding: '24px 0' }}>No services available right now.</p>
      ) : (
        <div className="category-grid">
          {categories.map((cat) => (
            <button
              key={cat.raw}
              type="button"
              className={`category-tile ${selected === cat.raw ? 'selected' : ''}`}
              onClick={() => onSelect(cat.raw)}
            >
              <div className="category-icon">{cat.icon}</div>
              <strong>{cat.label}</strong>
              <small>
                {cat.count} {cat.count === 1 ? 'service' : 'services'}
              </small>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
