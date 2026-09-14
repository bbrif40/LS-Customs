/**
 * usePaymentStatus — subscribe to a single payment's status in real time.
 *
 * Fetches the current status on mount and subscribes to UPDATE on the
 * `payments` row via Supabase Realtime. Returns the latest status so the
 * UI can react to webhook-driven transitions (e.g. 3DS challenge completed
 * asynchronously by Stripe).
 *
 * Also works for the `refunded` status — the admin refund flow updates the
 * same row, so the customer sees the status flip without a refresh.
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded'

export interface PaymentStatusInfo {
  status: PaymentStatus
  amount: number
  currency: string
  provider: string | null
}

interface UsePaymentStatusResult {
  status: PaymentStatusInfo | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function usePaymentStatus(paymentId: string | null | undefined): UsePaymentStatusResult {
  const [status, setStatus] = useState<PaymentStatusInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!paymentId) {
      setStatus(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    try {
      const { data, error: queryError } = await supabase
        .from('payments')
        .select('status, amount, currency, provider')
        .eq('id', paymentId)
        .single()

      if (queryError) {
        setError(queryError.message)
      } else if (data) {
        setStatus({
          status: data.status,
          amount: Number(data.amount),
          currency: data.currency,
          provider: data.provider,
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [paymentId])

  useEffect(() => {
    void fetchStatus()
  }, [fetchStatus])

  useEffect(() => {
    if (!paymentId) return

    const channel = supabase
      .channel(`payment-status:${paymentId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'payments',
        filter: `id=eq.${paymentId}`,
      }, (payload) => {
        const newRow = payload.new as { status: PaymentStatus; amount: number; currency: string; provider: string }
        setStatus({
          status: newRow.status,
          amount: Number(newRow.amount),
          currency: newRow.currency,
          provider: newRow.provider,
        })
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [paymentId])

  return { status, loading, error, refetch: fetchStatus }
}
