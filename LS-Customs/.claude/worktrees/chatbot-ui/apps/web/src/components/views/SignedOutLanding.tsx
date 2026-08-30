/**
 * SignedOutLanding — public landing page for unauthenticated visitors.
 * Showcases fleet, mobile mechanic services, and a sign-in call-to-action.
 */
import { ChevronRight, ArrowDown, ShieldCheck, Star, CarFront, Wrench, ClipboardList } from 'lucide-react'
import { vehicles } from '../../data/vehicles'
import { services } from '../../data/services'
import { featuredServices } from '../../data/services'
import { VehicleCard } from '../common/VehicleCard'
import type { AuthMode } from '../../types'

interface SignedOutLandingProps {
  onOpenAuth: (mode?: AuthMode) => void
}

export function SignedOutLanding({ onOpenAuth }: SignedOutLandingProps) {
  return (
    <div className="signed-out-page">
      <header className="signed-out-header">
        <div className="brand-mark signed-out-brand">
          <span className="brand-spark">✳</span>
          <span>LS Customs</span>
        </div>
        <nav className="signed-out-nav" aria-label="Public navigation">
          <button onClick={() => document.getElementById('public-rentals')?.scrollIntoView({ behavior: 'smooth' })}>
            Rentals
          </button>
          <button onClick={() => document.getElementById('public-services')?.scrollIntoView({ behavior: 'smooth' })}>
            Mechanic Services
          </button>
          <button onClick={() => onOpenAuth('sign-in')}>My Bookings</button>
        </nav>
        <div className="signed-out-actions">
          <button className="public-login-button" onClick={() => onOpenAuth('sign-in')}>
            Sign in
          </button>
          <button className="public-create-button" onClick={() => onOpenAuth('create-account')}>
            Create account <ChevronRight size={15} />
          </button>
        </div>
      </header>

      <main>
        <section className="signed-out-hero">
          <div className="signed-out-copy">
            <p className="eyebrow">AUTOMOTIVE CARE, REFINED</p>
            <h1>
              Everything your vehicle needs, <em>in one place.</em>
            </h1>
            <p>
              Premium rentals when you need to move. Expert mobile mechanics when you need to stay put.
            </p>
            <div className="signed-out-cta">
              <button
                className="button light-button"
                onClick={() => document.getElementById('public-rentals')?.scrollIntoView({ behavior: 'smooth' })}
              >
                Explore the fleet <ChevronRight size={16} />
              </button>
              <button
                className="public-text-link"
                onClick={() => document.getElementById('public-services')?.scrollIntoView({ behavior: 'smooth' })}
              >
                Find a mechanic <ArrowDown size={15} />
              </button>
            </div>
            <div className="signed-out-trust">
              <span>
                <ShieldCheck size={15} /> Vetted professionals
              </span>
              <span>
                <Star size={14} fill="currentColor" /> 4.9 average rating
              </span>
            </div>
          </div>
          <div className="signed-out-image">
            <img
              src="https://images.unsplash.com/photo-1504215680853-026ed2a45def?auto=format&fit=crop&w=1400&q=85"
              alt="Audi vehicle beside the coast"
            />
            <div>
              <span>01</span>
              <strong>The LS standard</strong>
              <small>Precision in every detail.</small>
            </div>
          </div>
        </section>

        <section className="signed-out-intro">
          <p className="eyebrow">THE LS CUSTOMS DIFFERENCE</p>
          <h2>Move with confidence.</h2>
          <p>From the first search to the final mile, we make automotive care feel considered, clear, and personal.</p>
        </section>

        <section className="signed-out-catalog" id="public-rentals">
          <div className="signed-out-section-heading">
            <div>
              <p className="eyebrow">CURATED FLEET</p>
              <h2>Find your next drive</h2>
              <p>Premium vehicles, ready when you are.</p>
            </div>
          </div>
          <div className="vehicle-grid">
            {vehicles.map((vehicle) => (
              <VehicleCard key={vehicle.name} vehicle={vehicle} onBook={() => onOpenAuth('sign-in')} />
            ))}
          </div>
        </section>

        <section className="signed-out-services" id="public-services">
          <div>
            <p className="eyebrow">MOBILE MECHANIC</p>
            <h2>Care that comes to you.</h2>
            <p>No shop visit, no waiting room. Select a service and a certified mechanic comes to your location.</p>
            <button className="button dark-button" onClick={() => onOpenAuth('sign-in')}>
              Book a mechanic <ChevronRight size={16} />
            </button>
          </div>
          <div className="signed-out-service-list">
            {featuredServices.map((service, index) => (
              <div key={service.name}>
                <span>0{index + 1}</span>
                <p>
                  <strong>{service.name}</strong>
                  <small>{service.category} · Est. {service.duration}</small>
                </p>
                <b>{service.price}</b>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="signed-out-footer">
        <div className="brand-mark signed-out-brand">
          <span className="brand-spark">✳</span>
          <span>LS Customs</span>
        </div>
        <span>Professional automotive solutions.</span>
        <button onClick={() => onOpenAuth('sign-in')}>
          Sign in to continue <ChevronRight size={14} />
        </button>
      </footer>
    </div>
  )
}
