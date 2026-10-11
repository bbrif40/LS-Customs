/**
 * AdminLayout — shell layout wrapping the admin sidebar + main content area.
 * Manages admin view state and routing between admin pages.
 *
 * Panels stay mounted (hidden via CSS) so previously visited views render
 * instantly on revisit — no spinner flash, no re-fetch.
 */
import { useState, Component, type ReactNode, type ErrorInfo } from 'react'
import { Menu, X } from 'lucide-react'
import { AdminSidebar } from './AdminSidebar'
import { AdminOverview } from './AdminOverview'
import { AdminFleet } from './AdminFleet'
import { AdminServices } from './AdminServices'
import { AdminMechanics } from './AdminMechanics'
import { AdminUsers } from './AdminUsers'
import { AdminBookings } from './AdminBookings'
import { AdminRevenue } from './AdminRevenue'
import { AdminTickets } from './AdminTickets'

import { AdminAuditLogs } from './AdminAuditLogs'
import { AdminAccountSecurity } from './AdminAccountSecurity'
import { useOpenTicketCount, useAdminBookingsCount } from '../../hooks/useAdminData'
import type { AdminView } from './AdminSidebar'

interface AdminLayoutProps {
  userName: string
  onSignOut: () => void
}

class AdminPaneBoundary extends Component<{ children: ReactNode; paneName: string }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[AdminLayout] pane error in ${this.props.paneName}:`, error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 48, textAlign: 'center', color: '#f87171' }}>
          <h3 style={{ fontSize: 18, marginBottom: 8 }}>Failed to load {this.props.paneName}</h3>
          <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>{this.state.error.message}</p>
          <button
            className="admin-add-btn"
            onClick={() => this.setState({ error: null })}
            style={{ margin: '0 auto' }}
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const ALL_VIEWS: AdminView[] = [
  'overview',
  'fleet',
  'services',
  'mechanics',
  'users',
  'bookings',
  'tickets',
  'revenue',
  'audit-logs',
]

export function AdminLayout({ userName, onSignOut }: AdminLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [currentView, setCurrentView] = useState<AdminView>('overview')
  const openTicketCount = useOpenTicketCount()
  const activeBookingsCount = useAdminBookingsCount()

  // Each panel is always mounted; only the active one is visible.
  // This keeps cached data warm and avoids a loading spinner on every switch.
  const renderView = (view: AdminView) => {
    switch (view) {
      case 'overview':
        return <AdminOverview onViewChange={setCurrentView} ticketCount={openTicketCount} bookingCount={activeBookingsCount} />
      case 'fleet':
        return <AdminFleet />
      case 'services':
        return <AdminServices />
      case 'mechanics':
        return <AdminMechanics />
      case 'users':
        return <AdminUsers />
      case 'bookings':
        return <AdminBookings />
      case 'tickets':
        return <AdminTickets />
      case 'revenue':
        return <AdminRevenue />
      case 'audit-logs':
        return <AdminAuditLogs />
      default:
        return null
    }
  }

  return (
    <div className={`admin-app${menuOpen ? ' admin-menu-open' : ''}`}>
      <header className="admin-mobile-header"><a href="/admin" aria-label="LS Customs admin"><img src="/logo.png" alt="" />LS Customs <span>Admin</span></a><button type="button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="admin-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button></header>
      {menuOpen && <button type="button" className="admin-nav-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}

      <AdminSidebar
        mobileOpen={menuOpen}
        onCloseMenu={() => setMenuOpen(false)}
        currentView={currentView}
        onViewChange={(view) => { setCurrentView(view); setMenuOpen(false) }}
        onSignOut={onSignOut}
        userName={userName}
        openTicketCount={openTicketCount.count}
        activeBookingsCount={activeBookingsCount.count}
      />
      <div className="admin-views">
        <AdminAccountSecurity />
        {ALL_VIEWS.map((view) => (
          <div
            key={view}
            className={`admin-view-pane${currentView === view ? ' is-active' : ''}`}
            hidden={currentView !== view}
            aria-hidden={currentView !== view}
          >
            <AdminPaneBoundary paneName={view}>
              {renderView(view)}
            </AdminPaneBoundary>
          </div>
        ))}
      </div>
    </div>
  )
}
