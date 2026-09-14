/**
 * Lazy-loaded Stripe SDK helpers.
 *
 * Loads @stripe/stripe-js on demand so the Stripe SDK (~50kb) is only
 * fetched when the customer reaches a payment form.
 */
import { loadStripe as loadStripeJs, Stripe, StripeElements } from '@stripe/stripe-js'

let stripePromise: Promise<Stripe | null> | null = null
let stripeInstance: Stripe | null = null
let elementsInstance: StripeElements | null = null

/**
 * Load Stripe.js with the configured publishable key.
 * Memoized — subsequent calls return the cached promise.
 */
export function getStripe(
  publishableKey: string = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY,
): Promise<Stripe | null> {
  if (!publishableKey) {
    throw new Error(
      'VITE_STRIPE_PUBLISHABLE_KEY is not set. Configure it in .env to use Stripe.',
    )
  }
  if (!stripePromise) {
    stripePromise = loadStripeJs(publishableKey)
  }
  return stripePromise
}

/**
 * Convenience: load Stripe + create Elements for a given client secret.
 * Returns both the Stripe instance and the Elements instance so the
 * caller can render <CardElement /> via useElements.
 */
export async function initStripe(clientSecret: string): Promise<{
  stripe: Stripe
  elements: StripeElements
}> {
  const stripe = await getStripe()
  if (!stripe) throw new Error('Failed to load Stripe.js')

  // Cache: elements is keyed to the client secret. When it changes
  // (e.g. retry after a failed payment) we re-create.
  if (clientSecret && stripeInstance === stripe && elementsInstance) {
    // Re-create elements with the new client secret
    elementsInstance = stripe.elements({ clientSecret })
  } else {
    elementsInstance = stripe.elements({ clientSecret })
    stripeInstance = stripe
  }

  return { stripe, elements: elementsInstance }
}
