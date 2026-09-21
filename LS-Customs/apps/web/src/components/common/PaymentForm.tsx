/**
 * PaymentForm — provider-agnostic payment collection.
 *
 * Renders the correct checkout UI based on the provider returned by
 * `create-payment-intent`:
 *   - Stripe  → <Elements> + <CardElement> from @stripe/react-stripe-js
 *   - PayMongo → PayMongo Checkout (script-loaded) — branch is scaffolded
 *     for when the PayMongo frontend SDK choice is finalized.
 *
 * Emits `onComplete(result)` where result is one of:
 *   'succeeded' | 'failed' | 'processing'
 *
 * IMPORTANT: The webhook is still the source of truth for the final status.
 * This form's onComplete reflects the provider SDK's immediate result;
 * usePaymentStatus should be used in parallel to catch async confirmations
 * (3DS redirects, bank delays, etc.).
 */
import { useState, useEffect } from 'react'
import { loadStripe, Stripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { CreditCard, Loader2, ExternalLink, ShieldCheck, Smartphone, QrCode, Wallet, RefreshCw } from 'lucide-react'

export type PaymentFormStatus = 'succeeded' | 'failed' | 'processing'

export interface PaymentFormProps {
  /** The client_secret from the create-payment-intent edge function. */
  clientSecret: string
  /** The checkout_url if PayMongo Checkout Session was created. */
  checkoutUrl?: string
  /** Display amount (e.g. 7500.00). */
  amount: number
  /** Currency code (e.g. "PHP"). */
  currency: string
  /** Provider discriminator — "stripe" | "paymongo". */
  provider: string
  /** Called when the provider SDK reports a terminal or intermediate result. */
  onComplete: (result: PaymentFormStatus) => void
  /** Called on provider or validation error. */
  onError?: (message: string) => void
  /** Disable the form while an external state (e.g. profile check) is pending. */
  disabled?: boolean
}

export function PaymentForm({
  clientSecret,
  checkoutUrl,
  amount,
  currency,
  provider,
  onComplete,
  onError,
  disabled,
}: PaymentFormProps) {
  if (provider === 'paymongo') {
    return (
      <PaymongoForm
        clientSecret={clientSecret}
        checkoutUrl={checkoutUrl}
        amount={amount}
        currency={currency}
        onComplete={onComplete}
        onError={onError}
        disabled={disabled}
      />
    )
  }

  // Default: Stripe
  const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  if (!publishableKey) {
    onError?.('Stripe publishable key is not configured (VITE_STRIPE_PUBLISHABLE_KEY)')
    return (
      <div className="payment-form-error">
        <p>Stripe is not configured. Please contact support.</p>
      </div>
    )
  }

  const stripePromise = loadStripe(publishableKey)

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
        },
      }}
    >
      <StripeCardForm
        clientSecret={clientSecret}
        amount={amount}
        currency={currency}
        onComplete={onComplete}
        onError={onError}
        disabled={disabled}
      />
    </Elements>
  )
}

// ---------------------------------------------------------------------------
// Stripe Card Form inner component (uses hooks from Elements context)
// ---------------------------------------------------------------------------

interface StripeCardFormProps {
  clientSecret: string
  amount: number
  currency: string
  onComplete: (result: PaymentFormStatus) => void
  onError?: (message: string) => void
  disabled?: boolean
}

const CARD_STYLE = {
  base: {
    fontSize: '14px',
    color: '#374151',
    '::placeholder': {
      color: '#9ca3af',
    },
    iconColor: '#6366f1',
  },
}

