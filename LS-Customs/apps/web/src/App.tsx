/**
 * App — root component. Thin orchestrator that manages global state
 * (view routing, admin routes, toast, cart, sign-out) and delegates rendering to
 * small, single-purpose child components.
 */
import { useState, useEffect, Component, type ErrorInfo, type ReactNode } from 'react'
import { ShieldCheck, X } from 'lucide-react'
import { supabase } from './supabaseClient'
import { useAuth } from './hooks/useAuth'
import { useAdminAuth } from './hooks/useAdminAuth'
import { navItems } from './data/navigation'
import { Sidebar } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import { WorkspaceFooter } from './components/layout/WorkspaceFooter'
import { SignOutConfirmation } from './components/layout/SignOutConfirmation'
import { AuthModal } from './components/auth/AuthModal'
import { GuestWorkspace } from './components/views/GuestWorkspace'
import { Dashboard } from './components/views/Dashboard'
import { Rentals } from './components/views/Rentals'
import { MechanicServices } from './components/views/MechanicServices'
import { Bookings } from './components/views/Bookings'
import { Profile } from './components/views/Profile'
import { ChatBot } from './components/chat/ChatBot'
import { AdminLayout } from './components/admin/AdminLayout'
import { AdminLogin } from './components/admin/AdminLogin'
import { TicketRealtimeProvider } from './components/common/TicketRealtimeProvider'
import type { View } from './types'

type AppMode = 'customer' | 'admin' | 'admin-login'

/**
 * RootErrorBoundary — last-resort safety net for the whole app.
 *
 * The admin and customer trees each have their own narrower error
 * boundaries (see AdminBookingDetail, MapBoundary), but a throw outside
 * those (e.g. a useEffect that crashes, a missing module) would
 * otherwise unmount the whole React tree and leave the user with a
 * blank white page. This boundary catches anything that escapes, logs
 * the cause, and shows a small "Something went wrong" panel with a
 * Reload button so the user is never stranded.
 */
class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[App] uncaught error:', error, info)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0f1320',
            color: '#d4d9e6',
            padding: 24,
            fontFamily: 'DM Sans, sans-serif',
            textAlign: 'center',
            gap: 12,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 600 }}>Something went wrong.</div>
          <div style={{ fontSize: 13, color: '#9ca3af', maxWidth: 420 }}>
            The page crashed before it could render. Reload to try again.
          </div>
          {import.meta.env.DEV && this.state.error?.message && (
            <div
              style={{
                fontSize: 11,
                color: '#6b7280',
                maxWidth: 480,
                fontFamily: 'monospace',
                padding: 8,
                border: '1px solid #2d3748',
                borderRadius: 6,
              }}
            >
              {this.state.error.message}
            </div>
          )}
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              marginTop: 8,
              padding: '10px 18px',
              background: '#e8a838',
              color: '#0f1320',
              border: 0,
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export function App() {
  const { signedIn, userId, identity, authLoading, authMode, authOpen, setAuthMode, setAuthOpen, openAuth } = useAuth()
  const adminAuth = useAdminAuth()

  // App mode determined by URL path or state
  const [appMode, setAppMode] = useState<AppMode>(() => {
    const path = window.location.pathname
    if (path.startsWith('/admin/login')) return 'admin-login'
    if (path.startsWith('/admin')) return 'admin'
    return 'customer'
  })

  const [view, setView] = useState<View>('home')
  const [menuOpen, setMenuOpen] = useState(false)
  const [cartCount, setCartCount] = useState(1)
  const [toast, setToast] = useState('')
  const [confirmSignOut, setConfirmSignOut] = useState(false)

  // Listen to browser forward/back buttons
  useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname
      if (path.startsWith('/admin/login')) {
        setAppMode('admin-login')
      } else if (path.startsWith('/admin')) {
        setAppMode('admin')
      } else {
        setAppMode('customer')
      }
    }

    window.addEventListener('popstate', handleLocationChange)
    return () => window.removeEventListener('popstate', handleLocationChange)
  }, [])

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

  const addService = (name: string) => {
    setCartCount((count) => count + 1)
    notify(`${name} added to your service cart`)
  }

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      notify(error.message)
      return
    }
    setView('home')
    notify('You have been signed out')
  }

  // ── Render Admin Portal ───────────────────────────────────────
  if (appMode === 'admin-login' || (appMode === 'admin' && !adminAuth.isAuthenticated)) {
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

  // ── Render Customer App ───────────────────────────────────────
  if (authLoading) {
    return (
      <RootErrorBoundary>
        <div className="auth-loading">Loading LS Customs...</div>
      </RootErrorBoundary>
    )
  }

  if (!signedIn) {
    return (
      <RootErrorBoundary>
        <>
          <GuestWorkspace onOpenAuth={openAuth} />
          {authOpen && (
            <AuthModal
              mode={authMode}
              onModeChange={setAuthMode}
              onClose={() => setAuthOpen(false)}
              onAuthenticated={() => {
                setAuthOpen(false)
                setView('home')
              }}
            />
          )}
        </>
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
            cartCount={cartCount}
            displayName={identity.displayName}
            initials={identity.initials}
            onView={(v) => { setView(v); setMenuOpen(false) }}
            onNotify={notify}
            onSignOut={() => setConfirmSignOut(true)}
          />

          <main className="main-content">
            <Header
              view={view}
              menuOpen={menuOpen}
              displayName={identity.displayName}
              initials={identity.initials}
              onToggleMenu={() => setMenuOpen((open) => !open)}
              onView={setView}
              onNotify={notify}
            />

            {view === 'home' && (
              <Dashboard
                displayName={identity.displayName}
                initials={identity.initials}
                onView={setView}
                onNotify={notify}
              />
            )}
            {view === 'rentals' && <Rentals onNotify={notify} />}
            {view === 'services' && (
              <MechanicServices cartCount={cartCount} onAdd={addService} onNotify={notify} />
            )}
            {view === 'bookings' && <Bookings onNotify={notify} />}
            {view === 'profile' && (
              <Profile
                userId={userId}
                displayName={identity.displayName}
                email={identity.displayEmail}
                initials={identity.initials}
                onNotify={notify}
              />
            )}

            <WorkspaceFooter onNotify={notify} />
          </main>

          <nav className="mobile-nav">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={view === id ? 'active' : ''}
                onClick={() => setView(id)}
              >
                <Icon size={19} />
                <span>{label === 'Workspace' ? 'Home' : label}</span>
              </button>
            ))}
          </nav>

          {toast && (
            <div className="toast">
              <ShieldCheck size={17} />{' '}
              {toast}
              <button onClick={() => setToast('')} aria-label="Dismiss">
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

          <ChatBot userId={userId} onNotify={notify} />
        </div>
      </TicketRealtimeProvider>
    </RootErrorBoundary>
  )
}
