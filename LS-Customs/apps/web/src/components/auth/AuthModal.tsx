/**
 * AuthModal — sign-in dialog with Google OAuth only.
 */
import { useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import type { AuthMode } from '../../types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string

interface AuthModalProps {
  mode: AuthMode
  onModeChange: (mode: AuthMode) => void
  onClose: () => void
  onAuthenticated: () => void
}

export function AuthModal({ mode, onModeChange, onClose, onAuthenticated }: AuthModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setError('')
    try {
      const healthCheck = await fetch(`${supabaseUrl}/auth/v1/settings`, { method: 'GET' })
      if (!healthCheck.ok) {
        throw new Error('Local Supabase Auth is unavailable. Start the local Supabase stack and try again.')
      }

      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })
      if (authError) {
        setError(authError.message)
        setLoading(false)
      }
    } catch {
      setError('Google Sign-in is unavailable.')
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
        <h2 id="auth-title">Welcome back.</h2>
        <p className="auth-description">
          Sign in to access your rentals, mechanic services, and AI assistant.
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

        <p className="auth-switch">
          New to LS Customs?
          <button
            type="button"
            onClick={() => {
              onModeChange('create-account')
              setError('')
            }}
          >
            Create an account
          </button>
        </p>

        <small className="auth-legal">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </small>
      </section>
    </div>
  )
}
