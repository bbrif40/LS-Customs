/**
 * useAuth — manages Supabase session state and user identity extraction.
 * Extracted from App.tsx so auth logic is reusable and testable.
 */
import { useState, useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabaseClient'
import type { UserIdentity } from '../types'

interface UseAuthReturn {
  signedIn: boolean
  userId: string | undefined
  identity: UserIdentity
  authLoading: boolean
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
  const [authLoading, setAuthLoading] = useState(true)
  const [authMode, setAuthMode] = useState<'sign-in' | 'create-account'>('sign-in')
  const [authOpen, setAuthOpen] = useState(false)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      setSignedIn(Boolean(session))
      setUserId(session?.user?.id)
      void resolveIdentity(session)
      setAuthLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session))
      setUserId(session?.user?.id)
      void resolveIdentity(session)
      setAuthLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function resolveIdentity(session: Session | null) {
    if (!session?.user) {
      setUserId(undefined)
      setDisplayName('')
      setDisplayEmail('')
      setInitials('LS')
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', session.user.id)
      .maybeSingle()

    const metadata = session.user.user_metadata as { full_name?: string; name?: string }
    const name =
      profile?.full_name ||
      metadata.full_name ||
      metadata.name ||
      session.user.email?.split('@')[0] ||
      'LS Customs user'

    setDisplayName(name)
    setDisplayEmail(session.user.email || '')
    setInitials(
      name
        .split(/\s+/)
        .map((part: string) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
    )
  }

  const openAuth = (mode: 'sign-in' | 'create-account' = 'sign-in') => {
    setAuthMode(mode)
    setAuthOpen(true)
  }

  return {
    signedIn,
    userId,
    identity: { displayName, displayEmail, initials },
    authLoading,
    authMode,
    authOpen,
    setAuthMode,
    setAuthOpen,
    openAuth,
  }
}
