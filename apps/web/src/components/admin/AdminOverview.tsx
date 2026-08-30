/**
 * AdminOverview — Command Center dashboard.
 * Shows live stats, service map, technician status, and recent bookings.
 * Matches the "Admin Command Center" Figma screen exactly.
 */
import { ChevronRight, Calendar, Star, MapPin } from 'lucide-react'
import { overviewStats, technicians, recentBookings } from '../../data/adminData'
import type { AdminView } from './AdminSidebar'

interface AdminOverviewProps {
  onViewChange: (view: AdminView) => void
}

export function AdminOverview({ onViewChange }: AdminOverviewProps) {
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

      {/* ── Stats Row ────────────────────────────────────────── */}
      <div className="admin-stats-row">
        {overviewStats.map((stat) => (
          <div className="admin-stat-card" key={stat.label}>
            <div className="admin-stat-header">
              <span className="admin-stat-label">{stat.label}</span>
              <div className={`admin-stat-icon ${stat.icon}`}>
                {stat.icon === 'revenue' && '₱'}
                {stat.icon === 'rentals' && '🚗'}
                {stat.icon === 'mechanics' && '🔧'}
                {stat.icon === 'fleet' && '📊'}
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
        ))}
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
            <div className="admin-map-bg">
              {/* Stylized roads */}
              <div className="admin-map-road h1" />
              <div className="admin-map-road h2" />
              <div className="admin-map-road h3" />
              <div className="admin-map-road v1" />
              <div className="admin-map-road v2" />
              <div className="admin-map-road v3" />
              <div className="admin-map-road v4" />
              <div className="admin-map-road d1" />

              {/* Map labels */}
              <span className="admin-map-label" style={{ top: '12%', left: '8%' }}>Buena Vista</span>
              <span className="admin-map-label" style={{ top: '22%', left: '38%' }}>El Monte</span>
              <span className="admin-map-label" style={{ top: '8%', left: '62%' }}>Duarte Ave</span>
              <span className="admin-map-label" style={{ top: '45%', left: '15%' }}>Covina</span>
              <span className="admin-map-label" style={{ top: '60%', left: '50%' }}>La Verne</span>
              <span className="admin-map-label" style={{ top: '75%', left: '25%' }}>El Cerro</span>
              <span className="admin-map-label" style={{ top: '85%', left: '70%' }}>Valle Bay</span>
              <span className="admin-map-label" style={{ top: '35%', left: '82%' }}>Irwindale</span>

              {/* Mechanic markers */}
              <div className="admin-map-marker mechanic" style={{ top: '25%', left: '30%' }} title="Marcus T.">🔧</div>
              <div className="admin-map-marker mechanic" style={{ top: '55%', left: '55%' }} title="Sarah J.">🔧</div>
              <div className="admin-map-marker mechanic" style={{ top: '70%', left: '20%' }} title="David R.">🔧</div>

              {/* Rental markers */}
              <div className="admin-map-marker rental" style={{ top: '15%', left: '58%' }} title="Sentinel XS">🚗</div>
              <div className="admin-map-marker rental" style={{ top: '40%', left: '72%' }} title="Elegy RH8">🚗</div>
              <div className="admin-map-marker rental" style={{ top: '50%', left: '35%' }} title="Baller">🚗</div>
            </div>
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
                    {tech.rating}
                  </div>
                  <div className="admin-tech-distance">
                    <MapPin size={10} /> {tech.distance}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Recent Bookings ──────────────────────────────────── */}
      <div className="admin-bookings-card">
        <div className="admin-section-header">
          <h3 className="admin-section-title">Recent Bookings</h3>
          <button className="admin-view-all">
            View All <ChevronRight size={14} />
          </button>
        </div>
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
            {recentBookings.map((booking, i) => (
              <tr key={i}>
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
      </div>

      {/* ── Manage Schedule CTA ──────────────────────────────── */}
      <button className="admin-manage-schedule" onClick={() => onViewChange('mechanics')}>
        <Calendar size={18} />
        Manage Schedule
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
