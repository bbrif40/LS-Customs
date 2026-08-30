/**
 * AuthModal — sign-in / sign-up dialog with Google OAuth and email/password forms.
 */
import { useState } from 'react'
import { X, ChevronRight } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import type { AuthMode } from '../../types'

interface AuthModalProps {
  mode: AuthMode
  onModeChange: (mode: AuthMode) => void
  onClose: () => void
  onAuthenticated: () => void
}

export function AuthModal({ mode, onModeChange, onClose, onAuthenticated }: AuthModalProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const creating = mode === 'create-account'

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setError('')
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (authError) {
      setError(authError.message)
      setLoading(false)
    }
  }

  const handleEmailAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    const result = creating
      ? await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        })
      : await supabase.auth.signInWithPassword({ email, password })
    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }
    onAuthenticated()
  }

  return (
    <div
      className="auth-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="auth-close" onClick={onClose} aria-label="Close sign in">
          <X size={18} />
        </button>
        <div className="auth-logo">✳</div>
        <p className="eyebrow">WELCOME TO LS CUSTOMS</p>
        <h2 id="auth-title">{creating ? 'Create your account.' : 'Welcome back.'}</h2>
        <p className="auth-description">
          {creating
            ? 'Save your favorites, bookings, and service history in one place.'
            : 'Sign in to manage your rentals and mechanic services.'}
        </p>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="google-sign-in"
          onClick={handleGoogleSignIn}
          disabled={loading}
        >
          <span>G</span> {loading ? 'Connecting...' : 'Continue with Google'}
        </button>
        <div className="auth-divider">
          <span>or continue with email</span>
        </div>
        <form onSubmit={handleEmailAuth}>
          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              required
            />
          </label>
          {creating && (
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                placeholder="At least 8 characters"
                required
              />
            </label>
          )}
          {!creating && (
            <button className="forgot-password" type="button">
              Forgot password?
            </button>
          )}
          <button className="button dark-button auth-submit" type="submit" disabled={loading}>
            {creating ? 'Create account' : 'Sign in'} <ChevronRight size={16} />
          </button>
        </form>
        <p className="auth-switch">
          {creating ? 'Already have an account?' : 'New to LS Customs?'}
          <button
            onClick={() => {
              onModeChange(creating ? 'sign-in' : 'create-account')
              setError('')
            }}
          >
            {creating ? 'Sign in' : 'Create an account'}
          </button>
        </p>
        <small className="auth-legal">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </small>
      </section>
    </div>
  )
}
