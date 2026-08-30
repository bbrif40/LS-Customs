/**
 * Dashboard — home view with welcome row, hero cards, featured rentals, and trending services.
 */
import { ChevronRight, Gauge, Compass } from 'lucide-react'
import { vehicles } from '../../data/vehicles'
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

export function Dashboard({ displayName, initials, onView, onNotify }: DashboardProps) {
  return (
    <div className="page dashboard-page">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">SATURDAY, 12 OCTOBER 2024</p>
          <h1>
            Good morning, {displayName} <span>✦</span>
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
      <div className="vehicle-grid">
        {vehicles.map((vehicle) => (
          <VehicleCard
            key={vehicle.name}
            vehicle={vehicle}
            onBook={() => onNotify(`${vehicle.name} selected for booking`)}
          />
        ))}
      </div>

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
