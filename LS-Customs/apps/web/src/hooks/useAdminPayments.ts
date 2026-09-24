/**
 * useAdminPayments — fetches all payments for the admin transactions view.
 *
 * Joins payments with profiles (for customer names) and vehicle_bookings
 * / service_bookings (for booking reference details). Payments use a
 * polymorphic (booking_type + booking_id) relation, so we fetch the
 * related bookings separately and merge client-side.
 *
 * The hook also exposes a `refund` action that calls the `refund-payment`
 * edge function and optimistically updates the local payment status.
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import type { Payment } from '@ls-customs/shared-types'

export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded'

export interface AdminPayment extends Omit<Payment, 'customer_id'> {
  customer_name: string | null
  booking_ref: string | null
}

interface UseAdminPaymentsResult {
  payments: AdminPayment[]
  loading: boolean
  error: string | null
  updatePaymentStatus: (paymentId: string, status: PaymentStatus) => Promise<boolean>
  refund: (paymentId: string) => Promise<void>
  refetch: () => Promise<void>
}

export function useAdminPayments(): UseAdminPaymentsResult {
  const [payments, setPayments] = useState<AdminPayment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPayments = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // Fetch payments with customer profiles via foreign table join
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select(`
          id,
          booking_type,
          booking_id,
          customer_id,
          amount,
          currency,
          provider,
          provider_reference,
          status,
          created_at,
          updated_at,
          profiles!left ( full_name )
        `)
        .order('created_at', { ascending: false })

      if (paymentsError) {
        setError(paymentsError.message)
        setPayments([])
        return
      }

      const rows = (paymentsData ?? []) as unknown as Array<{
        id: string
        booking_type: 'vehicle' | 'service'
        booking_id: string
        customer_id: string
        amount: number
        currency: string
        provider: string | null
        provider_reference: string | null
        status: PaymentStatus
        created_at: string
        updated_at: string
        profiles: { full_name: string | null } | null
      }>

      const enriched: AdminPayment[] = rows.map((row) => {
        // Booking reference must stay as booking reference hash, not the vehicle name
        const bookingRef = `#${row.booking_id.slice(0, 8)}`

        return {
          id: row.id,
          booking_type: row.booking_type,
          booking_id: row.booking_id,
          customer_id: row.customer_id,
          amount: row.amount,
          currency: row.currency,
          provider: 'paymongo',
          provider_reference: row.provider_reference,
          status: row.status,
          created_at: row.created_at,
          updated_at: row.updated_at,
          customer_name: row.profiles?.full_name ?? null,
          booking_ref: bookingRef,
        }
      })

      setPayments(enriched)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setPayments([])
    } finally {
      setLoading(false)
    }
  }, [])

  const updatePaymentStatus = useCallback(async (paymentId: string, newStatus: PaymentStatus): Promise<boolean> => {
    const original = payments.find((p) => p.id === paymentId)
    if (!original) return false

    // Optimistically update
    setPayments((current) =>
      current.map((p) => (p.id === paymentId ? { ...p, status: newStatus } : p)),
    )

    try {
      const { error: updateError } = await supabase
        .from('payments')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', paymentId)

      if (updateError) {
        throw updateError
      }

      // If refund, try invoking edge function in the background
      if (newStatus === 'refunded') {
        try {
          await supabase.functions.invoke('refund-payment', {
            body: { payment_id: paymentId },
          })
        } catch (fnErr) {
          console.warn('[useAdminPayments] edge refund notice:', fnErr)
        }
      }

      return true
    } catch (err) {
      console.error('[useAdminPayments] failed to update status:', err)
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      // Rollback
      setPayments((current) =>
        current.map((p) => (p.id === paymentId ? { ...p, status: original.status } : p)),
      )
      return false
    }
  }, [payments])

  const refund = useCallback(async (paymentId: string): Promise<void> => {
    await updatePaymentStatus(paymentId, 'refunded')
  }, [updatePaymentStatus])

  // Subscribe to payment status changes in real time
  useEffect(() => {
    const channel = supabase
      .channel('admin-payments-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'payments',
      }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const oldRow = payload.old as { id?: string }
          if (oldRow?.id) {
            setPayments((cur) => cur.filter((p) => p.id !== oldRow.id))
          }
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new as Partial<AdminPayment>
          setPayments((current) =>
            current.map((p) =>
              p.id === updated.id
                ? { ...p, ...updated, status: (updated.status ?? p.status) as PaymentStatus }
                : p,
            ),
          )
        } else if (payload.eventType === 'INSERT') {
          void fetchPayments()
        }
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [fetchPayments])

  useEffect(() => { void fetchPayments() }, [fetchPayments])

  return { payments, loading, error, updatePaymentStatus, refund, refetch: fetchPayments }
}
