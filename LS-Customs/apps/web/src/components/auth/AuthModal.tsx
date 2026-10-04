import { useState, useMemo } from 'react'
import { X, Eye, EyeOff, Check, ArrowRight } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import type { AuthMode } from '../../types'

interface AuthModalProps {
  mode: AuthMode
  onModeChange: (mode: AuthMode) => void
  onClose: () => void
  onAuthenticated: () => void
}

export function AuthModal({ mode, onModeChange, onClose, onAuthenticated }: AuthModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')

  // Password requirements
  const hasMinLength = password.length >= 8
  const hasNumber = /\d/.test(password)
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password)
  const isPasswordStrong = hasMinLength && hasNumber && hasSpecialChar
  const passwordsMatch = password === confirmPassword
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setError('')
    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })
      if (authError) {
        setError(authError.message)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google Sign-in is unavailable.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      if (!isValidEmail) {
        throw new Error('Please enter a valid email address.')
      }

      if (mode === 'create-account') {
        if (!isPasswordStrong) {
          throw new Error('Please meet all password requirements.')
        }
        if (!passwordsMatch) {
          throw new Error('Passwords do not match.')
        }
        
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: `${firstName.trim()} ${lastName.trim()}`,
              phone: phone.trim(),
              address: address.trim()
            }
          }
        })
        
        if (signUpError) {
          if (signUpError.message.toLowerCase().includes('already registered') || signUpError.message.toLowerCase().includes('user already exists')) {
            throw new Error('An account with this email already exists.')
          }
          throw signUpError
        }
        
        if (data.user) {
          onAuthenticated()
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        
        if (signInError) {
          throw signInError
        }
        
        if (data.session) {
          onAuthenticated()
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred.')
    } finally {
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16 }}>
          <img
            src="/logo.png"
            alt="LS Customs Logo"
            style={{ width: 48, height: 48, objectFit: 'contain', marginBottom: 8 }}
          />
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>LS Customs</h1>
        </div>
        <h2 id="auth-title" style={{ textAlign: 'center', marginTop: 0 }}>{mode === 'create-account' ? 'Create an account.' : 'Welcome back.'}</h2>
        <p className="auth-description">
          Sign in or create an account to access your rentals, mechanic services, and AI assistant.
        </p>

        {error && (
          <p className="auth-error" role="alert" style={{ color: '#c66b54', fontSize: '11px', margin: '0 0 14px', lineHeight: 1.4, background: '#fdf3f0', padding: '8px 12px', borderRadius: '6px' }}>
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {mode === 'create-account' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <input
                  type="text"
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
                />
                <input
                  type="text"
                  placeholder="Last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
                />
              </div>
              <input
                type="tel"
                placeholder="Contact number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
              />
              <input
                type="text"
                placeholder="Address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
                style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
              />
            </>
          )}

          <div>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
            />
          </div>
          
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 4 }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {mode === 'create-account' && (
            <>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: `1px solid ${confirmPassword && !passwordsMatch ? '#ef4444' : '#d1d5db'}`, fontSize: 13 }}
                />
              </div>

              {/* Password Checklist */}
              <div style={{ fontSize: 11, display: 'flex', flexDirection: 'column', gap: 4, marginTop: -6, marginBottom: 4 }}>
                <div style={{ color: hasMinLength ? '#10b981' : '#9ca3af', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Check size={12} /> At least 8 characters
                </div>
                <div style={{ color: hasNumber ? '#10b981' : '#9ca3af', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Check size={12} /> Contains a number
                </div>
                <div style={{ color: hasSpecialChar ? '#10b981' : '#9ca3af', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Check size={12} /> Contains a special character
                </div>
              </div>
            </>
          )}

          <button
            className="auth-submit-btn"
            type="submit"
            disabled={loading || (mode === 'create-account' && (!isPasswordStrong || !passwordsMatch))}
            style={{ 
              background: '#0f172a', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 16px', 
              fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, cursor: 'pointer',
              opacity: (loading || (mode === 'create-account' && (!isPasswordStrong || !passwordsMatch))) ? 0.6 : 1
            }}
          >
            {loading ? 'Please wait...' : mode === 'create-account' ? 'Create Account' : 'Sign In'}
            {!loading && <ArrowRight size={14} />}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', margin: '16px 0', color: '#9ca3af', fontSize: 11 }}>
          <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
          <span style={{ padding: '0 10px' }}>OR</span>
          <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
        </div>

        <button
          className="google-sign-in"
          onClick={handleGoogleSignIn}
          disabled={loading}
          type="button"
        >
          <span>G</span> {loading ? 'Connecting...' : 'Continue with Google'}
        </button>

        <p className="auth-switch" style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', marginTop: '14px', lineHeight: '1.5' }}>
          {mode === 'sign-in' ? (
            <>
              Don't have an account?{' '}
              <button type="button" onClick={() => onModeChange('create-account')} style={{ background: 'none', border: 'none', color: '#0f172a', fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button type="button" onClick={() => onModeChange('sign-in')} style={{ background: 'none', border: 'none', color: '#0f172a', fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                Sign in
              </button>
            </>
          )}
        </p>

        <small className="auth-legal" style={{ display: 'block', textAlign: 'center', marginTop: '16px', fontSize: 10, color: '#9ca3af' }}>
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </small>
      </section>
    </div>
  )
}
