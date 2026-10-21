import { useWebsiteText } from "./hooks/useWebsiteText"
import { clearBookingDrafts } from './utils/bookingDraft'
import { LoadingMessage } from './components/common/LoadingMessage'
/**
 * App â€” root component. Thin orchestrator that manages global state
 * (view routing, admin routes, toast, cart, sign-out) and delegates rendering to
 * small, single-purpose child components.
 */
import { useState, useEffect, useCallback, lazy, Component, type ErrorInfo, type ReactNode } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { SplashScreen } from '@capacitor/splash-screen'
import { X, AlertTriangle, RefreshCw, Home, ChevronDown, Copy, Check } from 'lucide-react'
import './status-screens.css'
import './assistant-handoff.css'
import { supabase } from './supabaseClient'
import { useAuth } from './hooks/useAuth'
import { useAdminAuth } from './hooks/useAdminAuth'
import { navItems } from './data/navigation'
import { usePageSlide } from './hooks/usePageSlide'
import { Sidebar } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import { WorkspaceFooter } from './components/layout/WorkspaceFooter'
import { SignOutConfirmation } from './components/layout/SignOutConfirmation'
import { AuthModal } from './components/auth/AuthModal'
import { GuestWorkspace } from './components/views/GuestWorkspace'
import { Dashboard } from './components/views/Dashboard'
import { Rentals } from './components/views/Rentals'
const MechanicBookingFlow = lazy(() => import('./components/views/mechanic/MechanicBookingFlow').then(module => ({ default: module.MechanicBookingFlow })))
import { ActiveBookingTracker } from './components/views/mechanic/ActiveBookingTracker'
const Bookings = lazy(() => import('./components/views/Bookings').then(module => ({ default: module.Bookings })))
const Profile = lazy(() => import('./components/views/Profile').then(module => ({ default: module.Profile })))
import { ChatBot } from './components/chat/ChatBot'
import { PublicLayout } from './components/layout/PublicLayout'
const AdminLayout = lazy(() => import('./components/admin/AdminLayout').then(module => ({ default: module.AdminLayout })))
import { AdminLogin } from './components/admin/AdminLogin'
const CustomerSettingsEditor = lazy(() => import('./components/admin/CustomerSettingsEditor').then(module => ({ default: module.CustomerSettingsEditor })))
import { TicketRealtimeProvider } from './components/common/TicketRealtimeProvider'
import { AccountSetup } from './components/AccountSetup'
import { HelpCenter } from './pages/public/HelpCenter'
import { ContactSupport } from './pages/public/ContactSupport'
import { Terms } from './pages/public/Terms'
import { PrivacyPolicy } from './pages/public/PrivacyPolicy'
import { Faqs } from './pages/public/Faqs'
import { Documentation } from './pages/public/Documentation'
import { EmergencyMechanicModal, type EmergencyDispatchData } from './components/common/EmergencyMechanicModal'
import type { View, PublicView, ChatRecommendation } from './types'
import { useCustomerNotifications } from './hooks/useCustomerNotifications'
import { useCustomerActiveBookingsCount } from './hooks/useCustomerBookings'
import { MechanicDispatch } from './components/views/MechanicDispatch'

/** Maps URL path prefixes to their public page view. */
const PUBLIC_ROUTES: { prefix: string; view: PublicView }[] = [
  { prefix: '/help', view: 'help' },
  { prefix: '/contact', view: 'contact' },
  { prefix: '/terms', view: 'terms' },
  { prefix: '/privacy', view: 'privacy' },
  { prefix: '/faqs', view: 'faqs' },
  { prefix: '/docs', view: 'docs' },
]

/** Resolve the public view from a URL path, or null if not a public route. */
const resolvePublicView = (path: string): PublicView | null => {
  for (const { prefix, view } of PUBLIC_ROUTES) {
    if (path === prefix || path.startsWith(prefix + '/')) return view
  }
  return null
}

type AppMode = 'customer' | 'admin' | 'admin-login' | 'public'

/**
 * RootErrorBoundary â€” last-resort safety net for the whole app.
 *
 * The admin and customer trees each have their own narrower error
 * boundaries (see AdminBookingDetail, MapBoundary), but a throw outside
 * those (e.g. a useEffect that crashes, a missing module) would
 * otherwise unmount the whole React tree and leave the user with a
 * blank white page. This boundary catches anything that escapes, logs
 * the cause, and shows a small "Something went wrong" panel with a
 * Reload button so the user is never stranded.
 */
