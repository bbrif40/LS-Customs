/**
 * AdminOverview — Command Center dashboard.
 * Shows live stats, service map, technician status, and recent bookings.
 */
import { useState } from 'react'
import { ChevronRight, Calendar, Star, MapPin as MapPinIcon, Loader2, Car, Wrench, BarChart3, ClipboardList, TicketPlus } from 'lucide-react'
import { useAdminOverviewStats } from '../../hooks/useAdminOverviewStats'
import { useLiveTechnicians } from '../../hooks/useLiveTechnicians'
import { useRecentBookings } from '../../hooks/useRecentBookings'
import { MapView, type MapPin as MapViewPin } from '../common/map'
import type { AdminView } from './AdminSidebar'

interface AdminOverviewProps {
  onViewChange: (view: AdminView) => void
  ticketCount: { count: number; loading: boolean; error: boolean }
  bookingCount: { count: number; loading: boolean; error: boolean }
}

export function AdminOverview({ onViewChange, ticketCount, bookingCount }: AdminOverviewProps) {
  const { stats, loading: statsLoading, error: statsError, updatedAt: statsUpdatedAt, refetch: refetchStats } = useAdminOverviewStats()
  const { technicians, mechanicPins, loading: techLoading, error: techError, updatedAt: techUpdatedAt, refetch: refetchTech } = useLiveTechnicians()
  const { bookings, loading: bookingsLoading, error: bookingsError, updatedAt: bookingsUpdatedAt, refetch: refetchBookings } = useRecentBookings(5)

  const [mapOpen, setMapOpen] = useState(false)
  const loading = statsLoading || techLoading || bookingsLoading
  const error = statsError || techError || bookingsError

  // Convert mechanicPins to MapView-compatible pins
  const mapPins: MapViewPin[] = mechanicPins.map((pin) => ({
    id: pin.id,
    lat: pin.lat,
    lng: pin.lng,
    title: pin.title,
    description: pin.status,
    color: pin.status === 'on-job' ? '#e8a838' : pin.status === 'en-route' ? '#06b6d4' : '#22c55e',
  }))

  return (
    <div className="admin-main admin-overview-workspace">
      {/* ── Top Bar ──────────────────────────────────────────── */}
      <div className="admin-topbar">
        <div className="admin-topbar-left">
          <h1>Overview</h1>
          <p>Bookings, requests and mechanic availability.</p>
        </div>
        <div className="admin-data-state" role="status">{loading ? 'Updating workspace…' : error ? 'Some data is unavailable' : 'Workspace loaded'}</div>
      </div>
      <section className="admin-work-queue" aria-label="Current workload">
        <div><h2>Current workload</h2><p role="status">{bookingCount.loading || ticketCount.loading ? 'Checking active bookings and open requests…' : bookingCount.error || ticketCount.error ? 'Workload counts are unavailable. Open the relevant page to check records.' : bookingCount.count === 0 && ticketCount.count === 0 ? 'No active bookings or open requests.' : 'Open bookings or requests to review the current work.'}</p></div>
        <button type="button" onClick={() => onViewChange('bookings')}><ClipboardList size={20} /><span><strong>Bookings</strong><small>{bookingCount.loading ? 'Checking…' : bookingCount.error ? 'Count unavailable' : `${bookingCount.count} active bookings`}</small></span><ChevronRight size={18} /></button>
        <button type="button" onClick={() => onViewChange('tickets')}><TicketPlus size={20} /><span><strong>Ticket Requests</strong><small>{ticketCount.loading ? 'Checking…' : ticketCount.error ? 'Count unavailable' : `${ticketCount.count} open requests`}</small></span><ChevronRight size={18} /></button>
      </section>

      {/* ── Stats Row ────────────────────────────────────────── */}
      <section className="admin-metrics" aria-label="Business metrics" aria-busy={statsLoading}>
      <SectionState label="Metrics" loading={statsLoading} error={statsError} updatedAt={statsUpdatedAt} onRetry={refetchStats} />
      <div className="admin-stats-row">
        {stats.map((stat) => {
          const statView: AdminView | null =
            stat.icon === 'revenue'   ? 'revenue'
            : stat.icon === 'rentals'  ? 'bookings'
            : stat.icon === 'mechanics'? 'bookings'
            : stat.icon === 'fleet'    ? 'fleet'
            : null
          return (
          <div
            className="admin-stat-card"
            key={stat.label}
            role={statView ? 'button' : undefined}
            tabIndex={statView ? 0 : undefined}
            onClick={statView ? () => onViewChange(statView) : undefined}
            onKeyDown={statView ? (e) => { if (e.key === 'Enter' || e.key === ' ') onViewChange(statView) } : undefined}
            style={statView ? { cursor: 'pointer' } : undefined}
            aria-label={statView ? `${stat.label} — click to view` : undefined}
          >
            <div className="admin-stat-header">
              <span className="admin-stat-label">{stat.label}</span>
              <div className={`admin-stat-icon ${stat.icon}`}>
                {stat.icon === 'revenue'   && <span style={{ fontWeight: 700 }}>₱</span>}
                {stat.icon === 'rentals'   && <Car size={20} />}
                {stat.icon === 'mechanics' && <Wrench size={20} />}
                {stat.icon === 'fleet'     && <BarChart3 size={20} />}
              </div>
            </div>
            <div className="admin-stat-value">{stat.value}</div>
            {stat.trend && (
              <span className={`admin-stat-trend ${stat.trendUp ? 'up' : 'down'}`}>
                {stat.trendUp ? '↑' : '↓'} {stat.trend}
              </span>
            )}
            {stat.sub && !stat.trend && (
              <span className="admin-stat-sub">{stat.sub}</span>
            )}
          </div>
          )
        })}
      </div>

      </section>

        <div className="admin-map-card">
          <button className="admin-map-toggle" type="button" aria-expanded={mapOpen} aria-controls="overview-map" onClick={() => setMapOpen(!mapOpen)}>{mapOpen ? 'Hide mechanic locations' : 'Show mechanic locations'} <ChevronRight size={16} /></button>
          {mapOpen && <div id="overview-map">
          <div className="admin-section-header">
            <h3 className="admin-section-title">
              <span className="admin-section-title-dot" />
              Mechanic locations
            </h3>
            <div className="admin-map-legend">
              <div className="admin-map-legend-item">
                <span className="admin-map-legend-dot mechanic" />
                Mechanics
              </div>

            </div>
          </div>
          <div className="admin-map-container">
            {techError ? <p className="overview-empty">Locations are unavailable. Retry mechanic availability above.</p> : mapPins.length > 0 ? (
              <MapView pins={mapPins} height={320}  />
            ) : (
              <div className="admin-map-bg" style={{ opacity: 0.5 }}>
                <div style={{ padding: 24, color: 'var(--admin-muted)', fontSize: 13, textAlign: 'center' }}>
                  {techLoading ? 'Loading mechanic locations…' : 'No mechanics with live locations available.'}
                </div>
              </div>
            )}
          </div>
          </div>}
        </div>


      {/* ── Manage Schedule CTA ──────────────────────────────── */}
      <button className="admin-manage-schedule" onClick={() => onViewChange('mechanics')}>
        <Calendar size={18} />
        View mechanics
      </button>

      {/* ── Recent Bookings ──────────────────────────────────── */}
      <div className="admin-bookings-card">
        <div className="admin-section-header">
          <h3 className="admin-section-title">Recent Bookings</h3>
          <button
            className="admin-view-all"
            onClick={() => onViewChange('bookings')}
            style={{ cursor: 'pointer' }}
          >
            View All <ChevronRight size={14} />
          </button>
        </div>
        <SectionState label="Recent bookings" loading={bookingsLoading} error={bookingsError} updatedAt={bookingsUpdatedAt} onRetry={refetchBookings} />
        {bookingsLoading && !bookingsUpdatedAt ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--admin-muted)' }}>
            <Loader2 size={20} className="spin" style={{ margin: '0 auto 8px' }} />
            Loading recent bookings…
          </div>
        ) : (
          <table className="admin-table admin-booking-table">
            <thead>
              <tr>
                <th>Service Type</th>
                <th>Customer</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Price (₱)</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking, i) => (
                <tr key={`${booking.serviceId}-${i}`}>
                  <td data-label="Service">
                    <div className="admin-table-service">
                      <div className="admin-table-service-icon">
                        {booking.icon === 'rental' || booking.serviceType.toLowerCase().includes('rental') ? <Car size={18} /> : <Wrench size={18} />}
                      </div>
                      <div>
                        <div className="admin-table-service-name">{booking.serviceType}</div>
                        <div className="admin-table-service-id">{booking.serviceId}</div>
                      </div>
                    </div>
                  </td>
                  <td data-label="Customer">{booking.customer}</td>
                  <td data-label="Status">
                    <span className={`admin-status-badge ${booking.status}`}>
                      <span className={`admin-status-dot ${booking.status}`} />
                      {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                    </span>
                  </td>
                  <td data-label="Price" style={{ textAlign: 'right' }}>
                    <span className="admin-table-price">{booking.price}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {bookings.length === 0 && !bookingsLoading && !bookingsError && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--admin-muted)', fontSize: 13 }}>
            No recent bookings found.
          </div>
        )}
      </div>

        {/* Mechanic availability */}
        <div className="admin-tech-card">
          <div className="admin-section-header">
            <h3 className="admin-section-title">
              <span className="admin-section-title-dot" />
              Mechanic availability
            </h3>
          </div>
          <SectionState label="Mechanic availability" loading={techLoading} error={techError} updatedAt={techUpdatedAt} onRetry={refetchTech} />
          {techLoading && !techUpdatedAt ? (
            <div style={{ padding: 24, color: 'var(--admin-muted)', fontSize: 13, textAlign: 'center' }}>
              <Loader2 size={20} className="spin" style={{ margin: '0 auto 8px' }} />
              Loading technicians…
            </div>
          ) : (
            <div className="admin-tech-list">
              {!techLoading && !techError && technicians.length === 0 && <p className="overview-empty">No mechanics to display.</p>}
              {technicians.map((tech) => (
                <div className="admin-tech-item" key={tech.name}>
                  <div className={`admin-tech-avatar ${tech.status}`}>
                    {tech.avatar}
                  </div>
                  <div className="admin-tech-info">
                    <div className="admin-tech-name">{tech.name}</div>
                    <div className="admin-tech-role">{tech.role}</div>
                    <span className={`admin-tech-status ${tech.status}`}>
                      {tech.status === 'on-job' && 'On Job'}
                      {tech.status === 'available' && 'Available'}
                      {tech.status === 'en-route' && 'En Route'}
                    </span>
                  </div>
                  <div className="admin-tech-right">
                    <div className="admin-tech-rating">
                      <Star size={14} className="admin-tech-rating-star" fill="currentColor" />
                      {tech.rating > 0 ? tech.rating.toFixed(1) : '—'}
                    </div>
                    <div className="admin-tech-distance">
                      <MapPinIcon size={10} /> {tech.distance}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      {/* ── Footer ───────────────────────────────────────────── */}
      <div className="admin-footer">
        <span>LS Customs</span>
        <div className="admin-footer-links"><a href="/terms">Terms of Service</a><a href="/privacy">Privacy Policy</a><a href="/contact">Contact Support</a></div>
        <span>© {new Date().getFullYear()} LS Customs</span>
      </div>
    </div>
  )
}

function SectionState({ label, loading, error, updatedAt, onRetry }: { label: string; loading: boolean; error: string | null; updatedAt: Date | null; onRetry: () => Promise<void> }) {
  return <div className={`overview-section-state ${error ? 'has-error' : ''}`} role="status">
    <span>{error ? `We couldn’t refresh ${label.toLowerCase()}.${updatedAt ? ' Showing the last successful update.' : ' Try again.'}` : loading ? `Updating ${label.toLowerCase()}…` : updatedAt ? `Updated ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : `Waiting for ${label.toLowerCase()}.`}</span>
    {error && <button type="button" className="text-button" disabled={loading} onClick={() => { void onRetry() }}>Retry {label.toLowerCase()}</button>}
  </div>
}
