/**
 * Dashboard — home view with welcome row, hero cards, featured rentals, and trending services.
 * Both featured rentals and trending services come from Supabase.
 */
import { useEffect, useState } from 'react'
import { ChevronRight, Car, Wrench, CalendarDays, Sparkles } from 'lucide-react'
import { useCustomerVehicles } from '../../hooks/useCustomerVehicles'
import { useTrendingServices } from '../../hooks/useTrendingServices'
import { useScrollAnimation } from '../../hooks/useScrollAnimation'
import { useFavoriteVehicles } from '../../hooks/useFavoriteVehicles'
import { useCustomerSiteSettings } from '../../hooks/useCustomerSiteSettings'
import { VehicleCard } from '../common/VehicleCard'
import { ServiceMini } from '../common/ServiceMini'
import { LocationCard } from '../common/LocationCard'
import { Skeleton, VehicleCardSkeleton } from '../common/Skeleton'
import type { View } from '../../types'

function iconForCategory(raw: string): string {
  const lower = raw.toLowerCase()
  if (lower.includes('tire') || lower.includes('wheel') || lower.includes('brake') || lower.includes('suspension')) return '◉'
  if (lower.includes('electric') || lower.includes('battery')) return '⚡'
  if (lower.includes('diagnostic') || lower.includes('engine')) return '⌁'
  if (lower.includes('light') || lower.includes('headlight') || lower.includes('visibility')) return '✧'
  if (lower.includes('quick') || lower.includes('wiper')) return '⌒'
  if (lower.includes('routine') || lower.includes('fluid') || lower.includes('oil')) return '◒'
  return '✳'
}

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
  const { vehicles: featured, loading: featuredLoading } = useCustomerVehicles()
  const { services: trending, loading: trendingLoading } = useTrendingServices(2)
  const { isFavorite, toggleFavorite } = useFavoriteVehicles()
  const { settings } = useCustomerSiteSettings()

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = () => setNow(new Date())
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])

  const greeting = getGreeting(now.getHours())
  const dateLabel = formatDashboardDate(now)
  const scrollRef = useScrollAnimation<HTMLDivElement>({ threshold: 0 })
  const isDashboardVisible = scrollRef.className.includes('visible')

  return (
    <div className={`page dashboard-page ${scrollRef.className}`} ref={scrollRef.ref}>
      {/* ── Top Announcement & Promo Banner ─────────────────────── */}
      {settings.showBanner && (
        <div
          className="customer-announcement-banner"
          style={{
            background: settings.bannerBg,
            color: settings.bannerTextColor,
            borderRadius: 12,
            padding: '12px 18px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
            fontWeight: 600,
            fontSize: 13,
            transition: 'all 0.3s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <Sparkles size={16} style={{ flexShrink: 0 }} />
            <span>{settings.bannerText}</span>
          </div>
          {settings.bannerLinkView !== 'none' && settings.bannerLinkText && (
            <button
              type="button"
              onClick={() => onView(settings.bannerLinkView as View)}
              style={{
                background: settings.bannerTextColor === '#000000' ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.2)',
                color: settings.bannerTextColor,
                border: 'none',
                padding: '6px 14px',
                borderRadius: 6,
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {settings.bannerLinkText}
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      )}

      <section className="welcome-row">
        <div>
          <p className="eyebrow">{dateLabel}</p>
          <h1>
            {greeting}, {displayName} <span>✦</span>
          </h1>
          <p className="muted">{settings.welcomeSubtitle || 'Your garage is in good hands. What do you need today?'}</p>
        </div>
      </section>

      {/* ── Quick-Action Tiles ─────────────────────────────────── */}
      <div className="quick-actions-row">
        <button className="quick-action-tile" onClick={() => onView('rentals')} type="button">
          <span className="quick-action-icon"><Car size={20} /></span>
          <div className="quick-action-copy">
            <strong>Rent a Vehicle</strong>
            <span>Browse our premium fleet</span>
          </div>
        </button>
        <button className="quick-action-tile" onClick={() => onView('services')} type="button">
          <span className="quick-action-icon"><Wrench size={20} /></span>
          <div className="quick-action-copy">
            <strong>Book a Mechanic</strong>
            <span>On-demand mobile service</span>
          </div>
        </button>
        <button className="quick-action-tile" onClick={() => onView('bookings')} type="button">
          <span className="quick-action-icon"><CalendarDays size={20} /></span>
          <div className="quick-action-copy">
            <strong>My Bookings</strong>
            <span>Track your appointments</span>
          </div>
        </button>
      </div>

      <section className={`hero-grid stagger-hero ${isDashboardVisible ? 'visible' : ''}`}>
        <article className="hero-card">
          <video
            className="hero-video"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            aria-hidden="true"
          >
            <source src="/customer-videos/dashboardvidep.mp4" type="video/mp4" />
          </video>
          <div className="hero-overlay" aria-hidden="true" />
          <div className="hero-copy">
            <p className="eyebrow light">{settings.heroEyebrow || 'LS CUSTOMS CONCIERGE'}</p>
            <h2>
              {settings.heroHeadline || 'Premium vehicles.'}
              <br />
              <em>{settings.heroHeadlineEm || 'Precision service.'}</em>
            </h2>
            <p>{settings.heroSubtitle || 'Experience the perfect blend of high-end car rentals and on-demand, expert mobile mechanics.'}</p>
            <div className="hero-buttons">
              <button className="button light-button" onClick={() => onView('rentals')}>
                {settings.heroCtaRentalText || 'Rent a vehicle'} <ChevronRight size={16} />
              </button>
              <button className="ghost-button" onClick={() => onView('services')}>
                {settings.heroCtaServiceText || 'Book a mechanic'}
              </button>
            </div>
          </div>
        </article>
        <LocationCard onNotify={onNotify} />
      </section>

      <section className="section-heading">
        <div>
          <p className="eyebrow">YOUR GARAGE</p>
          <h2>Your favorite rentals</h2>
        </div>
        <button className="text-button" onClick={() => onView('rentals')}>
          View all <ChevronRight size={15} />
        </button>
      </section>
      {featuredLoading ? (
        <div className="vehicle-grid" aria-hidden="true" style={{ padding: '8px 0 20px' }}>
          <VehicleCardSkeleton />
          <VehicleCardSkeleton />
        </div>
      ) : featured.filter((vehicle) => isFavorite(vehicle.id)).length === 0 ? (
        <p className="muted favorite-empty" style={{ padding: '24px 0' }}>Tap the heart on a vehicle to keep it here.</p>
      ) : (
        <div className="vehicle-grid">
          {featured.filter((vehicle) => isFavorite(vehicle.id)).map((vehicle) => (
            <VehicleCard
              key={vehicle.name}
              vehicle={vehicle}
              isFavorite={isFavorite(vehicle.id)}
              onToggleFavorite={() => toggleFavorite(vehicle.id)}
              onBook={() => onNotify(`${vehicle.name} selected for booking`)}
            />
          ))}
        </div>
      )}

      <section className="section-heading service-heading">
        <div>
          <p className="eyebrow">ON-DEMAND CARE</p>
          <h2>You might want to try these for your vehicle</h2>
        </div>
        <button className="text-button" onClick={() => onView('services')}>
          View all <ChevronRight size={15} />
        </button>
      </section>
      <div className={`service-highlight-grid stagger-children ${isDashboardVisible ? 'visible' : ''}`}>
        {trendingLoading ? (
          <>
            <div className="service-row" style={{ padding: 17, display: 'flex', alignItems: 'center', gap: 16 }} aria-hidden="true">
              <Skeleton height={46} width={46} rounded={10} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Skeleton height={16} width="60%" rounded={4} />
                <Skeleton height={12} width="85%" rounded={4} />
              </div>
              <Skeleton height={20} width={90} rounded={6} />
            </div>
            <div className="service-row" style={{ padding: 17, display: 'flex', alignItems: 'center', gap: 16 }} aria-hidden="true">
              <Skeleton height={46} width={46} rounded={10} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Skeleton height={16} width="60%" rounded={4} />
                <Skeleton height={12} width="85%" rounded={4} />
              </div>
              <Skeleton height={20} width={90} rounded={6} />
            </div>
          </>
        ) : trending.length === 0 ? (
          <p className="muted" style={{ padding: '24px 0' }}>No active services in the catalog yet.</p>
        ) : (
          trending.map((service) => (
            <ServiceMini
              key={service.id}
              title={service.name}
              detail={service.description ?? 'Professional service performed at your location.'}
              price={`STARTS AT ₱${service.basePrice.toFixed(0)}`}
              icon={<span aria-hidden="true">{iconForCategory(service.category)}</span>}
            />
          ))
        )}
      </div>
    </div>
  )
}
