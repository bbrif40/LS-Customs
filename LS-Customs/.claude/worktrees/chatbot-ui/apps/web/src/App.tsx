/**
 * App — root component. Thin orchestrator that manages global state
 * (view routing, toast, cart, sign-out) and delegates rendering to
 * small, single-purpose child components.
 */
import { useState } from 'react'
import { ShieldCheck, X } from 'lucide-react'
import { supabase } from './supabaseClient'
import { useAuth } from './hooks/useAuth'
import { navItems } from './data/navigation'
import { Sidebar } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import { WorkspaceFooter } from './components/layout/WorkspaceFooter'
import { SignOutConfirmation } from './components/layout/SignOutConfirmation'
import { AuthModal } from './components/auth/AuthModal'
import { GuestWorkspace } from './components/views/GuestWorkspace'
import { SignedOutLanding } from './components/views/SignedOutLanding'
import { Dashboard } from './components/views/Dashboard'
import { Rentals } from './components/views/Rentals'
import { MechanicServices } from './components/views/MechanicServices'
import { Bookings } from './components/views/Bookings'
import { Profile } from './components/views/Profile'
import { ChatBot } from './components/chat/ChatBot'
import type { View } from './types'

export function App() {
  const { signedIn, userId, identity, authLoading, authMode, authOpen, setAuthMode, setAuthOpen, openAuth } = useAuth()
  const [view, setView] = useState<View>('home')
  const [menuOpen, setMenuOpen] = useState(false)
  const [cartCount, setCartCount] = useState(1)
  const [toast, setToast] = useState('')
  const [confirmSignOut, setConfirmSignOut] = useState(false)

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

  if (authLoading) {
    return <div className="auth-loading">Loading LS Customs...</div>
  }

  if (!signedIn) {
    return (
      <>
        <SignedOutLanding onOpenAuth={openAuth} />
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
    )
  }

  return (
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
  )
}
