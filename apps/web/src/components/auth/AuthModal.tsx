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
    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })
      if (authError) {
        if (authError.message.includes('not enabled') || authError.message.includes('validation_failed')) {
          setError('Google OAuth is not enabled on this local Supabase instance. Please sign in with email and password below.')
        } else {
          setError(authError.message)
        }
        setLoading(false)
      }
    } catch {
      setError('Google Sign-in is unavailable on local development. Use email & password.')
      setLoading(false)
    }
  }

  const handleEmailAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      if (creating) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        })
        if (signUpError) {
          setError(signUpError.message)
          setLoading(false)
          return
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (signInError) {
          if (signInError.message.toLowerCase().includes('invalid login credentials')) {
            setError('Invalid email or password. If you do not have an account yet, click "Create an account" below.')
          } else {
            setError(signInError.message)
          }
          setLoading(false)
          return
        }
      }
      onAuthenticated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
      setLoading(false)
    }
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
            : 'Sign in to access your rentals, mechanic services, and AI assistant.'}
        </p>

        {error && (
          <p className="auth-error" role="alert" style={{ color: '#c66b54', fontSize: '11px', margin: '0 0 14px', lineHeight: 1.4, background: '#fdf3f0', padding: '8px 12px', borderRadius: '6px' }}>
            {error}
          </p>
        )}

        <button
          className="google-sign-in"
          onClick={handleGoogleSignIn}
          disabled={loading}
          type="button"
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

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={6}
              placeholder="Enter your password"
              required
            />
          </label>

          <button className="button dark-button auth-submit" type="submit" disabled={loading} style={{ marginTop: '10px' }}>
            {creating ? 'Create account' : 'Sign in'} <ChevronRight size={16} />
          </button>
        </form>

        <p className="auth-switch">
          {creating ? 'Already have an account?' : 'New to LS Customs?'}
          <button
            type="button"
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
