/**
 * Header — top bar with mobile menu toggle, breadcrumb, notifications, and user chip.
 */
import { Bell, ChevronRight, Menu } from 'lucide-react'
import { navItems } from '../../data/navigation'
import type { View } from '../../types'

interface HeaderProps {
  view: View
  menuOpen: boolean
  displayName: string
  initials: string
  onToggleMenu: () => void
  onView: (view: View) => void
  onNotify: (message: string) => void
}

export function Header({ view, menuOpen, displayName, initials, onToggleMenu, onView, onNotify }: HeaderProps) {
  return (
    <header className="topbar">
      <button className="mobile-menu" onClick={onToggleMenu} aria-label="Open menu">
        <Menu size={21} />
      </button>
      <div className="breadcrumb">
        <span>My workspace</span>
        <ChevronRight size={15} />
        <strong>{navItems.find((item) => item.id === view)?.label}</strong>
      </div>
      <div className="top-actions">
        <button className="icon-button" onClick={() => onNotify('No new alerts')} aria-label="Notifications">
          <Bell size={19} />
          <i />
        </button>
        <button className="user-chip" onClick={() => onView('profile')}>
          <span className="avatar">{initials}</span>
          <span>{displayName}</span>
          <ChevronRight size={15} />
        </button>
      </div>
    </header>
  )
}
