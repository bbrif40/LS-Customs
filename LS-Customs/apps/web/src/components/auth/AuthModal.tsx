import { useState } from 'react'
import { X, ArrowRight, ArrowLeft } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import type { AuthMode } from '../../types'
import { Capacitor } from '@capacitor/core'

interface AuthModalProps {
  mode: AuthMode
  onModeChange: (mode: AuthMode) => void
  onClose: () => void
  onAuthenticated: () => void
}

export function AuthModal({ mode, onModeChange, onClose, onAuthenticated }: AuthModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [contact, setContact] = useState('') 
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState<'input_contact' | 'verify_otp'>('input_contact')
  const [showSplash, setShowSplash] = useState(false)
  
  const isEmail = contact.includes('@')
  
  const handleGoogleSignIn = async () => {
    setLoading(true)
    setError('')
    try {
      const redirectTo = Capacitor.isNativePlatform() 
        ? 'com.lscustoms.app://login' 
        : window.location.origin;

      const { data, error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: Capacitor.isNativePlatform() },
      })
      if (authError) {
        setError(authError.message)
      } else if (data?.url && Capacitor.isNativePlatform()) {
        const { Browser } = await import('@capacitor/browser')
        await Browser.open({ url: data.url })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google Sign-in is unavailable.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      if (!contact.trim()) {
        throw new Error('Please enter an email or phone number.')
      }
      
      const { error: otpError } = await supabase.auth.signInWithOtp(
        isEmail ? { email: contact.trim() } : { phone: contact.trim() }
      )
      
      if (otpError) {
        throw otpError
      }
      
      setStep('verify_otp')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        [isEmail ? 'email' : 'phone']: contact.trim(),
        token: otp,
        type: isEmail ? 'email' : 'sms'
      })
      
      if (verifyError) {
        throw verifyError
      }
      
      if (data.session) {
        setShowSplash(true)
        setTimeout(() => onAuthenticated(), 2500)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code.')
    } finally {
      setLoading(false)
    }
  }

  if (showSplash) {
    return (
      <div className="auth-backdrop" style={{ zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
        <div style={{ animation: 'splashFadeInOut 2.5s forwards', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <img src="/logo.png" alt="LS Customs Logo" style={{ width: 80, height: 80, objectFit: 'contain', marginBottom: 16 }} />
          <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: '#0f172a' }}>LS Customs</h1>
        </div>
        <style>
          {`
            @keyframes splashFadeInOut {
              0% { opacity: 0; transform: scale(0.95); }
              20% { opacity: 1; transform: scale(1); }
              80% { opacity: 1; transform: scale(1); }
              100% { opacity: 0; transform: scale(1.05); }
            }
          `}
        </style>
      </div>
    )
  }

  return (
    <div
      className="auth-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section 
        className="auth-dialog" 
        role="dialog" 
        style={{ maxWidth: 420, width: '100%' }}
      >
        <button className="auth-close" onClick={onClose} aria-label="Close sign in">
          <X size={18} />
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16 }}>
          <img src="/logo.png" alt="LS Customs Logo" style={{ width: 48, height: 48, objectFit: 'contain', marginBottom: 8 }} />
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>LS Customs</h1>
        </div>
        <h2 id="auth-title" style={{ textAlign: 'center', marginTop: 0 }}>
          {step === 'input_contact' 
            ? (mode === 'create-account' ? 'Create an account.' : 'Welcome back.')
            : 'Enter verification code.'}
        </h2>
        <p className="auth-description">
          {step === 'input_contact' 
            ? 'Sign in or create an account to access your rentals, mechanic services, and AI assistant.'
            : `We sent a 6-digit code to ${contact}.`}
        </p>

        {error && (
          <p className="auth-error" role="alert" style={{ color: '#c66b54', fontSize: '11px', margin: '0 0 14px', lineHeight: 1.4, background: '#fdf3f0', padding: '8px 12px', borderRadius: '6px' }}>
            {error}
          </p>
        )}

        {step === 'input_contact' ? (
          <form onSubmit={handleSendOtp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input
              type="text"
              placeholder="Email or Phone number (+63...)"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              required
              style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
            />
            
            <button
              className="auth-submit-btn"
              type="submit"
              disabled={loading || !contact}
              style={{ 
                background: '#0f172a', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 16px', 
                fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, cursor: 'pointer',
                opacity: (loading || !contact) ? 0.6 : 1
              }}
            >
              {loading ? 'Please wait...' : 'Continue'}
              {!loading && <ArrowRight size={14} />}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
             <input
              type="text"
              placeholder="6-digit code"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
              maxLength={6}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, textAlign: 'center', letterSpacing: '4px' }}
            />
            
            <button
              className="auth-submit-btn"
              type="submit"
              disabled={loading || otp.length < 6}
              style={{ 
                background: '#0f172a', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 16px', 
                fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, cursor: 'pointer',
                opacity: (loading || otp.length < 6) ? 0.6 : 1
              }}
            >
              {loading ? 'Verifying...' : 'Sign In'}
            </button>
            <button
              type="button"
              onClick={() => setStep('input_contact')}
              style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
            >
              <ArrowLeft size={12} /> Back
            </button>
          </form>
        )}

        {step === 'input_contact' && (
          <>
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
          </>
        )}

        <small className="auth-legal" style={{ display: 'block', textAlign: 'center', marginTop: '16px', fontSize: 10, color: '#9ca3af' }}>
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </small>
      </section>
    </div>
  )
}
