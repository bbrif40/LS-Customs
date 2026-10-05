/**
 * useAuth — manages Supabase session state and user identity extraction.
 * Extracted from App.tsx so auth logic is reusable and testable.
 */
import { useState, useEffect, useRef } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabaseClient'
import type { UserIdentity } from '../types'

interface UseAuthReturn {
  signedIn: boolean
  userId: string | undefined
  identity: UserIdentity
  authLoading: boolean
  /** True once the profile row for the current user was fetched successfully. */
  profileChecked: boolean
  authMode: 'sign-in' | 'create-account'
  authOpen: boolean
  setAuthMode: (mode: 'sign-in' | 'create-account') => void
  setAuthOpen: (open: boolean) => void
  openAuth: (mode?: 'sign-in' | 'create-account') => void
}

export function useAuth(): UseAuthReturn {
  const [signedIn, setSignedIn] = useState(false)
  const [userId, setUserId] = useState<string | undefined>(undefined)
  const [displayName, setDisplayName] = useState('')
  const [displayEmail, setDisplayEmail] = useState('')
  const [initials, setInitials] = useState('LS')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [phone, setPhone] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [profileChecked, setProfileChecked] = useState(false)
  // Monotonic counter so a slow, stale identity fetch can't overwrite a newer one.
  const resolveSeq = useRef(0)
  const [authMode, setAuthMode] = useState<'sign-in' | 'create-account'>('sign-in')
  const [authOpen, setAuthOpen] = useState(false)

  useEffect(() => {
    let mounted = true

    // Keep authLoading true until the profile row has been fetched, otherwise
    // App briefly sees `phone === null` on every refresh and flashes the
    // "Complete Your Profile" screen.
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (!mounted) return
      if (error) {
        console.error('[useAuth] failed to restore session:', error)
        setSignedIn(false)
        setUserId(undefined)
        await resolveIdentity(null)
      } else {
        setSignedIn(Boolean(session))
        setUserId(session?.user?.id)
        await resolveIdentity(session)
      }
      if (mounted) setAuthLoading(false)
    }).catch((error: unknown) => {
      if (!mounted) return
      console.error('[useAuth] session startup failed:', error)
      setSignedIn(false)
      setUserId(undefined)
      void resolveIdentity(null)
      setAuthLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Only act on events that actually change the signed-in state.
      // - TOKEN_REFRESHED fires with the same session; do not reset authLoading/identity.
      // - SIGNED_OUT clears state.
      // - SIGNED_IN / USER_UPDATED / INITIAL_SESSION set state.
      // Without this filter, a stale token (e.g. after a local Supabase restart)
      // causes a transient SIGNED_OUT that immediately logs the user out,
      // even right after they sign in with a different email.
      if (event === 'TOKEN_REFRESHED') {
        return
      }
      setSignedIn(Boolean(session))
      setUserId(session?.user?.id)
      // Don't await inside the auth callback (supabase-js can deadlock);
      // finish loading once the identity fetch settles instead.
      void resolveIdentity(session).finally(() => {
        if (mounted) setAuthLoading(false)
      })
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function resolveIdentity(session: Session | null) {
    const seq = ++resolveSeq.current

    if (!session?.user) {
      setUserId(undefined)
      setDisplayName('')
      setDisplayEmail('')
      setInitials('LS')
      setAvatarUrl(null)
      setRole(null)
      setPhone(null)
      setProfileChecked(false)
      return
    }

    let profile: { full_name?: string | null; avatar_url?: string | null; role?: string | null; phone?: string | null } | null = null
    let profileOk = false
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, role, phone')
        .eq('id', session.user.id)
        .maybeSingle()
      if (error) {
        console.error('[useAuth] failed to load profile:', error)
      } else {
        profile = data
        profileOk = true
      }
    } catch (err) {
      console.error('[useAuth] profile request crashed:', err)
    }

    // A newer resolve started while we were waiting — drop this result.
    if (seq !== resolveSeq.current) return

    const metadata = session.user.user_metadata as { full_name?: string; name?: string; phone?: string }
    const name =
      profile?.full_name ||
      metadata.full_name ||
      metadata.name ||
      session.user.email?.split('@')[0] ||
      'LS Customs user'

    setDisplayName(name)
    setDisplayEmail(session.user.email || '')
    setAvatarUrl(profile?.avatar_url ?? null)
    setRole(profile?.role ?? null)
    // Fall back to the phone on the auth user (phone OTP sign-ups) or metadata.
    setPhone(profile?.phone || session.user.phone || metadata.phone || null)
    setProfileChecked(profileOk)
    setInitials(
      name
        .split(/\s+/)
        .map((part: string) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
    )
  }

  useEffect(() => {
    const handleProfileUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ avatarUrl?: string | null; phone?: string | null }>).detail
      if (!detail) return
      // Only touch fields that were actually included in the event.
      if ('avatarUrl' in detail) setAvatarUrl(detail.avatarUrl ?? null)
      if ('phone' in detail) setPhone(detail.phone ?? null)
    }
    window.addEventListener('ls-profile-updated', handleProfileUpdate)
    return () => window.removeEventListener('ls-profile-updated', handleProfileUpdate)
  }, [])

  const openAuth = (mode: 'sign-in' | 'create-account' = 'sign-in') => {
    setAuthMode(mode)
    setAuthOpen(true)
  }

  return {
    signedIn,
    userId,
    identity: { displayName, displayEmail, initials, avatarUrl, role, phone },
    authLoading,
    profileChecked,
    authMode,
    authOpen,
    setAuthMode,
    setAuthOpen,
    openAuth,
  }
}
