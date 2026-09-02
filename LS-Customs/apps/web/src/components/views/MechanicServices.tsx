/**
 * MechanicServices — guest-facing service catalog with category tabs and
 * emergency dispatch card. The catalog and the "available mechanic" tile
 * both come from Supabase.
 */
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Package, Clock3, Wrench, Plus } from 'lucide-react'
import { useServices } from '../../hooks/useServices'
import { supabase } from '../../supabaseClient'
import { PageHeading } from '../common/PageHeading'

interface MechanicServicesProps {
  cartCount: number
  onAdd: (name: string) => void
  onNotify: (message: string) => void
}

interface FeaturedMechanic {
  id: string
  fullName: string
  initials: string
  rating: number
  yearsExperience: number | null
}

function prettyLabel(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'MC'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function MechanicServices({ cartCount, onAdd, onNotify }: MechanicServicesProps) {
  const { services, loading, source } = useServices()
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [mechanic, setMechanic] = useState<FeaturedMechanic | null>(null)

  // Live featured mechanic: the highest-rated available mechanic from
  // mechanic_profiles, joined to profiles for the display name. Used in
  // the "Emergency mechanic" card. Single round trip, no fallback to
  // fake data — if the table is empty, hide the avatar block.
  useEffect(() => {
    let mounted = true
    supabase
      .from('mechanic_profiles')
      .select('id, years_experience, rating_avg, is_available, profiles(full_name)')
      .eq('is_available', true)
      .order('rating_avg', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!mounted || !data) return
        const row = data as { id: string; years_experience: number | null; rating_avg: number | null; profiles: { full_name: string | null } | { full_name: string | null }[] | null }
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
        const name = profile?.full_name?.trim() || 'LS Customs Mechanic'
        setMechanic({
          id: row.id,
          fullName: name,
          initials: initialsOf(name),
          rating: Number(row.rating_avg ?? 0),
          yearsExperience: row.years_experience,
        })
      })
    return () => {
      mounted = false
    }
  }, [])

  const categories = useMemo(() => {
    const seen = new Set<string>()
    for (const s of services) seen.add(s.category)
    return Array.from(seen)
  }, [services])

  const filtered = useMemo(() => {
    if (activeCategory === 'all') return services
    return services.filter((s) => s.category === activeCategory)
  }, [services, activeCategory])

  return (
    <div className="page">
      <PageHeading
        eyebrow="MOBILE MECHANIC"
        title="Care that comes to you"
        detail="Select the required services. A certified mobile mechanic will be dispatched to your location."
        action={
          <button
            className="cart-button"
            onClick={() => onNotify(`${cartCount} service${cartCount > 1 ? 's' : ''} in your cart`)}
          >
            <Package size={17} /> Service cart <b>{cartCount}</b>
          </button>
        }
      />
      <div className="service-layout">
        <div className="service-list">
          <div className="category-tabs">
            <button
              className={activeCategory === 'all' ? 'active' : ''}
              onClick={() => setActiveCategory('all')}
            >
              All services
            </button>
            {categories.map((raw) => (
              <button
                key={raw}
                className={activeCategory === raw ? 'active' : ''}
                onClick={() => setActiveCategory(raw)}
              >
                {prettyLabel(raw)}
              </button>
            ))}
          </div>
          {loading ? (
            <p className="muted" style={{ padding: '24px 0' }}>Loading services…</p>
          ) : source === 'static' ? (
            <p className="form-helper">Showing the demo catalog. Connect Supabase to load live services.</p>
          ) : null}
          {!loading && filtered.length === 0 && (
            <p className="muted" style={{ padding: '24px 0' }}>No services in this category yet.</p>
          )}
          {filtered.map((service) => (
            <article className="service-row" key={service.id}>
              <div className="service-row-icon">{service.icon}</div>
              <div className="service-row-copy">
                <span className="eyebrow">{prettyLabel(service.category)}</span>
                <h3>{service.name}</h3>
                <p>Professional service performed at your location, with transparent pricing.</p>
                <small>
                  <Clock3 size={13} /> Est. {service.duration}
                </small>
              </div>
              <div className="service-row-price">
                <strong>{service.price}</strong>
                <button className="small-button" onClick={() => onAdd(service.name)}>
                  Add <Plus size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
        <aside className="dispatch-card">
          <div className="dispatch-icon">
            <Wrench size={20} />
          </div>
          <p className="eyebrow">NEED HELP NOW?</p>
          <h3>Emergency mechanic</h3>
          {mechanic ? (
            <>
              <p>
                {mechanic.fullName.split(' ')[0]} {mechanic.fullName.split(' ').slice(-1)[0]?.[0] || ''}. is available and
                ready for dispatch in your area.
              </p>
              <div className="mechanic-mini">
                <div className="avatar mechanic-avatar">{mechanic.initials}</div>
                <div>
                  <strong>{mechanic.fullName}</strong>
                  <span>
                    {mechanic.yearsExperience != null
                      ? `${mechanic.yearsExperience}+ yrs experience · `
                      : ''}
                    {mechanic.rating > 0 ? `${mechanic.rating.toFixed(1)} ★` : 'New on the platform'}
                  </span>
                </div>
                <span className="online-dot" />
              </div>
            </>
          ) : (
            <p className="muted">No mechanics are currently available. Try booking a scheduled visit below.</p>
          )}
          <button
            className="button dark-button full"
            onClick={() => onNotify('Emergency mechanic request started')}
          >
            Request dispatch <ChevronRight size={16} />
          </button>
        </aside>
      </div>
    </div>
  )
}
