/**
 * usePaymentIntent — thin wrapper around the `create-payment-intent` edge function.
 *
 * Returns `{ payment_id, client_secret, amount, currency, provider }` once the
 * intent is created. The client_secret is then handed to <PaymentForm> which
 * renders the correct provider SDK (Stripe Elements or PayMongo Checkout).
 *
 * The hook is a fire-and-forget creator — it does NOT poll for status. Status
 * tracking is handled by usePaymentStatus (subscribe to the payments table).
 */
import { useCallback, useState } from 'react'
import { supabase } from '../supabaseClient'

export type BookingType = 'vehicle' | 'service'

export interface PaymentIntentResult {
  payment_id: string
  client_secret: string
  amount: number
  currency: string
  provider: string
}

interface UsePaymentIntentResult {
  creating: boolean
  error: string | null
  createIntent: (bookingType: BookingType, bookingId: string) => Promise<PaymentIntentResult | null>
}

export function usePaymentIntent(): UsePaymentIntentResult {
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createIntent = useCallback(async (
    bookingType: BookingType,
    bookingId: string,
  ): Promise<PaymentIntentResult | null> => {
    setCreating(true)
    setError(null)

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('create-payment-intent', {
        body: { booking_type: bookingType, booking_id: bookingId },
        headers: { 'Idempotency-Key': `${bookingType}:${bookingId}` },
      })

      if (invokeError) {
        setError(invokeError.message)
        return null
      }

      if (!data?.payment_id) {
        setError(data?.message ?? 'Payment intent could not be created')
        return null
      }

      return data as PaymentIntentResult
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      return null
    } finally {
      setCreating(false)
    }
  }, [])

  return { creating, error, createIntent }
}
