/**
 * AdminLayout — shell layout wrapping the admin sidebar + main content area.
 * Manages admin view state and routing between admin pages.
 *
 * Panels stay mounted (hidden via CSS) so previously visited views render
 * instantly on revisit — no spinner flash, no re-fetch.
 */
import { useState } from 'react'
import { AdminSidebar } from './AdminSidebar'
import { AdminOverview } from './AdminOverview'
import { AdminFleet } from './AdminFleet'
import { AdminServices } from './AdminServices'
import { AdminMechanics } from './AdminMechanics'
import { AdminUsers } from './AdminUsers'
import { AdminBookings } from './AdminBookings'
import { AdminRevenue } from './AdminRevenue'
import { AdminTickets } from './AdminTickets'
import { useOpenTicketCount } from '../../hooks/useAdminData'
import type { AdminView } from './AdminSidebar'

interface AdminLayoutProps {
  userName: string
  onSignOut: () => void
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
]

export function AdminLayout({ userName, onSignOut }: AdminLayoutProps) {
  const [currentView, setCurrentView] = useState<AdminView>('overview')
  const openTicketCount = useOpenTicketCount()

  // Each panel is always mounted; only the active one is visible.
  // This keeps cached data warm and avoids a loading spinner on every switch.
  const renderView = (view: AdminView) => {
    switch (view) {
      case 'overview':
        return <AdminOverview onViewChange={setCurrentView} />
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
      default:
        return <AdminOverview onViewChange={setCurrentView} />
    }
  }

  return (
    <div className="admin-app">
      <AdminSidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        onSignOut={onSignOut}
        userName={userName}
        openTicketCount={openTicketCount}
      />
      <div className="admin-views">
        {ALL_VIEWS.map((view) => (
          <div
            key={view}
            className={`admin-view-pane${currentView === view ? ' is-active' : ''}`}
            hidden={currentView !== view}
            aria-hidden={currentView !== view}
          >
            {renderView(view)}
          </div>
        ))}
      </div>
    </div>
  )
}