/**
 * AdminOverview — Command Center dashboard.
 * Shows live stats, service map, technician status, and recent bookings.
 * Matches the "Admin Command Center" Figma screen exactly.
 */
import { ChevronRight, Calendar, Star, MapPin as MapPinIcon, Loader2 } from 'lucide-react'
import { useAdminOverviewStats } from '../../hooks/useAdminOverviewStats'
import { useLiveTechnicians } from '../../hooks/useLiveTechnicians'
import { useRecentBookings } from '../../hooks/useRecentBookings'
import { MapView, type MapPin as MapViewPin } from '../common/map'
import type { AdminView } from './AdminSidebar'

interface AdminOverviewProps {
  onViewChange: (view: AdminView) => void
}

export function AdminOverview({ onViewChange }: AdminOverviewProps) {
  const { stats, loading: statsLoading, error: statsError, refetch: refetchStats } = useAdminOverviewStats()
  const { technicians, mechanicPins, loading: techLoading, error: techError } = useLiveTechnicians()
  const { bookings, loading: bookingsLoading, error: bookingsError } = useRecentBookings(5)

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

  // Fallback center if no mechanics are on the map
  const mapCenter = mapPins.length > 0
    ? undefined
    : { lat: 34.0522, lng: -118.2437 }

  return (
    <div className="admin-main">
      {/* ── Top Bar ──────────────────────────────────────────── */}
      <div className="admin-topbar">
        <div className="admin-topbar-left">
          <h1>Overview</h1>
          <p>Live operational metrics and service status.</p>
        </div>
        <div className="admin-topbar-right">
          <div className="admin-live-badge">
            <span className="admin-live-dot" />
            LIVE SYSTEM ACTIVE
          </div>
        </div>
      </div>

      {error && (
        <div style={{
          marginBottom: 16, padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid #ef444440', borderRadius: 8, color: '#ef4444', fontSize: 13,
        }}>
          {error} — <button onClick={() => { void refetchStats() }} style={{ color: '#ef4444', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      {/* ── Stats Row ────────────────────────────────────────── */}
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
                {stat.icon === 'revenue'   && '₱'}
                {stat.icon === 'rentals'   && '🚗'}
                {stat.icon === 'mechanics' && '🔧'}
                {stat.icon === 'fleet'     && '📊'}
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

      {/* ── Map + Technician Status ──────────────────────────── */}
      <div className="admin-overview-grid">
        {/* Live Service Map */}
        <div className="admin-map-card">
          <div className="admin-section-header">
            <h3 className="admin-section-title">
              <span className="admin-section-title-dot" />
              Live Service Map
            </h3>
            <div className="admin-map-legend">
              <div className="admin-map-legend-item">
                <span className="admin-map-legend-dot mechanic" />
                Mechanics
              </div>
              <div className="admin-map-legend-item">
                <span className="admin-map-legend-dot rental" />
                Rentals
              </div>
            </div>
          </div>
          <div className="admin-map-container">
            {mapPins.length > 0 ? (
              <MapView pins={mapPins} height={320} center={mapCenter} />
            ) : (
              <div className="admin-map-bg" style={{ opacity: 0.5 }}>
                <div style={{ padding: 24, color: 'var(--admin-muted)', fontSize: 13, textAlign: 'center' }}>
                  {techLoading ? 'Loading mechanic locations…' : 'No mechanics with live locations available.'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Technician Status */}
        <div className="admin-tech-card">
          <div className="admin-section-header">
            <h3 className="admin-section-title">
              <span className="admin-section-title-dot" />
              Technician Status
            </h3>
          </div>
          {techLoading ? (
            <div style={{ padding: 24, color: 'var(--admin-muted)', fontSize: 13, textAlign: 'center' }}>
              <Loader2 size={20} className="spin" style={{ margin: '0 auto 8px' }} />
              Loading technicians…
            </div>
          ) : (
            <div className="admin-tech-list">
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
      </div>

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
        {bookingsLoading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--admin-muted)' }}>
            <Loader2 size={20} className="spin" style={{ margin: '0 auto 8px' }} />
            Loading recent bookings…
          </div>
        ) : (
          <table className="admin-table">
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
                  <td>
                    <div className="admin-table-service">
                      <div className="admin-table-service-icon">{booking.icon}</div>
                      <div>
                        <div className="admin-table-service-name">{booking.serviceType}</div>
                        <div className="admin-table-service-id">{booking.serviceId}</div>
                      </div>
                    </div>
                  </td>
                  <td>{booking.customer}</td>
                  <td>
                    <span className={`admin-status-badge ${booking.status}`}>
                      <span className={`admin-status-dot ${booking.status}`} />
                      {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="admin-table-price">{booking.price}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {bookings.length === 0 && !bookingsLoading && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--admin-muted)', fontSize: 13 }}>
            No recent bookings found.
          </div>
        )}
      </div>

      {/* ── Manage Schedule CTA ──────────────────────────────── */}
      <button className="admin-manage-schedule" onClick={() => onViewChange('mechanics')}>
        <Calendar size={18} />
        View Technicians
      </button>

      {/* ── Footer ───────────────────────────────────────────── */}
      <div className="admin-footer">
        <span>LS Customs</span>
        <div className="admin-footer-links">
          <button>Terms of Service</button>
          <button>Privacy Policy</button>
          <button>Trust Data</button>
          <button>Contact Support</button>
          <button>Careers</button>
        </div>
        <span>© 2024 LS Customs • Professional Automotive Solutions</span>
      </div>
    </div>
  )
}