class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; copied: boolean }> {
  state = { error: null as Error | null, copied: false }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[App] uncaught error:', error, info)
  }

  handleRetry = () => {
    // React.lazy caches rejected imports. A fresh document also loads the
    // current deployment's asset URLs instead of retrying a stale chunk.
    window.location.reload()
  }

  handleReload = () => {
    window.location.reload()
  }

  handleHome = () => {
    window.location.href = '/'
  }

  handleCopy = () => {
    const err = this.state.error
    if (!err) return
    const report = `${err.name}: ${err.message}\n\nURL: ${window.location.href}\nTime: ${new Date().toISOString()}\n\n${err.stack ?? ''}`
    navigator.clipboard?.writeText(report).then(
      () => this.setState({ copied: true }),
      () => undefined,
    )
  }

  render() {
    const { error, copied } = this.state
    if (error) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      return (
        <main className="ls-screen ls-screen--error">
          <section className="ls-card ls-card--wide" role="alert" aria-labelledby="app-error-title">
            <div className="ls-brand">
              <img src="/logo.png" alt="" className="ls-brand-logo" /> LS Customs
            </div>

            <div className="ls-icon-badge ls-icon-badge--error" aria-hidden="true">
              <AlertTriangle size={26} />
            </div>

            <h1 id="app-error-title" className="ls-title">
              {offline ? "You're offline" : 'Something went wrong'}
            </h1>
            <p className="ls-subtitle">
              {offline
                ? 'We lost your internet connection. Reconnect and try again â€” your bookings are safe.'
                : "We hit an unexpected problem loading this page. Don't worry, your account and bookings are safe. Try again, or head back home."}
            </p>

            <div className="ls-actions ls-actions--row">
              <button id="app-error-retry" type="button" className="ls-btn ls-btn--primary" onClick={this.handleRetry}>
                <RefreshCw size={17} /> Try again
              </button>
              <button id="app-error-home" type="button" className="ls-btn ls-btn--ghost" onClick={this.handleHome}>
                <Home size={17} /> Go home
              </button>
            </div>
            <div className="ls-actions" style={{ marginTop: 6 }}>
              <button id="app-error-reload" type="button" className="ls-btn ls-btn--link" onClick={this.handleReload}>
                Still stuck? Reload the page
              </button>
            </div>

            {error.message && (
              <details className="ls-details">
                <summary>
                  Technical details <ChevronDown size={15} />
                </summary>
                <pre>{error.name}: {error.message}</pre>
                <button id="app-error-copy" type="button" className="ls-details-copy" onClick={this.handleCopy}>
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'Copied' : 'Copy error report'}
                </button>
              </details>
            )}

            <p className="ls-footnote">
              Keeps happening? <a href="/contact">Contact support</a>
            </p>
          </section>
        </main>
      )
    }
    return this.props.children
  }
}

