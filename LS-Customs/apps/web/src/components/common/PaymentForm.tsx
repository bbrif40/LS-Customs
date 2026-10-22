import { useWebsiteText } from "../../hooks/useWebsiteText"
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
import { useState, useMemo } from 'react'
import { loadStripe, Stripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { CreditCard, Loader2, ExternalLink, ShieldCheck, Smartphone, QrCode, Wallet, RefreshCw } from 'lucide-react'
import { PaymentMethodBadges } from './PaymentMethodBadges'

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
  /** Called when the user opens a PayMongo checkout tab. */
  onCheckoutOpened?: () => void
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
  onCheckoutOpened,
  onError,
  disabled,
}: PaymentFormProps) {
  const websiteText = useWebsiteText("Shared")

  const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  const stripePromise = useMemo(() => publishableKey ? loadStripe(publishableKey) : null, [publishableKey])
  if (provider === 'paymongo') {
    return (
      <PaymongoForm
        clientSecret={clientSecret}
        checkoutUrl={checkoutUrl}
        amount={amount}
        currency={currency}
        onComplete={onComplete}
        onCheckoutOpened={onCheckoutOpened}
        onError={onError}
        disabled={disabled}
      />
    )
  }

  // Default: Stripe
  if (!publishableKey) {
    return (
      <div className="payment-form-error">
        <p>{websiteText("Stripe is not configured. Please contact support.")}</p>
      </div>
    )
  }


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
  onCheckoutOpened?: () => void
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
  onCheckoutOpened,
  onError,
  disabled,
}: StripeCardFormProps) {
  const websiteText = useWebsiteText("Shared")

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
        <span className="muted">{websiteText("Total amount")}</span>
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
          {loading ? websiteText("Processing…") : disabled ? websiteText("Loading…") : websiteText("Pay {value1} {value2}", { value1: String(currency), value2: String(amount.toFixed(2)) })}
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
  onCheckoutOpened?: () => void
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
  onCheckoutOpened,
  onError,
  disabled,
}: PaymongoFormProps) {
  const websiteText = useWebsiteText("Shared")

  const [waitingForPayment, setWaitingForPayment] = useState(false)

  // Resolve checkout URL accurately
  const resolvedUrl = providedCheckoutUrl || clientSecret
  let safeCheckout = false
  try { const url = new URL(resolvedUrl); safeCheckout = url.protocol === 'https:' && (url.hostname === 'checkout.paymongo.com' || url.hostname === 'paymongo.com' || url.hostname.endsWith('.paymongo.com')) } catch { /* Invalid checkout stays disabled. */ }

  const handleCheckoutOpened = () => {
    setWaitingForPayment(true)
    onCheckoutOpened?.()
    onComplete('processing')
  }

  const handleUnavailableCheckout = () => {
    if (!disabled) onError?.('Checkout is unavailable. Resume payment from your booking or contact support.')
  }

  return (
    <div className="payment-form-paymongo" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div className="payment-amount-summary" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
        <span className="muted">{websiteText("Total to pay")}</span>
        <strong style={{ fontSize: '18px', color: '#10b981' }}>₱{amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
      </div>

      <PaymentMethodBadges compact title={websiteText("PayMongo Secure Channels")} />

      {waitingForPayment ? (
        <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#34d399', fontWeight: 600, marginBottom: '6px' }}>
            <Loader2 size={16} className="spin" />
            <span>{websiteText("Awaiting PayMongo Confirmation…")}</span>
          </div>
          <p className="muted" style={{ fontSize: '12px', margin: '0 0 10px 0' }}>{websiteText("Please finish your payment in the checkout tab. This page will update automatically once verified.")}</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
            {safeCheckout && <>
              <a
                className="button text-button"
                href={resolvedUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '12px', padding: '4px 8px' }}
              >
                <ExternalLink size={12} />{' '}{websiteText("Re-open checkout tab")}
              </a>
              <a
                className="button text-button"
                href={resolvedUrl}
                target="_self"
                style={{ fontSize: '12px', padding: '4px 8px' }}
              >{websiteText("Continue in this tab")}</a>
            </>}
          </div>
        </div>
      ) : (
        safeCheckout && !disabled ? (
          <a
            className="button dark-button payment-submit"
            href={resolvedUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleCheckoutOpened}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px' }}
          >
            <ExternalLink size={16} />{' '}{websiteText("Pay ₱")}{amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}{websiteText("via PayMongo · opens in new tab")}
          </a>
        ) : (
          <button
            type="button"
            className="button dark-button payment-submit"
            onClick={handleUnavailableCheckout}
            disabled={disabled}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px' }}
          >
            {disabled ? (
              <>
                <Loader2 size={16} className="spin" />{' '}{websiteText("Loading…")}</>
            ) : (
              <>{websiteText("PayMongo checkout unavailable")}</>
            )}
          </button>
        )
      )}

      <p className="muted" style={{ fontSize: '12px', textAlign: 'center', margin: 0 }}>{websiteText("Powered by PayMongo Philippines · 256-bit encrypted checkout")}</p>
    </div>
  )
}
