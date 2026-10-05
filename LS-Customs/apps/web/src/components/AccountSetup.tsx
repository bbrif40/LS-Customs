import React, { useState } from 'react'
import { AlertCircle, Loader2, Phone, ShieldCheck } from 'lucide-react'
import { supabase } from '../supabaseClient'

interface AccountSetupProps {
  userId: string
  onComplete: (phone: string) => void
}

/** Loose international phone check: 7–15 digits, optional leading +. */
const isValidPhone = (value: string) => {
  const digits = value.replace(/[^\d]/g, '')
  return /^\+?[\d\s().-]+$/.test(value.trim()) && digits.length >= 7 && digits.length <= 15
}

/** Map raw Supabase/network errors into something a customer can act on. */
const friendlyError = (message: string) => {
  const m = message.toLowerCase()
  if (m.includes('failed to fetch') || m.includes('network')) {
    return { title: 'Connection problem', body: "We couldn't reach our servers. Check your internet connection and try again." }
  }
  if (m.includes('jwt') || m.includes('expired') || m.includes('auth')) {
    return { title: 'Session expired', body: 'Please sign out and sign back in, then add your phone number again.' }
  }
  if (m.includes('duplicate') || m.includes('unique')) {
    return { title: 'Number already in use', body: 'This phone number is linked to another account. Try a different number.' }
  }
  return { title: "Couldn't save your number", body: message }
}

export function AccountSetup({ userId, onComplete }: AccountSetupProps) {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ title: string; body: string } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = phone.trim()
    if (!value) {
      setError({ title: 'Phone number required', body: 'Mechanics use it to reach you during a dispatch.' })
      return
    }
    if (!isValidPhone(value)) {
      setError({ title: 'Check your number', body: 'Enter a valid phone number, e.g. +63 917 123 4567.' })
      return
    }

    setLoading(true)
    setError(null)

    try {
      // profiles has no INSERT RLS policy (rows are created by the
      // handle_new_user trigger), so update + select to detect a missing row.
      const { data, error: updateError } = await supabase
        .from('profiles')
        .update({ phone: value })
        .eq('id', userId)
        .select('id')

      if (updateError) {
        setError(friendlyError(updateError.message))
        return
      }
      if (!data || data.length === 0) {
        setError({
          title: 'Profile not found',
          body: "Your account profile hasn't finished setting up. Sign out, sign back in, and try again.",
        })
        return
      }

      // Update auth state in place — no full page reload needed.
      window.dispatchEvent(new CustomEvent('ls-profile-updated', { detail: { phone: value } }))
      onComplete(value)
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : String(err)))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="ls-screen">
      <section className="ls-card" aria-labelledby="account-setup-title">
        <div className="ls-brand">
          <img src="/logo.png" alt="" className="ls-brand-logo" /> LS Customs
        </div>

        <div className="ls-icon-badge" aria-hidden="true">
          <Phone size={26} />
        </div>

        <h1 id="account-setup-title" className="ls-title">Complete your profile</h1>
        <p className="ls-subtitle">
          Add a phone number so our mechanics can reach you when they're on the way. You only need to do this once.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="ls-field">
            <label className="ls-label" htmlFor="account-setup-phone">Phone number</label>
            <div className={`ls-input-wrap${error ? ' is-invalid' : ''}`}>
              <Phone size={18} aria-hidden="true" />
              <input
                id="account-setup-phone"
                className="ls-input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                autoFocus
                value={phone}
                onChange={(e) => { setPhone(e.target.value); if (error) setError(null) }}
                placeholder="+63 917 123 4567"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'account-setup-error' : 'account-setup-hint'}
              />
            </div>
            <span id="account-setup-hint" className="ls-hint">
              <ShieldCheck size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
              Only shared with the mechanic assigned to your booking.
            </span>
          </div>

          {error && (
            <div id="account-setup-error" className="ls-alert" role="alert">
              <AlertCircle size={18} />
              <div>
                <strong>{error.title}</strong>
                {error.body}
              </div>
            </div>
          )}

          <div className="ls-actions">
            <button id="account-setup-submit" type="submit" className="ls-btn ls-btn--primary" disabled={loading}>
              {loading ? (<><Loader2 size={18} className="ls-spin" /> Saving…</>) : 'Save & continue'}
            </button>
            <button
              id="account-setup-signout"
              type="button"
              className="ls-btn ls-btn--link"
              onClick={() => supabase.auth.signOut()}
            >
              Not you? Sign out
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}