export function App() {
  const websiteText = useWebsiteText("Shared")

  const { signedIn, userId, identity, authLoading, profileChecked, authMode, authOpen, setAuthMode, setAuthOpen, openAuth } = useAuth()
  const adminAuth = useAdminAuth()

  // App mode determined by URL path or state
  const [appMode, setAppMode] = useState<AppMode>(() => {
    const path = window.location.pathname
    if (path.startsWith('/admin/login')) return 'admin-login'
    if (path.startsWith('/admin')) return 'admin'
    if (resolvePublicView(path)) return 'public'
    return 'customer'
  })

  const [publicView, setPublicView] = useState<PublicView>(() => resolvePublicView(window.location.pathname) ?? 'help')

  const [view, setViewState] = useState<View>(() => {
    const path = window.location.pathname
    if (path === '/services' || path.startsWith('/services')) return 'services'
    if (path === '/rentals' || path.startsWith('/rentals')) return 'rentals'
    if (path === '/bookings' || path === '/tracker' || path.startsWith('/bookings')) return 'bookings'
    if (path === '/profile' || path.startsWith('/profile')) return 'profile'
    return 'home'
  })
  const setView = useCallback((next: View) => {
    const paths: Record<View, string> = { home: '/', rentals: '/rentals', services: '/services', bookings: '/bookings', profile: '/profile' }
    if (window.location.pathname !== paths[next]) window.history.pushState({}, '', paths[next])
    setViewState(next)
  }, [])
  const [menuOpen, setMenuOpen] = useState(false)
  const pageSlideRef = usePageSlide(navItems.findIndex(item => item.id === view), ':scope > :not(header):not(footer)')
  const [toast, setToast] = useState('')
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  // Legacy simple toast used for sign-out and admin flows; most other
  // notifications now go through ToastProvider/useToast instead.
  // Set by Header when the user clicks a notification tied to a specific
  // booking. Bookings reads this to expand the matching card.
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('booking_id'))
  const { unreadCount } = useCustomerNotifications(userId, 'nav')
  const activeBookingsCount = useCustomerActiveBookingsCount(userId)
  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false)
  const [activeEmergencyDispatch, setActiveEmergencyDispatch] = useState<EmergencyDispatchData | null>(null)
  const [preselectedBookingDate, setPreselectedBookingDate] = useState<string | null>(null)
  const [preselectedServiceId, setPreselectedServiceId] = useState<string | null>(null)
  const [assistantSelection, setAssistantSelection] = useState<(ChatRecommendation & { requestId: string }) | null>(null)
  useEffect(() => {
    if (!assistantSelection) return
    const destination = assistantSelection.kind === 'vehicle' ? 'rentals' : 'services'
    if (view !== destination) {
      setAssistantSelection(null)
      if (assistantSelection.kind === 'service') setPreselectedServiceId(null)
    }
  }, [view, assistantSelection])

  useEffect(() => {
    if (!authLoading) {
      SplashScreen.hide().catch(console.error)
    }
  }, [authLoading])

  // Listen to browser forward/back buttons and deep links
  useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname
      if (path.startsWith('/admin/login')) {
        setAppMode('admin-login')
      } else if (path.startsWith('/admin')) {
        setAppMode('admin')
      } else if (resolvePublicView(path)) {
        setAppMode('public')
        setPublicView(resolvePublicView(path) ?? 'help')
      } else {
        setAppMode('customer')
        if (path === '/services' || path.startsWith('/services')) {
          setViewState('services')
        } else if (path === '/rentals' || path.startsWith('/rentals')) {
          setViewState('rentals')
        } else if (path === '/bookings' || path === '/tracker' || path.startsWith('/bookings')) {
          setViewState('bookings')
        } else if (path === '/profile' || path.startsWith('/profile')) {
          setViewState('profile')
        } else if (path === '/' || path === '/home') {
          setViewState('home')
        }
      }
    }

    window.addEventListener('popstate', handleLocationChange)

    const urlListener = CapacitorApp.addListener('appUrlOpen', async (event) => {
      const url = new URL(event.url)
      // Pass the custom scheme URL (like com.lscustoms.app://login#access_token=...) to Supabase
      if (url.hash || url.search) {
        // We only care if there is an auth token in the hash or query string
        window.location.hash = url.hash
        window.location.search = url.search
        // Supabase will automatically pick it up and process it via the onAuthStateChange listener

        try {
          const { Browser } = await import('@capacitor/browser')
          await Browser.close()
        } catch (err) {
          console.error('Failed to close browser:', err)
        }
      }
    })

    return () => {
      window.removeEventListener('popstate', handleLocationChange)
      urlListener.then(listener => listener.remove())
    }
  }, [])

  // Redirect non-admins away from admin routes
  useEffect(() => {
    if (signedIn && identity.role && identity.role !== 'admin' && (appMode === 'admin' || appMode === 'admin-login')) {
      // Prevent non-admins from accessing admin routes
      navigateTo('customer')
      notify('Access denied. Admin privileges required.')
    }
  }, [signedIn, identity.role, appMode])

  const navigateTo = (mode: AppMode) => {
    setAppMode(mode)
    if (mode === 'admin') {
      window.history.pushState({}, '', '/admin')
    } else if (mode === 'admin-login') {
      window.history.pushState({}, '', '/admin/login')
    } else {
      window.history.pushState({}, '', '/')
    }
  }

  // Toast helper
  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2500)
  }

  const openAssistantRecommendation = (recommendation: ChatRecommendation) => {
    if (!recommendation.id || !['vehicle', 'service'].includes(recommendation.kind)) return
    setAssistantSelection({ ...recommendation, requestId: crypto.randomUUID() })
    setPreselectedBookingDate(null)
    setPreselectedServiceId(recommendation.kind === 'service' ? recommendation.id : null)
    setAppMode('customer')
    setView(recommendation.kind === 'vehicle' ? 'rentals' : 'services')
    window.history.pushState({}, '', recommendation.kind === 'vehicle' ? '/rentals' : '/services')
    if (!signedIn) openAuth('sign-in')
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      notify(error.message)
      return
    }
    setAssistantSelection(null)
    setPreselectedServiceId(null)
    setView('home')
    notify('You have been signed out')
  }

  // â”€â”€ Render Admin Portal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (appMode === 'admin-login' || (appMode === 'admin' && !adminAuth.isAuthenticated)) {
    if (adminAuth.isLoading) {
      return (
        <RootErrorBoundary>
          <div className="auth-loading"><LoadingMessage label={websiteText("Opening your command center…")} /></div>
        </RootErrorBoundary>
      )
    }
    return (
      <RootErrorBoundary>
        <AdminLogin
          onAuthenticated={() => navigateTo('admin')}
          onNavigateHome={() => navigateTo('customer')}
        />
      </RootErrorBoundary>
    )
  }

  if (appMode === 'admin' && adminAuth.isAuthenticated) {
    return (
      <RootErrorBoundary>
        <TicketRealtimeProvider userId={adminAuth.userId ?? null} userRole="admin">
          <AdminLayout
            userName={adminAuth.userName}
            onSignOut={async () => {
              await adminAuth.signOut()
              navigateTo('admin-login')
            }}
          />
        </TicketRealtimeProvider>
      </RootErrorBoundary>
    )
  }

  // â”€â”€ Render Public Content Pages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (appMode === 'public') {
    return (
      <RootErrorBoundary>
        <PublicLayout publicView={publicView} onRecommendation={openAssistantRecommendation}>
          {publicView === 'help' && <HelpCenter />}
          {publicView === 'contact' && <ContactSupport />}
          {publicView === 'terms' && <Terms />}
          {publicView === 'privacy' && <PrivacyPolicy />}
          {publicView === 'faqs' && <Faqs />}
          {publicView === 'docs' && <Documentation />}
        </PublicLayout>
      </RootErrorBoundary>
    )
  }

  // â”€â”€ Render Customer App â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (authLoading) {
    return (
      <RootErrorBoundary>
        <main className="ls-screen" aria-busy="true">
          <div className="ls-loader">
            <div className="ls-loader-ring">
              <img src="/logo.png" alt={websiteText("LS Customs")} className="ls-loader-logo" />
            </div>
            <span className="ls-loader-text">{websiteText("Loading LS Customs")}</span>
          </div>
        </main>
      </RootErrorBoundary>
    )
  }

  if (!signedIn) {
    return (
      <RootErrorBoundary>
        <>
          <GuestWorkspace
            onOpenAuth={openAuth}
            onEmergencyClick={() => setEmergencyModalOpen(true)}
          />
          <ChatBot userId={undefined} onNotify={notify} onRecommendation={openAssistantRecommendation} />
          {authOpen && (
            <AuthModal
              mode={authMode}
              onModeChange={setAuthMode}
              onClose={() => setAuthOpen(false)}
              onAuthenticated={() => {
                setAuthOpen(false)
                // Preserve the requested page after authentication.
              }}
            />
          )}
          <EmergencyMechanicModal
            open={emergencyModalOpen}
            onClose={() => setEmergencyModalOpen(false)}
            onNotify={notify}
            userId={userId}
            activeDispatch={activeEmergencyDispatch}
            setActiveDispatch={setActiveEmergencyDispatch}
            onViewBookings={() => {
              setEmergencyModalOpen(false)
              openAuth('sign-in')
            }}
          />
        </>
      </RootErrorBoundary>
    )
  }

  // Only ask for a phone once we've *confirmed* the profile has none â€” a
  // failed/slow profile fetch must not trap the user on this screen.
  if (signedIn && userId && profileChecked && !identity.phone) {
    return (
      <RootErrorBoundary>
        <AccountSetup userId={userId} onComplete={() => { if (!assistantSelection) setView('home') }} />
      </RootErrorBoundary>
    )
  }

  return (
    <RootErrorBoundary>
      <TicketRealtimeProvider userId={userId ?? null} userRole="customer">
        <div className="app-frame">
          <Sidebar
            view={view}
            menuOpen={menuOpen}
            displayName={identity.displayName}
            initials={identity.initials}
            userId={userId}
            onView={(v) => { setView(v); setMenuOpen(false) }}
            onNotify={notify}
            onSignOut={() => setConfirmSignOut(true)}
            unreadCount={unreadCount}
            activeBookingsCount={activeBookingsCount}
            onEmergencyClick={() => setEmergencyModalOpen(true)}
            activeDispatch={activeEmergencyDispatch}
            setActiveDispatch={setActiveEmergencyDispatch}
          />

          <main className="main-content" ref={pageSlideRef}>
            <Header
              view={view}
              menuOpen={menuOpen}
              displayName={identity.displayName}
              initials={identity.initials}
              avatarUrl={identity.avatarUrl}
              onToggleMenu={() => setMenuOpen((open) => !open)}
              onView={setView}
              onNotify={notify}
              userId={userId}
              onSelectBooking={(id) => { setSelectedBookingId(id); setView('bookings') }}
            />

            {identity.role === 'mechanic' && userId && <MechanicDispatch userId={userId} />}
            {view === 'home' && (
              <Dashboard
                userId={userId}
                displayName={identity.displayName}
                initials={identity.initials}
                onView={setView}
                onNotify={notify}
                onSelectService={(serviceId) => {
                  setPreselectedServiceId(serviceId)
                  setView('services')
                }}
              />
            )}
            {view === 'rentals' && (
              <Rentals
                key={assistantSelection?.kind === 'vehicle' ? assistantSelection.requestId : 'rentals'}
                userId={userId}
                onNotify={notify}
                initialVehicleId={assistantSelection?.kind === 'vehicle' ? assistantSelection.id : undefined}
                initialStartDate={assistantSelection?.kind === 'vehicle' ? assistantSelection.dates?.start : preselectedBookingDate ?? undefined}
                initialEndDate={assistantSelection?.kind === 'vehicle' ? assistantSelection.dates?.end : undefined}
              />
            )}
            {view === 'services' && (
              <MechanicBookingFlow
                key={assistantSelection?.kind === 'service' ? assistantSelection.requestId : 'services'}
                userId={userId}
                onNotify={notify}
                initialDate={preselectedBookingDate}
                initialServiceId={preselectedServiceId}
                initialServicePreview={assistantSelection?.kind === 'service' && assistantSelection.id === preselectedServiceId}
                onBackToHome={() => {
                  setPreselectedBookingDate(null)
                  setPreselectedServiceId(null)
                  setView('home')
                }}
              />
            )}
            {/* Live-location streamer for the customer's active mechanic
                booking. Renders nothing; just runs the side effect so the
                stream survives navigation away from the Mechanic screen. */}
            {userId && <ActiveBookingTracker userId={userId} />}
            {view === 'bookings' && (
              <Bookings
                userId={userId}
                onNotify={notify}
                onView={(v, options) => {
                  if (options?.date) {
                    setPreselectedBookingDate(options.date)
                  } else if (v !== 'services' && v !== 'rentals') {
                    setPreselectedBookingDate(null)
                  }
                  setView(v)
                }}
                onBookServiceWithDate={(date) => {
                  setPreselectedBookingDate(date)
                  setView('services')
                }}
                onRentCarWithDate={(date) => {
                  setPreselectedBookingDate(date)
                  setView('rentals')
                }}
                selectedBookingId={selectedBookingId}
                onClearSelection={() => setSelectedBookingId(null)}
              />
            )}
            {view === 'profile' && (
              <Profile
                userId={userId}
                displayName={identity.displayName}
                email={identity.displayEmail}
                initials={identity.initials}
                onNotify={notify}
              />
            )}

            <WorkspaceFooter
              onView={setView}
              onNotify={notify}
              onEmergencyClick={() => setEmergencyModalOpen(true)}
            />
          </main>

          <nav className="mobile-nav">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={view === id ? 'active' : ''}
                onClick={() => setView(id)}
              >
                <Icon size={19} />
                <span>{label === 'Workspace' ? websiteText("Home") : label}</span>
              </button>
            ))}
          </nav>

          {toast && (
            <div className="toast">
              {toast}
              <button onClick={() => setToast('')} aria-label={websiteText("Dismiss")}>
                <X size={15} />
              </button>
            </div>
          )}

          {confirmSignOut && (
            <SignOutConfirmation
              onCancel={() => setConfirmSignOut(false)}
              onConfirm={() => {
                setConfirmSignOut(false)
                void handleSignOut()
              }}
            />
          )}

          <ChatBot userId={userId} onNotify={notify} onRecommendation={openAssistantRecommendation} />

          {identity.role === 'admin' && (
            <CustomerSettingsEditor />
          )}

          <EmergencyMechanicModal
            open={emergencyModalOpen}
            onClose={() => setEmergencyModalOpen(false)}
            onNotify={notify}
            userId={userId}
            activeDispatch={activeEmergencyDispatch}
            setActiveDispatch={setActiveEmergencyDispatch}
            onViewBookings={() => {
              setEmergencyModalOpen(false)
              setView('bookings')
            }}
          />
        </div>
      </TicketRealtimeProvider>
    </RootErrorBoundary>
  )
}
