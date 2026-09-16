/**
 * Sidebar — persistent navigation drawer with workspace items,
 * live fleet dispatch status indicator, and dynamic emergency mechanic button.
 */
import { useState } from 'react'
import { CircleHelp, ChevronRight } from 'lucide-react'
import { IonIcon } from '@ionic/react'
import { sparkles, warningOutline, radioOutline } from 'ionicons/icons'
import { navItems } from '../../data/navigation'
import type { View } from '../../types'
import { navigateTo } from '../../utils/navigation'
import { EmergencyMechanicModal, type EmergencyDispatchData } from '../common/EmergencyMechanicModal'

interface SidebarProps {
  view: View
  menuOpen: boolean
  displayName: string
  initials: string
  userId?: string
  onView: (view: View) => void
  onNotify: (message: string) => void
  onSignOut: () => void
  unreadCount: number
  onEmergencyClick?: () => void
  activeDispatch?: EmergencyDispatchData | null
  setActiveDispatch?: (dispatch: EmergencyDispatchData | null) => void
}

export function Sidebar({
  view,
  menuOpen,
  userId,
  onView,
  onNotify,
  onSignOut,
  unreadCount,
  onEmergencyClick,
  activeDispatch: parentActiveDispatch,
  setActiveDispatch: parentSetActiveDispatch,
}: SidebarProps) {
  // Local fallback state if parent does not manage dispatch state directly
  const [internalModalOpen, setInternalModalOpen] = useState(false)
  const [internalActiveDispatch, setInternalActiveDispatch] = useState<EmergencyDispatchData | null>(null)

  const activeDispatch = parentActiveDispatch !== undefined ? parentActiveDispatch : internalActiveDispatch
  const setActiveDispatch = parentSetActiveDispatch ?? setInternalActiveDispatch

  const handleEmergencyClick = () => {
    if (onEmergencyClick) {
      onEmergencyClick()
    } else {
      setInternalModalOpen(true)
    }
  }

  return (
    <>
      <aside className={`sidebar ${menuOpen ? 'is-open' : ''}`}>
        {/* Brand Mark with glowing spark micro-interaction */}
        <div className="brand-mark" onClick={() => onView('home')} role="button" tabIndex={0}>
          <span className="brand-spark">
            <IonIcon icon={sparkles} />
          </span>
          <div className="brand-copy">
            <span className="brand-name">LS Customs</span>
            <span className="brand-tagline">AUTOMOTIVE & FLEET</span>
          </div>
        </div>

        {/* Live Fleet Dispatch Status Indicator */}
        <div className="sidebar-fleet-status">
          <div className="fleet-status-radar">
            <span className="radar-wave" />
            <span className="radar-dot" />
          </div>
          <div className="fleet-status-info">
            <span className="fleet-label">FLEET RADAR ACTIVE</span>
            <small className="fleet-sub">12 Mobile Units on Patrol</small>
          </div>
          <span className="fleet-badge">24/7</span>
        </div>

        <div className="sidebar-label">MY WORKSPACE</div>
        <nav className="side-nav">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              className={view === id ? 'nav-item active' : 'nav-item'}
              key={id}
              onClick={() => onView(id)}
            >
              <span className="nav-icon-wrapper">
                <Icon size={18} strokeWidth={1.8} />
              </span>
              <span className="nav-label-text">{label}</span>
              {id === 'bookings' && unreadCount > 0 && <span className="nav-count">{unreadCount}</span>}
              {view === id && <span className="nav-active-pill" />}
            </button>
          ))}
        </nav>

        {/* ── Dynamic Emergency Mechanic Button ─────────────────── */}
        <div className="emergency-button-container">
          <button
            className={`emergency-button ${activeDispatch ? 'is-active-dispatch' : ''}`}
            onClick={handleEmergencyClick}
            type="button"
            aria-label="Open Emergency Mechanic Roadside Dispatch"
          >
            <div className="emergency-btn-shimmer" />
            
            {/* Pulsing Beacon Light */}
            <div className="emergency-beacon-wrapper">
              <span className="beacon-ping" />
              <span className="beacon-core" />
            </div>

            <span className="emergency-icon">
              {activeDispatch ? (
                <IonIcon icon={radioOutline} className="emergency-icon-spin" style={{ fontSize: '18px' }} />
              ) : (
                <IonIcon icon={warningOutline} className="emergency-icon-pulse" style={{ fontSize: '18px' }} />
              )}
            </span>

            <div className="emergency-text-col">
              <div className="emergency-title-row">
                <strong>{activeDispatch ? 'UNIT EN ROUTE' : 'Emergency Mechanic'}</strong>
                <span className={`emergency-pill-tag ${activeDispatch ? 'pill-active' : ''}`}>
                  {activeDispatch ? 'LIVE ETA' : 'SOS'}
                </span>
              </div>
              <small>
                {activeDispatch
                  ? `${activeDispatch.mechanic.unit} • Tap to view`
                  : 'Instant Roadside Dispatch'}
              </small>
            </div>
          </button>
        </div>

        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => navigateTo('/help')}>
            <span className="nav-icon-wrapper">
              <CircleHelp size={18} />
            </span>
            <span className="nav-label-text">Help Center</span>
          </button>
          <button className="signout" onClick={onSignOut}>
            <span>Sign out</span>
            <ChevronRight size={15} />
          </button>
        </div>
      </aside>

      {/* Internal Emergency Modal if Sidebar is managing its own instance */}
      {!onEmergencyClick && (
        <EmergencyMechanicModal
          open={internalModalOpen}
          onClose={() => setInternalModalOpen(false)}
          onNotify={onNotify}
          userId={userId}
          activeDispatch={internalActiveDispatch}
          setActiveDispatch={setInternalActiveDispatch}
          onViewBookings={() => onView('bookings')}
        />
      )}
    </>
  )
}
