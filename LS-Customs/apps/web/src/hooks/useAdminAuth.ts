/**
 * useAdminAuth — manages admin authentication and role validation.
 * Only users with 'admin' role can access the admin dashboard.
 * Uses standard Supabase Auth (email + password) — no hardcoded credentials.
 * The admin is a real Supabase Auth user with profiles.role = 'admin'.
 *
 * IMPORTANT: This hook reads the shared Supabase session. It must NEVER call
 * supabase.auth.signOut() based on a non-admin role check — that would log out
 * the currently signed-in customer too, since they share the same client.
 * Authorization for the admin route is enforced by App.tsx via the local
 * `isAuthenticated` flag, not by mutating the global session.
 */
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import type { Session } from '@supabase/supabase-js'

export type AdminRole = 'admin' | null

interface UseAdminAuthReturn {
  isAuthenticated: boolean
  isLoading: boolean
  role: AdminRole
  userName: string
  userEmail: string
  userId: string | null
  error: string | null
  signIn: (email: string, password: string) => Promise<boolean>
  signOut: () => Promise<void>
}

export function useAdminAuth(): UseAdminAuthReturn {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [role, setRole] = useState<AdminRole>(null)
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function checkSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!mounted) return

        if (session?.user) {
          const userRole = await resolveRole(session)
          applyAdminSession(userRole, session, false)
        }
      } catch {
        // Session check failed
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    void checkSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return
      if (session?.user) {
        const userRole = await resolveRole(session)
        applyAdminSession(userRole, session, false)
      } else {
        clearAdminSession()
      }
      if (mounted) setIsLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  function applyAdminSession(userRole: AdminRole, session: Session, signedInNow: boolean) {
    if (userRole === 'admin') {
      setIsAuthenticated(true)
      setRole(userRole)
      setUserId(session.user.id)
      const name = resolveDisplayName(session)
      setUserName(name)
      setUserEmail(session.user.email || '')
      sessionStorage.setItem('lsc_admin_auth', 'true')
      sessionStorage.setItem('lsc_admin_role', userRole)
      sessionStorage.setItem('lsc_admin_user', name)
      sessionStorage.setItem('lsc_admin_email', session.user.email || '')
    } else {
      // Non-admin session present (or no role). The admin dashboard is gated
      // by `isAuthenticated`, so we just keep local state clean here. We do
      // NOT call supabase.auth.signOut() — that would also sign out the
      // current customer if they happen to be the active session user.
      clearAdminSession()
      if (signedInNow) {
        setError('Access denied. Admin privileges required.')
      }
    }
  }

  function clearAdminSession() {
    setIsAuthenticated(false)
    setRole(null)
    setUserId(null)
    setUserName('')
    setUserEmail('')
  }

  async function resolveRole(session: Session): Promise<AdminRole> {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle()

      if (profile?.role === 'admin') {
        return 'admin'
      }
    } catch {
      // Role resolution failed
    }
    return null
  }

  function resolveDisplayName(session: Session): string {
    const metadata = session.user.user_metadata as { full_name?: string; name?: string }
    return metadata?.full_name || metadata?.name || session.user.email?.split('@')[0] || 'Admin'
  }

  async function signIn(email: string, password: string): Promise<boolean> {
    setError(null)
    setIsLoading(true)

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) {
        setError(authError.message)
        setIsLoading(false)
        return false
      }

      if (data.session) {
        const userRole = await resolveRole(data.session)
        if (userRole === 'admin') {
          applyAdminSession(userRole, data.session, false)
          setIsLoading(false)
          return true
        } else {
          // Wrong role for admin login. Do not mutate the global session —
          // the customer app may be using it. Just refuse locally.
          clearAdminSession()
          setError('Access denied. Admin privileges required.')
          setIsLoading(false)
          return false
        }
      }

      setIsLoading(false)
      return false
    } catch {
      setError('An unexpected error occurred. Please try again.')
      setIsLoading(false)
      return false
    }
  }

  async function signOut(): Promise<void> {
    // Only sign out of the global session if WE are the active admin session.
    // Otherwise we'd accidentally log out a customer who happens to be
    // signed in to the customer app.
    if (isAuthenticated) {
      try {
        await supabase.auth.signOut()
      } catch {
        // Ignore
      }
    }
    sessionStorage.removeItem('lsc_admin_auth')
    sessionStorage.removeItem('lsc_admin_role')
    sessionStorage.removeItem('lsc_admin_user')
    sessionStorage.removeItem('lsc_admin_email')
    clearAdminSession()
  }

  return {
    isAuthenticated,
    isLoading,
    role,
    userName,
    userEmail,
    userId,
    error,
    signIn,
    signOut,
  }
}
