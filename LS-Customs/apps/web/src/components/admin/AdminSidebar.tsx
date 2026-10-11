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
  LogOut,
  TicketPlus,
  Palette,
  ShieldCheck,
  Settings,
  ExternalLink,
  X,
} from 'lucide-react'
import { useDialog } from '../../hooks/useDialog'

export type AdminView =
  | 'overview'
  | 'fleet'
  | 'services'
  | 'mechanics'
  | 'users'
  | 'bookings'
  | 'revenue'
  | 'tickets'
  | 'settings'
  | 'audit-logs'

interface AdminSidebarProps {
  currentView: AdminView
  onViewChange: (view: AdminView) => void
  onSignOut: () => void
  userName: string
  openTicketCount?: number
  activeBookingsCount?: number
  mobileOpen?: boolean
  onCloseMenu?: () => void
}

const navItems: { id: AdminView; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview',      label: 'Overview',         icon: LayoutDashboard },
  { id: 'fleet',         label: 'Fleet',             icon: Car },
  { id: 'services',      label: 'Services',          icon: Wrench },
  { id: 'mechanics',     label: 'Mechanics',         icon: Users },
  { id: 'users',         label: 'Users',             icon: UserCog },
  { id: 'bookings',      label: 'Bookings',          icon: FileBarChart },
  { id: 'tickets',       label: 'Ticket Requests',   icon: TicketPlus },
  { id: 'revenue',       label: 'Revenue',           icon: DollarSign },
  { id: 'audit-logs',    label: 'Audit Logs',        icon: ShieldCheck },
]

export function AdminSidebar({
  currentView,
  onViewChange,
  onSignOut,
  userName,
  openTicketCount = 0,
  activeBookingsCount = 0,
  mobileOpen = false,
  onCloseMenu,
}: AdminSidebarProps) {
  const dialogRef = useDialog<HTMLElement>(() => onCloseMenu?.(), mobileOpen)
  return (
    <aside ref={dialogRef} tabIndex={mobileOpen ? -1 : undefined} role={mobileOpen ? 'dialog' : undefined} aria-modal={mobileOpen || undefined} aria-label={mobileOpen ? 'Admin navigation menu' : undefined} id="admin-navigation" className="admin-sidebar">
      {mobileOpen && <button className="admin-sidebar-close" type="button" aria-label="Close admin menu" onClick={onCloseMenu}><X size={20} /></button>}
      {/* Brand */}
      <div className="admin-sidebar-brand">
        <div className="admin-sidebar-brand-icon" style={{ background: 'transparent', padding: 0 }}>
          <img
            src="/logo.png"
            alt="LS Customs"
            style={{ width: 38, height: 38, objectFit: 'contain', flexShrink: 0 }}
          />
        </div>
        <div>
          <h2>LS Customs</h2>
          <span className="admin-sidebar-subtitle">Admin Panel</span>
          <span className="admin-sidebar-subtitle">{userName || 'System Controller'}</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="admin-sidebar-nav" role="navigation" aria-label="Admin navigation">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`admin-nav-item ${currentView === id ? 'active' : ''}`}
            onClick={() => onViewChange(id)}
            aria-current={currentView === id ? 'page' : undefined}
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
            {id === 'bookings' && activeBookingsCount > 0 && (
              <span className="admin-nav-badge" aria-label={`${activeBookingsCount} active bookings`}>
                {activeBookingsCount > 99 ? '99+' : activeBookingsCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Bottom */}
      <div className="admin-sidebar-bottom">
        <a 
          href="/" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="admin-nav-item" 
          style={{ textDecoration: 'none', marginBottom: 12, display: 'flex', alignItems: 'center' }}
        >
          <span className="admin-nav-icon"><ExternalLink size={18} /></span>
          <span className="admin-nav-label">View Website</span>
        </a>
        <button className="admin-sidebar-signout" onClick={onSignOut}>
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
