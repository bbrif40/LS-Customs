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
  customer_email: string | null
  booking_ref: string | null  // vehicle: "VS-{plate}", service: "LSC-{id}"
}

interface UseAdminPaymentsResult {
  payments: AdminPayment[]
  loading: boolean
  error: string | null
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
          profiles!left ( full_name, email )
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
        profiles: { full_name: string | null; email: string | null } | null
      }>

      // Fetch vehicle booking plates (for reference labels)
      const vehicleIds = rows.filter((r) => r.booking_type === 'vehicle').map((r) => r.booking_id)
      const serviceIds = rows.filter((r) => r.booking_type === 'service').map((r) => r.booking_id)

      const vehicleRefs = new Map<string, string>()
      const serviceRefs = new Map<string, string>()

      if (vehicleIds.length > 0) {
        type VehicleRow = { id: string; vehicles: { plate: string } | null }
        const { data: vehicles, error: vErr } = await supabase
          .from('vehicle_bookings')
          .select('id, vehicles!inner(plate)')
          .in('id', vehicleIds)
        if (!vErr && vehicles) {
          for (const v of (vehicles as unknown as VehicleRow[])) {
            if (v.vehicles?.plate) {
              vehicleRefs.set(v.id, v.vehicles.plate)
            }
          }
        }
      }

      if (serviceIds.length > 0) {
        // Service bookings don't have a plate; use the booking ID as the ref
        type ServiceRow = { id: string }
        const { data: services, error: sErr } = await supabase
          .from('service_bookings')
          .select('id')
          .in('id', serviceIds)
        if (!sErr && services) {
          for (const s of (services as unknown as ServiceRow[])) {
            // Just map to a short reference
            serviceRefs.set(s.id, s.id.slice(0, 8))
          }
        }
      }

      const enriched: AdminPayment[] = rows.map((row) => {
        const bookingRef = row.booking_type === 'vehicle'
          ? vehicleRefs.get(row.booking_id)
            ? `VS-${vehicleRefs.get(row.booking_id)}`
            : `#${row.booking_id.slice(0, 8)}`
          : `#${serviceRefs.get(row.booking_id) ?? row.booking_id.slice(0, 8)}`

        return {
          id: row.id,
          booking_type: row.booking_type,
          booking_id: row.booking_id,
          customer_id: row.customer_id,
          amount: row.amount,
          currency: row.currency,
          provider: row.provider,
          provider_reference: row.provider_reference,
          status: row.status,
          created_at: row.created_at,
          updated_at: row.updated_at,
          customer_name: row.profiles?.full_name ?? null,
          customer_email: row.profiles?.email ?? null,
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

  const refund = useCallback(async (paymentId: string): Promise<void> => {
    const original = payments.find((p) => p.id === paymentId)
    if (!original) return

    // Optimistically mark as refunded
    setPayments((current) =>
      current.map((p) => (p.id === paymentId ? { ...p, status: 'refunded' } : p)),
    )

    try {
      const { error: refundError } = await supabase.functions.invoke('refund-payment', {
        body: { payment_id: paymentId },
      })
      if (refundError) {
        // Rollback
        setPayments((current) =>
          current.map((p) => (p.id === paymentId ? { ...p, status: original.status } : p)),
        )
        throw refundError
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      // Rollback to original status
      setPayments((current) =>
        current.map((p) => (p.id === paymentId ? { ...p, status: original.status } : p)),
      )
    }
  }, [payments])

  // Subscribe to payment status changes in real time
  useEffect(() => {
    const channel = supabase
      .channel('admin-payments-changes')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'payments',
      }, (payload) => {
        const updated = payload.new as Partial<AdminPayment>
        setPayments((current) =>
          current.map((p) =>
            p.id === updated.id
              ? { ...p, ...updated, status: (updated.status ?? p.status) as PaymentStatus }
              : p,
          ),
        )
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [])

  useEffect(() => { void fetchPayments() }, [fetchPayments])

  return { payments, loading, error, refund, refetch: fetchPayments }
}
