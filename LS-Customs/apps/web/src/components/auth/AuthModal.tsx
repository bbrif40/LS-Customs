import { useState, useEffect } from 'react'
import { X, ArrowRight, ArrowLeft, Check, CarFront, Wrench, CalendarDays, ShieldCheck, UserRoundPlus } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import type { AuthMode } from '../../types'
import { Capacitor } from '@capacitor/core'
import { useDialog } from '../../hooks/useDialog'
import { normalizeAuthContact } from '../../utils/authContact'
import { phoneOtpRequest } from '../../utils/authOtp'
import './AuthModal.css'

interface AuthModalProps {
  mode: AuthMode
  onModeChange: (mode: AuthMode) => void
  onClose: () => void
  onAuthenticated: () => void
}

export function AuthModal({ mode, onModeChange, onClose, onAuthenticated }: AuthModalProps) {
  const dialogRef = useDialog(onClose)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [contact, setContact] = useState('')
  const [fullName, setFullName] = useState('')
  const [otp, setOtp] = useState('')
  const [verificationContact, setVerificationContact] = useState('')
  const [phoneChallenge, setPhoneChallenge] = useState<string | null>(null)
  const [step, setStep] = useState<'input_contact' | 'verify_otp'>('input_contact')
  const [resendSeconds, setResendSeconds] = useState(0)
  const creating = mode === 'create-account'
  const verifying = step === 'verify_otp'

  useEffect(() => {
    setStep('input_contact'); setOtp(''); setError(''); setPhoneChallenge(null); setResendSeconds(0)
  }, [mode])
  useEffect(() => {
    if (!resendSeconds) return
    const timer = window.setTimeout(() => setResendSeconds(seconds => seconds - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [resendSeconds])

  const handleGoogleSignIn = async () => {
    setLoading(true); setError('')
    try {
      const redirectTo = Capacitor.isNativePlatform() ? 'com.lscustoms.app://login' : window.location.origin
      const { data, error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google', options: { redirectTo, skipBrowserRedirect: Capacitor.isNativePlatform() },
      })
      if (authError) throw authError
      if (data?.url && Capacitor.isNativePlatform()) {
        const { Browser } = await import('@capacitor/browser')
        await Browser.open({ url: data.url })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in is unavailable.')
    } finally { setLoading(false) }
  }

  const handleSendOtp = async (event: React.FormEvent) => {
    event.preventDefault()
    if (loading || resendSeconds > 0) return
    setLoading(true); setError('')
    try {
      const normalized = normalizeAuthContact(contact)
      if (creating && !fullName.trim()) throw new Error('Enter your name to create your account.')
      setContact(normalized)
      if (normalized.includes('@')) {
        const { error: sendError } = await supabase.auth.signInWithOtp({ email: normalized, options: {
          shouldCreateUser: creating,
          ...(creating ? { data: { full_name: fullName.trim() } } : {}),
        } })
        if (sendError) {
          if (!creating && ['signup_disabled', 'otp_disabled', 'user_not_found'].includes(sendError.code ?? ''))
            throw new Error('We couldn’t send a sign-in code. Check your email, use Google, or choose Create an account if you’re new.')
          throw sendError
        }
        setPhoneChallenge(null)
      } else {
        const result = await phoneOtpRequest({ action: 'send', phone: normalized, createAccount: creating, fullName: creating ? fullName.trim() : undefined })
        if (result.verification !== 'sms' && result.verification !== 'profile_phone') throw new Error('Unable to send a verification code.')
        if (result.verification === 'profile_phone' && !result.challengeId) throw new Error('Unable to prepare SMS verification.')
        setPhoneChallenge(result.verification === 'profile_phone' ? result.challengeId! : null)
      }
      setVerificationContact(normalized); setOtp(''); setStep('verify_otp'); setResendSeconds(60)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to send a verification code.'
      setError(/error sending (magic link|confirmation).*email/i.test(message)
        ? 'We couldn’t send your verification code. Please try again later or continue with Google.' : message)
    } finally { setLoading(false) }
  }

  const handleVerifyOtp = async (event: React.FormEvent) => {
    event.preventDefault()
    if (loading || !/^\d{6}$/.test(otp)) return
    setLoading(true); setError('')
    try {
      if (phoneChallenge) {
        const result = await phoneOtpRequest({ action: 'verify', challengeId: phoneChallenge, code: otp })
        if (!result.session) throw new Error('Unable to restore your account. Please request a new code.')
        const { error: sessionError } = await supabase.auth.setSession({ access_token: result.session.access_token, refresh_token: result.session.refresh_token })
        if (sessionError) throw sessionError
      } else {
        const { data, error: verifyError } = await supabase.auth.verifyOtp(verificationContact.includes('@')
          ? { email: verificationContact, token: otp, type: 'email' }
          : { phone: verificationContact, token: otp, type: 'sms' })
        if (verifyError) throw verifyError
        if (!data.session) throw new Error('Unable to restore your account. Please request a new code.')
      }
      onAuthenticated()
    } catch (err) { setError(err instanceof Error ? err.message : 'Invalid code. Please try again.') }
    finally { setLoading(false) }
  }

  return (
    <div className="auth-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !loading) onClose() }}>
      <section className={`auth-dialog auth-account-dialog ${creating ? 'auth-account-dialog--signup' : ''}`} role="dialog" ref={dialogRef} aria-modal="true" aria-labelledby="auth-title" aria-describedby="auth-description" tabIndex={-1}>
        <button className="auth-close" onClick={onClose} aria-label="Close sign in" disabled={loading}><X size={20} /></button>
        <header className="auth-account-header">
          <div className="auth-account-brand"><img src="/logo.png" alt="" /><span>LS CUSTOMS</span></div>
          {creating && <span className="auth-membership-label"><UserRoundPlus size={14} /> NEW ACCOUNT</span>}
          <h2 id="auth-title">{verifying ? (creating ? 'Verify your contact.' : 'Your sign-in code.') : (creating ? 'Your own garage starts here.' : 'Welcome back.')}</h2>
          <p id="auth-description" className="auth-description">{verifying
            ? (phoneChallenge ? `If ${verificationContact} is linked to an eligible account, you’ll receive a six-digit code to sign in to it.` : `Enter the six-digit code sent to ${verificationContact}.`)
            : (creating ? 'Create your LS Customs account to keep your rentals, mechanic visits, and bookings in one place.' : 'Sign in to your existing account with your email or mobile number. Your bookings will be right where you left them.')}</p>
          {creating && <ol className="auth-signup-progress" aria-label="Account creation progress">
            <li className={verifying ? 'complete' : 'current'} aria-current={!verifying ? 'step' : undefined}><span>{verifying ? <Check size={13} /> : '1'}</span>Your details</li>
            <li className={verifying ? 'current' : ''} aria-current={verifying ? 'step' : undefined}><span>2</span>Verify contact</li>
          </ol>}
        </header>

        <div className="auth-account-body">
          {creating && !verifying && <div className="auth-membership-benefits"><span><CarFront size={15} /> Vehicle rentals</span><span><Wrench size={15} /> Mobile mechanics</span><span><CalendarDays size={15} /> All your bookings</span></div>}
          {error && <p className="auth-account-error" role="alert">{error}</p>}
          <form className="auth-account-form" onSubmit={verifying ? handleVerifyOtp : handleSendOtp}>
            {!verifying ? <>
              {creating && <label htmlFor="auth-full-name">Your name<input id="auth-full-name" type="text" autoComplete="name" placeholder="e.g. Alex Santos" value={fullName} onChange={event => setFullName(event.target.value)} maxLength={100} required disabled={loading} /></label>}
              <label htmlFor="auth-contact">Email or phone number<input id="auth-contact" type="text" autoComplete="username" placeholder="you@gmail.com or +63 917 123 4567" value={contact} onChange={event => setContact(event.target.value)} maxLength={254} required disabled={loading} /></label>
              <p className="auth-field-hint">{creating ? 'We’ll send a code to verify your contact. No password to remember.' : 'Use the email or phone number connected to your account.'}</p>
            </> : <>
              <label htmlFor="auth-code">Six-digit verification code<input id="auth-code" className="auth-code-input" type="text" placeholder="000000" inputMode="numeric" autoComplete="one-time-code" autoFocus pattern="[0-9]{6}" value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, ''))} maxLength={6} required disabled={loading} /></label>
              <p className="auth-field-hint">{creating ? 'Verification finishes this step. If you already have an account, we’ll open it.' : 'This code opens your existing account and keeps your booking history.'}</p>
            </>}
            <button className="auth-account-submit" type="submit" disabled={loading || (verifying ? otp.length !== 6 : !contact.trim() || (creating && !fullName.trim()) || resendSeconds > 0)}>
              {loading ? 'Please wait…' : verifying ? (creating ? 'Verify and continue' : 'Sign in to my account') : resendSeconds > 0 ? `Try again in ${resendSeconds}s` : (creating ? 'Create account & send code' : 'Send sign-in code')} {!loading && <ArrowRight size={17} />}
            </button>
          </form>

          {verifying ? <div className="auth-code-actions">
            <button type="button" disabled={loading || resendSeconds > 0} onClick={event => void handleSendOtp(event)}>{resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : 'Resend code'}</button>
            <button type="button" disabled={loading} onClick={() => { setStep('input_contact'); setError(''); setOtp(''); setPhoneChallenge(null) }}><ArrowLeft size={14} /> Change contact</button>
          </div> : <>
            <div className="auth-account-divider"><span>or</span></div>
            <button className="auth-account-google" type="button" onClick={handleGoogleSignIn} disabled={loading}><span aria-hidden="true">G</span>{creating ? 'Create account with Google' : 'Continue with Google'}</button>
          </>}

          <p className="auth-account-switch">{creating ? 'Already have an account?' : 'New to LS Customs?'} <button type="button" disabled={loading} onClick={() => onModeChange(creating ? 'sign-in' : 'create-account')}>{creating ? 'Sign in instead' : 'Create an account'}</button></p>
          <p className="auth-account-security"><ShieldCheck size={15} /> {creating ? 'Your account, verified and ready for the road.' : 'Secure access to your existing account.'}</p>
          {creating && <small className="auth-account-legal">By creating an account, you agree to our <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>.</small>}
        </div>
      </section>
    </div>
  )
}
