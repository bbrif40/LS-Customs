/**
 * AdminSidebar — dark-themed navigation sidebar for the admin panel.
 * Navigation for all admin capabilities: Overview, Fleet, Services, Mechanics,
 * Users, Bookings, Revenue, Ticket Requests.
 */
import {
  LayoutDashboard,
  Car,
  Wrench,
  Users,
  UserCog,
  DollarSign,
  FileBarChart,
  AlertTriangle,
  LogOut,
  TicketPlus,
} from 'lucide-react'

export type AdminView =
  | 'overview'
  | 'fleet'
  | 'services'
  | 'mechanics'
  | 'users'
  | 'bookings'
  | 'revenue'
  | 'tickets'

interface AdminSidebarProps {
  currentView: AdminView
  onViewChange: (view: AdminView) => void
  onSignOut: () => void
  userName: string
  openTicketCount?: number
}

const navItems: { id: AdminView; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'fleet', label: 'Fleet', icon: Car },
  { id: 'services', label: 'Services', icon: Wrench },
  { id: 'mechanics', label: 'Mechanics', icon: Users },
  { id: 'users', label: 'Users', icon: UserCog },
  { id: 'bookings', label: 'Bookings', icon: FileBarChart },
  { id: 'tickets', label: 'Ticket Requests', icon: TicketPlus },
  { id: 'revenue', label: 'Revenue', icon: DollarSign },
]

export function AdminSidebar({ currentView, onViewChange, onSignOut, userName, openTicketCount = 0 }: AdminSidebarProps) {
  return (
    <aside className="admin-sidebar">
      {/* Brand */}
      <div className="admin-sidebar-brand" onClick={() => onViewChange('overview')}>
        <div className="admin-sidebar-brand-icon">LS</div>
        <div>
          <h2>LS Customs</h2>
          <span className="admin-sidebar-subtitle">Admin Panel</span>
          <span className="admin-sidebar-subtitle">{userName || 'System Controller'}</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="admin-sidebar-nav">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`admin-nav-item ${currentView === id ? 'active' : ''}`}
            onClick={() => onViewChange(id)}
          >
            <span className="admin-nav-icon">
              <Icon size={18} />
            </span>
            <span className="admin-nav-label">{label}</span>
            {id === 'tickets' && openTicketCount > 0 && (
              <span className="admin-nav-badge" aria-label={`${openTicketCount} open tickets`}>
                {openTicketCount > 99 ? '99+' : openTicketCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Dispatch Emergency */}
      <button className="admin-sidebar-dispatch">
        <AlertTriangle size={16} />
        Dispatch Emergency
      </button>

      {/* Bottom */}
      <div className="admin-sidebar-bottom">
        <button className="admin-sidebar-signout" onClick={onSignOut}>
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </aside>
  )
}