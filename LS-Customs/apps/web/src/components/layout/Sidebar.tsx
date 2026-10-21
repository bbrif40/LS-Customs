import { useWebsiteText } from "../../hooks/useWebsiteText"
/**
 * Sidebar — persistent navigation drawer with workspace items,
 * live fleet dispatch status indicator, and dynamic emergency mechanic button.
 */
import { useState } from 'react'
import { CircleHelp, ChevronRight } from 'lucide-react'
import { IonIcon } from '@ionic/react'
import { sparkles, warningOutline, radioOutline } from 'ionicons/icons'
import { navItems } from '../../data/navigation'
import { useCustomerSiteSettings } from '../../hooks/useCustomerSiteSettings'
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
  activeBookingsCount?: number
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
  activeBookingsCount,
  onEmergencyClick,
  activeDispatch: parentActiveDispatch,
  setActiveDispatch: parentSetActiveDispatch,
}: SidebarProps) {
  const websiteText = useWebsiteText("Navigation")

  const { settings } = useCustomerSiteSettings()
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
      {menuOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => onView(view)}
          aria-hidden="true"
        />
      )}
      <aside className={`sidebar ${menuOpen ? 'is-open' : ''}`}>
        {/* Brand Mark with glowing spark micro-interaction */}
        <div
          className="brand-mark"
          onClick={() => onView('home')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onView('home') } }}
          role="button"
          tabIndex={0}
          aria-label={websiteText("{value1} home", { value1: String(settings.companyName || 'LS Customs') })}
        >
          <img
            src="/logo.png"
            alt={websiteText("LS Customs", undefined, settings.companyName || 'LS Customs')}
            className="brand-logo-img"
            style={{ width: 34, height: 34, objectFit: 'contain', flexShrink: 0 }}
          />
          <div className="brand-copy">
            <span className="brand-name">{websiteText("LS Customs", undefined, settings.companyName || 'LS Customs')}</span>
            <span className="brand-tagline">{websiteText("AUTOMOTIVE & FLEET")}</span>
          </div>
        </div>

        <div className="sidebar-label">{websiteText("MY WORKSPACE")}</div>
        <nav className="side-nav" role="navigation" aria-label={websiteText("Main navigation")}>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              className={view === id ? 'nav-item active' : 'nav-item'}
              key={id}
              onClick={() => onView(id)}
              aria-current={view === id ? 'page' : undefined}
            >
              <span className="nav-icon-wrapper">
                <Icon size={18} strokeWidth={1.8} />
              </span>
              <span className="nav-label-text">{websiteText(label)}</span>
              {id === 'bookings' && (activeBookingsCount !== undefined ? activeBookingsCount > 0 : unreadCount > 0) && (
                <span className="nav-count" aria-label={websiteText("Active bookings count")}>
                  {activeBookingsCount !== undefined ? activeBookingsCount : unreadCount}
                </span>
              )}
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
            aria-label={websiteText("Open Emergency Mechanic Roadside Dispatch")}
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
                <strong>{activeDispatch ? websiteText("ACTIVE REQUEST") : websiteText("Emergency Mechanic")}</strong>
                <span className={`emergency-pill-tag ${activeDispatch ? 'pill-active' : ''}`}>
                  {activeDispatch ? websiteText("STATUS") : websiteText("SOS")}
                </span>
              </div>
              <small>
                {activeDispatch
                  ? websiteText("{value1} • Tap to view", { value1: String(activeDispatch.mechanic.unit) })
                  : websiteText("Request roadside assistance")}
              </small>
            </div>
          </button>
        </div>


        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => navigateTo('/help')}>
            <span className="nav-icon-wrapper">
              <CircleHelp size={18} />
            </span>
            <span className="nav-label-text">{websiteText("Help Center")}</span>
          </button>
          <button className="signout" onClick={onSignOut}>
            <span>{websiteText("Sign out")}</span>
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

