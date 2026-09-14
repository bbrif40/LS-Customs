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
import { CreditCard, Loader2 } from 'lucide-react'

export type PaymentFormStatus = 'succeeded' | 'failed' | 'processing'

export interface PaymentFormProps {
  /** The client_secret from the create-payment-intent edge function. */
  clientSecret: string
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
        card: cardElement,
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
  amount: number
  currency: string
  onComplete: (result: PaymentFormStatus) => void
  onError?: (message: string) => void
  disabled?: boolean
}

/**
 * PayMongo Checkout form.
 *
 * Uses the PayMongo Check-out URL (client_key) to redirect the customer to
 * PayMongo's hosted payment page. After the customer completes payment,
 * PayMongo redirects back to the page — the webhook updates the payment
 * status and usePaymentStatus catches the change.
 */
function PaymongoForm({
  clientSecret,
  amount,
  currency,
  onComplete,
  onError,
  disabled,
}: PaymongoFormProps) {
  // PayMongo Checkout: redirect the browser to the hosted checkout URL.
  // The client_key in the intent response is used to initialize PayMongo's
  // checkout. For a redirect-based flow we open the PayMongo checkout URL.
  const checkoutUrl = `https://checkout.paymongo.com/${clientSecret}`

  const handlePay = () => {
    if (disabled) return

    // Track the redirect in localStorage so the page can detect the return
    // and trigger onComplete('processing').
    localStorage.setItem('lsc_paymongo_checkout_start', Date.now().toString())

    // Open PayMongo's hosted checkout in a popup for better UX.
    // If popup is blocked, fall back to a full redirect.
    const popup = window.open(
      checkoutUrl,
      'paymongo_checkout',
      'width=520,height=700,scrollbars=yes,resizable=yes',
    )

    if (!popup) {
      // Popup blocked — fall back to full-page redirect
      window.location.href = checkoutUrl
      return
    }

    // Poll for popup close (customer completed payment)
    const interval = setInterval(() => {
      if (popup.closed) {
        clearInterval(interval)
        // The webhook will update the payment status. Mark as processing
        // and let usePaymentStatus catch the real result.
        onComplete('processing')
      }
    }, 1000)
  }

  // On page load after redirect-back, check if we were in a checkout flow.
  useEffect(() => {
    const start = localStorage.getItem('lsc_paymongo_checkout_start')
    if (start) {
      localStorage.removeItem('lsc_paymongo_checkout_start')
      // The webhook should have updated the status by now; usePaymentStatus
      // will catch it. Signal 'processing' to let the parent know we returned.
      onComplete('processing')
    }
  }, [onComplete])

  return (
    <div className="payment-form-paymongo">
      <div className="payment-amount-summary">
        <span className="muted">Total amount</span>
        <strong>{currency} {amount.toFixed(2)}</strong>
      </div>

      <button
        className="button dark-button payment-submit"
        onClick={handlePay}
        disabled={disabled}
        style={{ width: '100%' }}
      >
        {disabled ? 'Loading…' : `Pay with PayMongo — ${currency} ${amount.toFixed(2)}`}
      </button>

      <p className="muted" style={{ fontSize: '12px', textAlign: 'center', marginTop: '8px' }}>
        You'll be redirected to PayMongo's secure checkout page.
      </p>
    </div>
  )
}
