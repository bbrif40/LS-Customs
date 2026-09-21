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
  checkout_url?: string
  amount: number
  currency: string
  provider: string
}

interface UsePaymentIntentResult {
  creating: boolean
  error: string | null
  createIntent: (
    bookingType: BookingType,
    bookingId: string,
    redirectUrls?: { successUrl?: string; cancelUrl?: string },
  ) => Promise<PaymentIntentResult | null>
}

export function usePaymentIntent(): UsePaymentIntentResult {
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createIntent = useCallback(async (
    bookingType: BookingType,
    bookingId: string,
    redirectUrls?: { successUrl?: string; cancelUrl?: string },
  ): Promise<PaymentIntentResult | null> => {
    setCreating(true)
    setError(null)

    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const defaultSuccess = `${origin}/bookings?payment=success&booking_id=${bookingId}&type=${bookingType}`
    const defaultCancel = `${origin}/bookings?payment=cancelled&booking_id=${bookingId}&type=${bookingType}`

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('create-payment-intent', {
        body: {
          booking_type: bookingType,
          booking_id: bookingId,
          success_url: redirectUrls?.successUrl ?? defaultSuccess,
          cancel_url: redirectUrls?.cancelUrl ?? defaultCancel,
        },
        headers: { 'Idempotency-Key': `${bookingType}:${bookingId}` },
      })

      if (invokeError) {
        let detailedMsg = invokeError.message
        try {
          if ('context' in invokeError && typeof (invokeError as any).context?.json === 'function') {
            const body = await (invokeError as any).context.json()
            if (body?.error?.message) {
              detailedMsg = body.error.message
            } else if (body?.message) {
              detailedMsg = body.message
            }
          }
        } catch {
          // ignore
        }
        setError(detailedMsg)
        return null
      }

      // The Edge Function wraps its response in { data, error } per jsonResponse helper.
      // Unwrap data.data if nested, or fall back to data.
      const payload = (data as any)?.data?.payment_id ? (data as any).data : ((data as any)?.data ?? data)
      const wrappedError = (data as any)?.error?.message

      if (wrappedError) {
        setError(wrappedError)
        return null
      }

      if (!payload?.payment_id) {
        setError(payload?.message ?? (data as any)?.message ?? 'Payment intent could not be created')
        return null
      }

      return payload as PaymentIntentResult
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
