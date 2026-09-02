/**
 * GuestWorkspace — authenticated-style workspace for guests.
 * Same layout as the signed-in workspace but gates actions behind sign-in.
 */
import { useState } from 'react'
import { Phone, CircleHelp, ChevronRight, Menu, CarFront, Wrench, ClipboardList } from 'lucide-react'
import { navItems } from '../../data/navigation'
import { Rentals } from './Rentals'
import { MechanicServices } from './MechanicServices'
import { WorkspaceFooter } from '../layout/WorkspaceFooter'
import { LocationCard } from '../common/LocationCard'
import type { AuthMode, View } from '../../types'

interface GuestWorkspaceProps {
  onOpenAuth: (mode?: AuthMode) => void
}

export function GuestWorkspace({ onOpenAuth }: GuestWorkspaceProps) {
  const [guestView, setGuestView] = useState<View>('home')

  const navigateGuest = (view: View) => {
    if (view === 'rentals' || view === 'services') {
      setGuestView(view)
      return
    }
    onOpenAuth('sign-in')
  }

  return (
    <div className="app-frame guest-workspace">
      <aside className="sidebar">
        <div className="brand-mark">
          <span className="brand-spark">✳</span>
          <span>LS Customs</span>
        </div>
        <div className="sidebar-label">MY WORKSPACE</div>
        <nav className="side-nav">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              className={guestView === id ? 'nav-item active' : 'nav-item'}
              key={id}
              onClick={() => navigateGuest(id)}
            >
              <Icon size={18} strokeWidth={1.8} />
              {label}
            </button>
          ))}
        </nav>
        <button
          className="emergency-button"
          onClick={() => onOpenAuth('sign-in')}
        >
          <span className="emergency-icon">
            <Phone size={16} />
          </span>
          <span>
            <strong>Emergency Mechanic</strong>
            <small>Sign in to get help on the road</small>
          </span>
        </button>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => onOpenAuth('sign-in')}>
            <CircleHelp size={18} /> Help Center
          </button>
          <button className="signout" onClick={() => onOpenAuth('sign-in')}>
            Sign in <ChevronRight size={15} />
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open menu">
            <Menu size={21} />
          </button>
          <div className="breadcrumb">
            <span>My workspace</span>
            <ChevronRight size={15} />
            <strong>{navItems.find((item) => item.id === guestView)?.label}</strong>
          </div>
          <div className="top-actions">
            <button className="button dark-button guest-sign-in" onClick={() => onOpenAuth('sign-in')}>
              Sign in <ChevronRight size={15} />
            </button>
          </div>
        </header>

        {guestView === 'home' && (
          <div className="guest-page">
            <p className="eyebrow">LS CUSTOMS WORKSPACE</p>
            <h1>
              Your automotive care,
              <br />
              <em>in one place.</em>
            </h1>
            <p className="muted guest-copy">
              Sign in to view your dashboard, manage rentals, book a mobile mechanic, and keep your vehicle history together.
            </p>
            <div className="guest-actions">
              <button className="button dark-button" onClick={() => onOpenAuth('sign-in')}>
                Sign in to continue <ChevronRight size={16} />
              </button>
              <button className="outline-button" onClick={() => onOpenAuth('create-account')}>
                Create an account
              </button>
            </div>
            <div className="guest-panels">
              <article>
                <CarFront size={20} />
                <strong>Premium rentals</strong>
                <span>Browse and reserve vehicles for your next trip.</span>
              </article>
              <article>
                <Wrench size={20} />
                <strong>Mobile mechanics</strong>
                <span>Get certified service at your location.</span>
              </article>
              <article>
                <ClipboardList size={20} />
                <strong>One workspace</strong>
                <span>Track bookings, alerts, and service history.</span>
              </article>
            </div>
          </div>
        )}

        {guestView === 'rentals' && <Rentals onNotify={() => onOpenAuth('sign-in')} />}
        {guestView === 'services' && (
          <MechanicServices cartCount={0} onAdd={() => onOpenAuth('sign-in')} onNotify={() => onOpenAuth('sign-in')} />
        )}

        <WorkspaceFooter onNotify={() => onOpenAuth('sign-in')} />
      </main>

      <nav className="mobile-nav">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={guestView === id ? 'active' : ''}
            onClick={() => navigateGuest(id)}
          >
            <Icon size={19} />
            <span>{label === 'Workspace' ? 'Home' : label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
