/**
 * Dashboard — home view with welcome row, hero cards, featured rentals, and trending services.
 * Featured rentals come from Supabase via useCustomerVehicles (active only, top by rating).
 */
import { useEffect, useState } from 'react'
import { ChevronRight, Gauge, Compass } from 'lucide-react'
import { useCustomerVehicles } from '../../hooks/useCustomerVehicles'
import { VehicleCard } from '../common/VehicleCard'
import { ServiceMini } from '../common/ServiceMini'
import { LocationCard } from '../common/LocationCard'
import type { View } from '../../types'

interface DashboardProps {
  displayName: string
  initials: string
  onView: (view: View) => void
  onNotify: (message: string) => void
}

function getGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatDashboardDate(date: Date): string {
  // "Saturday, 12 October 2024" → "SATURDAY, 12 OCTOBER 2024"
  return date
    .toLocaleDateString('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    .toUpperCase()
}

export function Dashboard({ displayName, initials, onView, onNotify }: DashboardProps) {
  const { vehicles: featured, loading: featuredLoading } = useCustomerVehicles({
    limit: 4,
    orderByRating: true,
  })

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = () => setNow(new Date())
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])

  const greeting = getGreeting(now.getHours())
  const dateLabel = formatDashboardDate(now)

  return (
    <div className="page dashboard-page">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">{dateLabel}</p>
          <h1>
            {greeting}, {displayName} <span>✦</span>
          </h1>
          <p className="muted">Your garage is in good hands. What do you need today?</p>
        </div>
        <button className="avatar-large" onClick={() => onView('profile')}>
          {initials}
        </button>
      </section>

      <section className="hero-grid">
        <article className="hero-card">
          <div className="hero-copy">
            <p className="eyebrow light">LS CUSTOMS CONCIERGE</p>
            <h2>
              Premium vehicles.
              <br />
              <em>Precision service.</em>
            </h2>
            <p>Experience the perfect blend of high-end car rentals and on-demand, expert mobile mechanics.</p>
            <div className="hero-buttons">
              <button className="button light-button" onClick={() => onView('rentals')}>
                Rent a vehicle <ChevronRight size={16} />
              </button>
              <button className="ghost-button" onClick={() => onView('services')}>
                Book a mechanic
              </button>
            </div>
          </div>
          <div className="hero-wheel">✳</div>
        </article>
        <LocationCard onNotify={onNotify} />
      </section>

      <section className="section-heading">
        <div>
          <p className="eyebrow">CURATED FOR YOU</p>
          <h2>Featured rentals</h2>
        </div>
        <button className="text-button" onClick={() => onView('rentals')}>
          View all <ChevronRight size={15} />
        </button>
      </section>
      {featuredLoading ? (
        <p className="muted" style={{ padding: '24px 0' }}>Loading featured vehicles…</p>
      ) : featured.length === 0 ? (
        <p className="muted" style={{ padding: '24px 0' }}>No active vehicles in the fleet yet.</p>
      ) : (
        <div className="vehicle-grid">
          {featured.map((vehicle) => (
            <VehicleCard
              key={vehicle.name}
              vehicle={vehicle}
              onBook={() => onNotify(`${vehicle.name} selected for booking`)}
            />
          ))}
        </div>
      )}

      <section className="section-heading service-heading">
        <div>
          <p className="eyebrow">ON-DEMAND CARE</p>
          <h2>Trending mechanic services</h2>
        </div>
        <button className="text-button" onClick={() => onView('services')}>
          View all <ChevronRight size={15} />
        </button>
      </section>
      <div className="service-highlight-grid">
        <ServiceMini
          title="Standard maintenance"
          detail="Oil changes, filter replacements, and fluid checks. Keeping you on the road."
          price="STARTS AT $89"
          icon={<Gauge size={20} />}
        />
        <ServiceMini
          title="Tire & suspension"
          detail="Wheel alignment, tire balancing, and suspension diagnostics."
          price="STARTS AT $120"
          icon={<Compass size={20} />}
        />
      </div>
    </div>
  )
}
