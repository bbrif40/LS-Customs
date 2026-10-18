/** Adapted from https://opensourceui.in/components/newsletter-form.
 * MIT license: see newsletter-form.LICENSE.txt. Uses the existing CSS stack.
 */
import { useId, useState, type FormEvent } from 'react'
import { AlertCircle, Check, ChevronRight, Loader2 } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import './newsletter-form.css'

export function NewsletterForm() {
  const id = useId()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || success) return
    const normalized = email.trim().toLowerCase()
    if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setError('Enter a valid email address.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const { error: subscriptionError } = await supabase.rpc('subscribe_newsletter', { subscriber_email: normalized })
      if (subscriptionError) throw subscriptionError
      setSuccess(true)
      setEmail('')
    } catch {
      setError('We couldn’t save your subscription. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="footer-newsletter" aria-labelledby={`${id}-title`}>
      <h4 id={`${id}-title`}>Stay in the loop</h4>
      <p>Get rental offers, service updates, and news from LS Customs.</p>
      {success ? (
        <div className="newsletter-success" role="status"><Check size={18} aria-hidden="true" /><div><strong>You’re on the list.</strong><span>Thanks for subscribing to LS Customs.</span></div></div>
      ) : (
        <form onSubmit={handleSubmit} aria-busy={busy} noValidate>
          <label className="newsletter-label" htmlFor={`${id}-email`}>Email address</label>
          <div className={`newsletter-input-row${error ? ' has-error' : ''}`}>
            <input id={`${id}-email`} type="email" autoComplete="email" inputMode="email" name="email" placeholder="you@example.com" required maxLength={254}
              value={email} onChange={event => { setEmail(event.target.value); setError('') }} disabled={busy}
              aria-invalid={Boolean(error)} aria-describedby={`${id}-privacy${error ? ` ${id}-error` : ''}`} />
            <button type="submit" disabled={busy} aria-label={busy ? 'Subscribing' : 'Subscribe to newsletter'}>
              {busy ? <Loader2 size={17} className="spin" aria-hidden="true" /> : <><span>Subscribe</span><ChevronRight size={15} aria-hidden="true" /></>}
            </button>
          </div>
          {error && <p id={`${id}-error`} className="newsletter-error" role="alert"><AlertCircle size={14} aria-hidden="true" />{error}</p>}
        </form>
      )}
      <p id={`${id}-privacy`} className="newsletter-privacy">By subscribing, you agree to receive marketing emails. <a href="/privacy">Privacy policy</a></p>
    </section>
  )
}