function StripeCardForm({
  clientSecret,
  amount,
  currency,
  onComplete,
  onError,
  disabled,
}: StripeCardFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!stripe || !elements) {
      return
    }

    setLoading(true)

    const cardElement = elements.getElement(CardElement)
    if (!cardElement) {
      onError?.('CardElement not mounted. Please refresh.')
      setLoading(false)
      return
    }

    const { paymentIntent, error } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: cardElement as any,
      },
    })

    if (error) {
      const msg = error.message ?? 'Payment failed'
      onError?.(msg)
      onComplete('failed')
    } else if (paymentIntent?.status === 'succeeded') {
      onComplete('succeeded')
    } else {
      // 'requires_action', 'requires_capture', etc.
      onComplete('processing')
    }

    setLoading(false)
  }

  return (
    <div className="payment-form-stripe">
      <div className="payment-amount-summary">
        <span className="muted">Total amount</span>
        <strong>{currency} {amount.toFixed(2)}</strong>
      </div>

      <form onSubmit={handleSubmit} className="payment-card-form">
        <div className="payment-card-field">
          <CardElement
            options={{
              style: CARD_STYLE,
              hidePostalCode: true,
            }}
          />
        </div>

        <button
          type="submit"
          className="button dark-button payment-submit"
          disabled={loading || disabled || !stripe}
          style={{ width: '100%' }}
        >
          {loading ? <Loader2 size={16} className="spin" /> : <CreditCard size={16} />}
          {loading ? 'Processing…' : disabled ? 'Loading…' : `Pay ${currency} ${amount.toFixed(2)}`}
        </button>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PayMongo Checkout (scaffold — full SDK integration TBD)
// ---------------------------------------------------------------------------

interface PaymongoFormProps {
  clientSecret: string
  checkoutUrl?: string
  amount: number
  currency: string
  onComplete: (result: PaymentFormStatus) => void
  onError?: (message: string) => void
  disabled?: boolean
}

/**
 * PayMongo Checkout form.
 *
 * Directs the customer to PayMongo's secure hosted payment page which
 * supports Philippine payment methods: GCash, Maya, Cards (Visa/Mastercard),
 * QR Ph, GrabPay, and BillEase.
 */
function PaymongoForm({
  clientSecret,
  checkoutUrl: providedCheckoutUrl,
  amount,
  currency,
  onComplete,
  onError,
  disabled,
}: PaymongoFormProps) {
  const [waitingForPayment, setWaitingForPayment] = useState(false)

  // Resolve checkout URL accurately
  const resolvedUrl = providedCheckoutUrl ||
    (clientSecret.startsWith('http://') || clientSecret.startsWith('https://')
      ? clientSecret
      : `https://checkout.paymongo.com/${clientSecret}`)

  const handlePay = (forceRedirect = false) => {
    if (disabled) return

    setWaitingForPayment(true)
    localStorage.setItem('lsc_paymongo_checkout_start', Date.now().toString())

    if (forceRedirect) {
      window.location.href = resolvedUrl
      return
    }

    // Open in popup for desktop users
    const popup = window.open(
      resolvedUrl,
      'paymongo_checkout',
      'width=540,height=740,scrollbars=yes,resizable=yes',
    )

    if (!popup) {
      // If popup was blocked by browser, redirect current tab
      window.location.href = resolvedUrl
      return
    }

    // Poll for popup closure
    const interval = setInterval(() => {
      if (popup.closed) {
        clearInterval(interval)
        onComplete('processing')
      }
    }, 1000)
  }

  // Detect return when redirected back
  useEffect(() => {
    const start = localStorage.getItem('lsc_paymongo_checkout_start')
    if (start) {
      localStorage.removeItem('lsc_paymongo_checkout_start')
      onComplete('processing')
    }
  }, [onComplete])

  return (
    <div className="payment-form-paymongo" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div className="payment-amount-summary" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
        <span className="muted">Total to pay</span>
        <strong style={{ fontSize: '18px', color: '#10b981' }}>₱{amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
      </div>

      <div className="paymongo-methods-banner" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#9ca3af' }}>
          <ShieldCheck size={14} style={{ color: '#10b981' }} />
          <span>PayMongo Secure Philippine Channels</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '4px 8px', borderRadius: '4px', background: 'rgba(0, 114, 206, 0.15)', color: '#38bdf8', fontWeight: 600, border: '1px solid rgba(56, 189, 248, 0.25)' }}>
            <Smartphone size={12} /> GCash
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '4px 8px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', fontWeight: 600, border: '1px solid rgba(52, 211, 153, 0.25)' }}>
            <Wallet size={12} /> Maya
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '4px 8px', borderRadius: '4px', background: 'rgba(244, 63, 94, 0.15)', color: '#fb7185', fontWeight: 600, border: '1px solid rgba(251, 113, 133, 0.25)' }}>
            <CreditCard size={12} /> Visa / Mastercard
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '4px 8px', borderRadius: '4px', background: 'rgba(234, 179, 8, 0.15)', color: '#facc15', fontWeight: 600, border: '1px solid rgba(250, 204, 21, 0.25)' }}>
            <QrCode size={12} /> QR Ph (Any Bank)
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '4px 8px', borderRadius: '4px', background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', fontWeight: 600, border: '1px solid rgba(192, 132, 252, 0.25)' }}>
            BillEase / Online Bank
          </span>
        </div>
      </div>

      {waitingForPayment ? (
        <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#34d399', fontWeight: 600, marginBottom: '6px' }}>
            <Loader2 size={16} className="spin" />
            <span>Awaiting PayMongo Confirmation…</span>
          </div>
          <p className="muted" style={{ fontSize: '12px', margin: '0 0 10px 0' }}>
            Please finish your payment in the checkout window. This page will update automatically once verified.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
            <button
              type="button"
              className="button text-button"
              onClick={() => handlePay(false)}
              style={{ fontSize: '12px', padding: '4px 8px' }}
            >
              <ExternalLink size={12} /> Re-open window
            </button>
            <button
              type="button"
              className="button text-button"
              onClick={() => handlePay(true)}
              style={{ fontSize: '12px', padding: '4px 8px' }}
            >
              Continue in this tab
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="button dark-button payment-submit"
          onClick={() => handlePay(false)}
          disabled={disabled}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px' }}
        >
          {disabled ? (
            <>
              <Loader2 size={16} className="spin" /> Loading…
            </>
          ) : (
            <>
              <ExternalLink size={16} /> Pay ₱{amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} via PayMongo
            </>
          )}
        </button>
      )}

      <p className="muted" style={{ fontSize: '12px', textAlign: 'center', margin: 0 }}>
        Powered by PayMongo Philippines · 256-bit encrypted checkout
      </p>
    </div>
  )
}
