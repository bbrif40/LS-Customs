/**
 * GuestWorkspace — authenticated-style workspace for guests.
 * Same layout as the signed-in workspace but gates actions behind sign-in.
 */
import { useState } from 'react'
import { Phone, CircleHelp, ChevronRight, Menu, CarFront, Wrench, ClipboardList } from 'lucide-react'
import { IonIcon } from '@ionic/react'
import { sparkles, warningOutline } from 'ionicons/icons'
import { navItems } from '../../data/navigation'
import { useScrollAnimation } from '../../hooks/useScrollAnimation'
import { Rentals } from './Rentals'
import { MechanicServices } from './MechanicServices'
import { WorkspaceFooter } from '../layout/WorkspaceFooter'
import { LocationCard } from '../common/LocationCard'
import { navigateTo } from '../../utils/navigation'
import type { AuthMode, View } from '../../types'

interface GuestWorkspaceProps {
  onOpenAuth: (mode?: AuthMode) => void
  onEmergencyClick?: () => void
}

export function GuestWorkspace({ onOpenAuth, onEmergencyClick }: GuestWorkspaceProps) {
  const [guestView, setGuestView] = useState<View>('home')
  const scrollRef = useScrollAnimation()

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
          <span className="brand-spark">
            <IonIcon icon={sparkles} />
          </span>
          <div className="brand-copy">
            <span className="brand-name">LS Customs</span>
            <span className="brand-tagline">AUTOMOTIVE & FLEET</span>
          </div>
        </div>

        <div className="sidebar-label">MY WORKSPACE</div>
        <nav className="side-nav">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              className={guestView === id ? 'nav-item active' : 'nav-item'}
              key={id}
              onClick={() => navigateGuest(id)}
            >
              <span className="nav-icon-wrapper">
                <Icon size={18} strokeWidth={1.8} />
              </span>
              <span className="nav-label-text">{label}</span>
            </button>
          ))}
        </nav>

        {/* Dynamic Emergency Mechanic Button */}
        <div className="emergency-button-container">
          <button
            className="emergency-button"
            onClick={() => onEmergencyClick ? onEmergencyClick() : onOpenAuth('sign-in')}
            type="button"
            aria-label="Request Emergency Mechanic Roadside Dispatch"
          >
            <div className="emergency-btn-shimmer" />
            <div className="emergency-beacon-wrapper">
              <span className="beacon-ping" />
              <span className="beacon-core" />
            </div>
            <span className="emergency-icon">
              <IonIcon icon={warningOutline} className="emergency-icon-pulse" style={{ fontSize: '18px' }} />
            </span>
            <div className="emergency-text-col">
              <div className="emergency-title-row">
                <strong>Emergency Mechanic</strong>
                <span className="emergency-pill-tag">SOS</span>
              </div>
              <small>Instant 24/7 Roadside SOS</small>
            </div>
          </button>
        </div>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => navigateTo('/help')}>
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
          <div className={`guest-page ${scrollRef.className}`} ref={scrollRef.ref as React.RefObject<HTMLDivElement>}>
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
            <div className="guest-panels stagger-children">
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
