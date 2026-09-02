/**
 * Sidebar — persistent navigation drawer with workspace items and emergency button.
 */
import { Phone, CircleHelp, ChevronRight } from 'lucide-react'
import { navItems } from '../../data/navigation'
import type { View } from '../../types'

interface SidebarProps {
  view: View
  menuOpen: boolean
  displayName: string
  initials: string
  onView: (view: View) => void
  onNotify: (message: string) => void
  onSignOut: () => void
  unreadCount: number
}

export function Sidebar({ view, menuOpen, onView, onNotify, onSignOut, unreadCount }: SidebarProps) {
  return (
    <aside className={`sidebar ${menuOpen ? 'is-open' : ''}`}>
      <div className="brand-mark" onClick={() => onView('home')} role="button" tabIndex={0}>
        <span className="brand-spark">✳</span>
        <span>LS Customs</span>
      </div>
      <div className="sidebar-label">MY WORKSPACE</div>
      <nav className="side-nav">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            className={view === id ? 'nav-item active' : 'nav-item'}
            key={id}
            onClick={() => onView(id)}
          >
            <Icon size={18} strokeWidth={1.8} />
            {label}
            {id === 'bookings' && unreadCount > 0 && <span className="nav-count">{unreadCount}</span>}
          </button>
        ))}
      </nav>
      <button className="emergency-button" onClick={() => onNotify('Emergency dispatch is ready at your location')}>
        <span className="emergency-icon"><Phone size={16} /></span>
        <span>
          <strong>Emergency Mechanic</strong>
          <small>Get help on the road</small>
        </span>
      </button>
      <div className="sidebar-bottom">
        <button className="nav-item" onClick={() => onNotify('Help center coming soon')}>
          <CircleHelp size={18} /> Help Center
        </button>
        <button className="signout" onClick={onSignOut}>
          Sign out <ChevronRight size={15} />
        </button>
      </div>
    </aside>
  )
}
