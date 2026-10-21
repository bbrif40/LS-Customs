import { useWebsiteText } from "../../hooks/useWebsiteText"
import { SidebarTestimonials } from '../layout/SidebarTestimonials'
/**
 * Dashboard — home view with welcome row, hero cards, featured rentals, and trending services.
 * Both featured rentals and trending services come from Supabase.
 */
import { useEffect, useState } from 'react'
import { ChevronRight, Car, Wrench, CalendarDays, Sparkles, CircleDashed, Zap, Activity, Lightbulb, Wind, Droplet, Settings } from 'lucide-react'
import { useCustomerVehicles } from '../../hooks/useCustomerVehicles'
import { useTrendingServices } from '../../hooks/useTrendingServices'
import { useScrollAnimation } from '../../hooks/useScrollAnimation'
import { useFavoriteVehicles } from '../../hooks/useFavoriteVehicles'
import { useCustomerSiteSettings } from '../../hooks/useCustomerSiteSettings'
import { useCustomerBookings, CUSTOMER_ACTIVE_STATUSES } from '../../hooks/useCustomerBookings'
import { VehicleCard } from '../common/VehicleCard'
import { ServiceMini } from '../common/ServiceMini'
import { LocationCard } from '../common/LocationCard'
import { AvailableVouchersPromos } from '../common/AvailableVouchersPromos'
import { Skeleton, VehicleCardSkeleton } from '../common/Skeleton'
import type { View } from '../../types'

function IconForCategory({ category, size = 20 }: { category: string, size?: number }) {
  const lower = category.toLowerCase()
  if (lower.includes('tire') || lower.includes('wheel') || lower.includes('brake') || lower.includes('suspension')) return <CircleDashed size={size} />
  if (lower.includes('electric') || lower.includes('battery')) return <Zap size={size} />
  if (lower.includes('diagnostic') || lower.includes('engine')) return <Activity size={size} />
  if (lower.includes('light') || lower.includes('headlight') || lower.includes('visibility')) return <Lightbulb size={size} />
  if (lower.includes('quick') || lower.includes('wiper')) return <Wind size={size} />
  if (lower.includes('routine') || lower.includes('fluid') || lower.includes('oil')) return <Droplet size={size} />
  return <Settings size={size} />
}

interface DashboardProps {
  userId?: string
  displayName: string
  initials: string
  onView: (view: View) => void
  onNotify: (message: string) => void
  onSelectService?: (serviceId: string) => void
}

function getGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function Dashboard({ userId, displayName, initials, onView, onNotify, onSelectService }: DashboardProps) {
  const websiteText = useWebsiteText("Workspace")

  const bookings = useCustomerBookings(userId)
  const activeBooking = [...bookings.serviceBookings.map(b => ({ ...b, title: b.service_booking_items?.map(i => i.mechanic_services?.name).filter(Boolean).join(', ') || 'Mechanic service', date: b.scheduled_at })), ...bookings.vehicleBookings.map(b => ({ ...b, title: b.vehicles?.name || 'Vehicle rental', date: b.start_date }))]
    .filter(b => CUSTOMER_ACTIVE_STATUSES.some(status => status === b.status))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0]
  const { vehicles: featured, loading: featuredLoading } = useCustomerVehicles()
  const { services: trending, loading: trendingLoading } = useTrendingServices(2)
  const { isFavorite, toggleFavorite } = useFavoriteVehicles()
  const { settings } = useCustomerSiteSettings()

  const [now, setNow] = useState(() => new Date())
  const [isHeroExpanded, setIsHeroExpanded] = useState(false)
  useEffect(() => {
    const tick = () => setNow(new Date())
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])

  const greeting = getGreeting(now.getHours())
  const scrollRef = useScrollAnimation<HTMLDivElement>({ threshold: 0 })
  const isDashboardVisible = scrollRef.className.includes('visible')

  return (
    <div className={`page dashboard-page ${scrollRef.className}`} ref={scrollRef.ref}>
      <section className="welcome-row">
        <div><p className="eyebrow">{websiteText("YOUR WORKSPACE")}</p><h1>{greeting}, {displayName}</h1><p className="muted">{websiteText("Your next journey starts here.", undefined, settings.welcomeSubtitle || 'Your next journey starts here.')}</p></div>
      </section>
      <section className="workspace-next" aria-label={websiteText("Your bookings")} aria-busy={bookings.loading}>
        <span className="workspace-next-icon"><CalendarDays size={24} /></span>
        <div className="workspace-next-copy" role="status">
          <h2>{activeBooking?.title || (bookings.loading && !bookings.updatedAt ? 'Loading your bookings…' : bookings.error ? 'We couldn’t load your bookings' : 'What do you need today?')}</h2>
          {activeBooking && <p>{new Date(activeBooking.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · {activeBooking.status.replace(/_/g, ' ')}{websiteText("· Payment:")} {activeBooking.payments?.status === 'succeeded' ? websiteText("paid") : activeBooking.payments?.status?.replace(/_/g, ' ') || websiteText("not confirmed")}</p>}
          {bookings.error ? <p>{bookings.updatedAt ? websiteText("We couldn’t refresh your bookings. Showing the last successful update.") : websiteText("Try again to check your appointments and rentals.")}</p> : bookings.loading ? <p>{bookings.updatedAt ? websiteText("Refreshing your bookings. The previous update remains visible.") : websiteText("Checking your appointments and rentals.")}</p> : !activeBooking && <p>{bookings.updatedAt ? websiteText("No active bookings. Find a vehicle for your trip or book care at your location.") : websiteText("Find a vehicle for your trip or book care at your location.")}</p>}
          {bookings.updatedAt && <small>{websiteText("Last updated")} {bookings.updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>}
        </div>
        {bookings.error ? <button type="button" className="button dark-button" disabled={bookings.loading} onClick={() => { void bookings.refetch() }}>{websiteText("Retry bookings")}</button> : <button type="button" className="button dark-button" onClick={() => onView('bookings')}>{websiteText("View bookings")} <ChevronRight size={16} /></button>}
      </section>
      {/* ── Quick-Action Tiles ─────────────────────────────────── */}
      <div className="quick-actions-row">
        <button className="quick-action-tile" onClick={() => onView('rentals')} type="button">
          <span className="quick-action-icon"><Car size={20} /></span>
          <div className="quick-action-copy">
            <strong>{websiteText("Rent a Vehicle")}</strong>
            <span>{websiteText("Browse our premium fleet")}</span>
          </div>
        </button>
        <button className="quick-action-tile" onClick={() => onView('services')} type="button">
          <span className="quick-action-icon"><Wrench size={20} /></span>
          <div className="quick-action-copy">
            <strong>{websiteText("Book a Mechanic")}</strong>
            <span>{websiteText("On-demand mobile service")}</span>
          </div>
        </button>
        <button className="quick-action-tile" onClick={() => onView('bookings')} type="button">
          <span className="quick-action-icon"><CalendarDays size={20} /></span>
          <div className="quick-action-copy">
            <strong>{websiteText("My Bookings")}</strong>
            <span>{websiteText("Track your appointments")}</span>
          </div>
        </button>
      </div>

      {/* Promotions remain available below the primary task. */}
      {settings.showBanner && (
        <AvailableVouchersPromos
          onView={onView}
          onNotify={onNotify}
          bannerText={settings.bannerText}
          bannerBg={settings.bannerBg}
          bannerTextColor={settings.bannerTextColor}
          bannerLinkText={settings.bannerLinkText}
          bannerLinkView={settings.bannerLinkView}
          promoCode={settings.promoCode}
          promoTitle={settings.promoTitle}
          promoDiscount={settings.promoDiscount}
        />
      )}

      <section className={`hero-grid workspace-brand-grid stagger-hero ${isDashboardVisible ? 'visible' : ''} ${isHeroExpanded ? 'is-expanded' : ''}`}>
        <article className={`hero-card hero-card-with-video ${isHeroExpanded ? 'expanded' : ''}`}>
          <video className="hero-video" autoPlay loop muted playsInline preload="metadata" aria-hidden="true">
            <source src="/customer-videos/dashboardvidep.mp4" type="video/mp4" />
          </video>
          <div className="hero-overlay" aria-hidden="true" />
          <div className="hero-copy">
            <p className="eyebrow light">{websiteText("LS CUSTOMS CONCIERGE", undefined, settings.heroEyebrow || 'LS CUSTOMS CONCIERGE')}</p>
            <h2>
              {websiteText("Premium vehicles.", undefined, settings.heroHeadline || 'Premium vehicles.')}
              <br />
              <em>{websiteText("Precision service.", undefined, settings.heroHeadlineEm || 'Precision service.')}</em>
            </h2>
            <p>{websiteText("Experience the perfect blend of high-end car rentals and on-demand, expert mobile mechanics.", undefined, settings.heroSubtitle || 'Experience the perfect blend of high-end car rentals and on-demand, expert mobile mechanics.')}</p>


          </div>
        </article>
        <LocationCard
          onNotify={onNotify}
          isExpanded={isHeroExpanded}
          onToggleExpand={setIsHeroExpanded}
        />
      </section>

      <section className="section-heading">
        <div>
          <p className="eyebrow">{websiteText("YOUR GARAGE")}</p>
          <h2>{websiteText("Your favorite rentals")}</h2>
        </div>
        <button className="text-button" onClick={() => onView('rentals')}>{websiteText("View all")} <ChevronRight size={15} />
        </button>
      </section>
      {featuredLoading ? (
        <div className="vehicle-grid" aria-hidden="true" style={{ padding: '8px 0 20px' }}>
          <VehicleCardSkeleton />
          <VehicleCardSkeleton />
        </div>
      ) : featured.filter((vehicle) => isFavorite(vehicle.id)).length === 0 ? (
        <p className="muted favorite-empty" style={{ padding: '24px 0' }}>{websiteText("Tap the heart on a vehicle to keep it here.")}</p>
      ) : (
        <div className="vehicle-grid">
          {featured.filter((vehicle) => isFavorite(vehicle.id)).map((vehicle) => (
            <VehicleCard
              key={vehicle.id}
              vehicle={vehicle}
              isFavorite={isFavorite(vehicle.id)}
              onToggleFavorite={() => toggleFavorite(vehicle.id)}
              actionLabel={websiteText("Browse rentals")}
              onBook={() => onView('rentals')}
            />
          ))}
        </div>
      )}

      <section className="section-heading service-heading">
        <div>
          <p className="eyebrow">{websiteText("ON-DEMAND CARE")}</p>
          <h2>{websiteText("Popular services")}</h2>
        </div>
        <button className="text-button" onClick={() => onView('services')}>{websiteText("View all")} <ChevronRight size={15} />
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
          <p className="muted" style={{ padding: '24px 0' }}>{websiteText("No active services in the catalog yet.")}</p>
        ) : (
          trending.map((service) => (
            <ServiceMini
              key={service.id}
              title={service.name}
              detail={service.description ?? websiteText("Professional service performed at your location.")}
              price={`STARTS AT ₱${service.basePrice.toFixed(0)}`}
              icon={<IconForCategory category={service.category} size={20} />}
              onClick={() => onSelectService?.(service.id)}
            />
          ))
        )}
      </div>
      <SidebarTestimonials />
    </div>
  )
}
