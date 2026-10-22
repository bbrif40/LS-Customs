/**
 * Loads actual collections and completed-booking revenue recognitions for the
 * admin transactions view. Recognition rows are reporting entries, never
 * payment records, and cannot be refunded or marked as paid.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { requireFunctionData } from '../utils/functionResult'
import {
  accountQuoteChargeIds,
  projectPendingAccountQuoteAttempts,
  type AccountQuoteProjection,
} from '../utils/adminTransactionProjection'
import type { Payment } from '@ls-customs/shared-types'

let realtimeInstance = 0
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded'
export type AdminTransactionStatus = PaymentStatus | 'recognized'
export type AdminTransactionKind = 'collection' | 'recognition'

export interface AdminPayment extends Omit<Payment, 'customer_id' | 'status'> {
  customer_id: string
  status: AdminTransactionStatus
  customer_name: string | null
  record_kind: AdminTransactionKind
  record_source: string | null
  is_payment: boolean
  account_quote_id: string | null
  account_quote_charge_count?: number
  account_quote_bookings?: { booking_type: 'vehicle' | 'service'; booking_id: string }[]
  can_complete_balance?: boolean
}

interface UseAdminPaymentsResult {
  payments: AdminPayment[]
  loading: boolean
  error: string | null
  warning: string | null
  updatePaymentStatus: (paymentId: string, status: 'refunded', reason?: string) => Promise<boolean>
  refund: (paymentId: string) => Promise<void>
  completeTransaction: (target: AdminTransactionCompletionTarget, reason: string) => Promise<void>
  refetch: () => Promise<void>
}

export type AdminTransactionCompletionTarget =
  | { kind: 'account_quote'; paymentId: string }
  | { kind: 'service_base'; bookingId: string }

interface FinancialRow {
  id: string
  booking_type: 'vehicle' | 'service'
  booking_id: string
  customer_id: string
  amount: number | string
  currency: string
  provider: string | null
  provider_reference: string | null
  status: PaymentStatus
  created_at: string
  updated_at?: string
  account_quote_id?: string | null
  source_payment_id?: string | null
  settlement_request_id?: string | null
  allocation_count?: number | null
}

interface AccountChargeRow {
  id: string
  booking_type: 'vehicle' | 'service'
  booking_id: string
  kind: string
  amount: number | string
  paid: number | string
  waived: number | string
}

interface RecognitionRow {
  id: string
  payment_id: string | null
  booking_type: 'vehicle' | 'service'
  booking_id: string
  customer_id: string
  amount: number | string
  currency: string
  source: string
  status: AdminTransactionStatus
  created_at: string
}

export function useAdminPayments(): UseAdminPaymentsResult {
  const [payments, setPayments] = useState<AdminPayment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const fetchGeneration = useRef(0)

  const fetchPayments = useCallback(async () => {
    const generation = ++fetchGeneration.current
    setLoading(true)
    setError(null)

    try {
      const [collectionsResult, revenueResult] = await Promise.all([
        supabase
          .from('financial_collections')
          .select('id, booking_type, booking_id, customer_id, amount, currency, provider, provider_reference, status, created_at, updated_at, account_quote_id, source_payment_id, settlement_request_id, allocation_count')
          .order('created_at', { ascending: false }),
        supabase
          .from('financial_revenue')
          .select('id, payment_id, booking_type, booking_id, customer_id, amount, currency, source, status, created_at')
          .order('created_at', { ascending: false }),
      ])

      if (collectionsResult.error) throw collectionsResult.error
      if (revenueResult.error) throw revenueResult.error

      const collectionRows = (collectionsResult.data ?? []) as unknown as FinancialRow[]
      const recognitionRows = (revenueResult.data ?? []) as unknown as RecognitionRow[]
      const collectionIds = new Set(collectionRows.map((row) => row.id))
      const paymentIds = new Set(collectionRows
        .filter((row) => row.provider !== 'cash_ledger')
        .map((row) => row.id))
      const onlineRevenueRows = recognitionRows.filter((row) => row.source === 'online_payment')
      const onlineRevenueIds = new Set(onlineRevenueRows.map((row) => row.id))
      const customerIds = Array.from(new Set([
        ...collectionRows.map((row) => row.customer_id),
        ...recognitionRows.map((row) => row.customer_id),
      ].filter(Boolean)))

      const cashServiceBookingIds = Array.from(new Set(recognitionRows
        .filter((row) => row.source === 'cash_completion' && row.booking_type === 'service')
        .map((row) => row.booking_id)))
      const baseChargesResult = cashServiceBookingIds.length > 0
        ? await supabase.from('account_charges')
          .select('id, booking_type, booking_id, kind, amount, paid, waived')
          .eq('kind', 'service_base')
          .in('booking_id', cashServiceBookingIds)
        : { data: [], error: null }
      if (baseChargesResult.error) throw baseChargesResult.error
      const accountQuoteIds = Array.from(new Set(collectionRows
        .map((row) => row.account_quote_id)
        .filter((id): id is string => Boolean(id))))
      const accountQuotesResult = accountQuoteIds.length > 0
        ? await supabase.from('account_quotes').select('id, customer_id, allocations, settled_at').in('id', accountQuoteIds)
        : { data: [], error: null }
      if (accountQuotesResult.error) throw accountQuotesResult.error
      const accountQuotes = (accountQuotesResult.data ?? []) as unknown as AccountQuoteProjection[]
      const quoteChargeIds = Array.from(new Set(accountQuotes.flatMap(accountQuoteChargeIds)))
      const quoteChargesResult = quoteChargeIds.length > 0
        ? await supabase.from('account_charges')
          .select('id, booking_type, booking_id, kind, amount, paid, waived')
          .in('id', quoteChargeIds)
        : { data: [], error: null }
      if (quoteChargesResult.error) throw quoteChargesResult.error
      const quoteCharges = (quoteChargesResult.data ?? []) as unknown as AccountChargeRow[]
      const quoteChargeById = new Map(quoteCharges.map((charge) => [charge.id, charge]))
      const baseCharges = (baseChargesResult.data ?? []) as unknown as AccountChargeRow[]
      const baseChargeByBooking = new Map(baseCharges.map((charge) => [charge.booking_id, charge]))
      const quoteById = new Map(accountQuotes.map((quote) => [quote.id, quote]))
      const quoteDetails = (quoteId: string | null) => {
        if (!quoteId) return { chargeCount: undefined, bookings: undefined }
        const quote = quoteById.get(quoteId)
        const ids = quote ? accountQuoteChargeIds(quote) : []
        const bookings = Array.from(new Map(ids.flatMap((id) => {
          const charge = quoteChargeById.get(id)
          return charge ? [[`${charge.booking_type}:${charge.booking_id}`, {
            booking_type: charge.booking_type,
            booking_id: charge.booking_id,
          }] as const] : []
        })).values())
        return { chargeCount: ids.length, bookings }
      }
      const customersById = new Map<string, string>()

      if (customerIds.length > 0) {
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', customerIds)

        if (!profileError && profiles) {
          for (const profile of profiles as { id: string; full_name: string | null }[]) {
            customersById.set(profile.id, profile.full_name ?? 'Unknown Customer')
          }
        }
      }

      const collectionTransactions: AdminPayment[] = collectionRows.map((row) => ({
        id: row.id,
        booking_type: row.booking_type,
        booking_id: row.booking_id,
        customer_id: row.customer_id,
        amount: Number(row.amount),
        currency: row.currency ?? 'PHP',
        provider: row.provider,
        provider_reference: row.provider_reference,
        status: row.provider === 'admin_cash_settlement' && row.status === 'succeeded' ? 'recognized' : row.status,
        created_at: row.created_at,
        updated_at: row.updated_at ?? row.created_at,
        customer_name: customersById.get(row.customer_id) ?? null,
        record_kind: 'collection',
        record_source: row.provider === 'admin_cash_settlement'
          ? 'admin_settlement_cash'
          : row.provider === 'cash_ledger'
            ? 'cash_collection'
            : onlineRevenueIds.has(row.id) ? 'online_payment' : 'payment',
        is_payment: row.provider !== 'cash_ledger' && row.provider !== 'admin_cash_settlement',
        account_quote_id: row.account_quote_id ?? null,
        ...quoteDetails(row.account_quote_id ?? null),
      }))

      const cashRecognitionTransactions: AdminPayment[] = recognitionRows
        .filter((row) => row.source === 'cash_completion')
        .map((row) => ({
        id: row.id,
        booking_type: row.booking_type,
        booking_id: row.booking_id,
        customer_id: row.customer_id,
        amount: Number(row.amount),
        currency: row.currency ?? 'PHP',
        provider: null,
        provider_reference: null,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.created_at,
        customer_name: customersById.get(row.customer_id) ?? null,
        record_kind: 'recognition',
        record_source: row.source,
        is_payment: false,
        account_quote_id: null,
        can_complete_balance: row.booking_type === 'service' && (() => {
          const charge = baseChargeByBooking.get(row.booking_id)
          return Boolean(charge && Number(charge.amount) > Number(charge.paid) + Number(charge.waived))
        })(),
      }))

      const accountChargeTransactions: AdminPayment[] = recognitionRows
        .filter((row) => row.source === 'account_charge_online' || row.source === 'account_charge_cash')
        .filter((row) => row.payment_id
          ? !paymentIds.has(row.payment_id)
          : !collectionIds.has(row.id))
        .map((row) => ({
          id: row.id,
          booking_type: row.booking_type,
          booking_id: row.booking_id,
          customer_id: row.customer_id,
          amount: Number(row.amount),
          currency: row.currency ?? 'PHP',
          provider: null,
          provider_reference: null,
          status: row.status,
          created_at: row.created_at,
          updated_at: row.created_at,
          customer_name: customersById.get(row.customer_id) ?? null,
          record_kind: 'collection',
          record_source: row.source,
          is_payment: false,
          account_quote_id: null,
        }))

      const unlinkedOnlineRevenueTransactions: AdminPayment[] = onlineRevenueRows
        .filter((row) => !collectionIds.has(row.id))
        .map((row) => ({
          id: row.id,
          booking_type: row.booking_type,
          booking_id: row.booking_id,
          customer_id: row.customer_id,
          amount: Number(row.amount),
          currency: 'PHP',
          provider: 'online_payment',
          provider_reference: null,
          status: row.status,
          created_at: row.created_at,
          updated_at: row.created_at,
          customer_name: customersById.get(row.customer_id) ?? null,
          record_kind: 'collection',
          record_source: 'online_payment',
          is_payment: true,
          account_quote_id: null,
        }))

      const settlementGroups = new Map<string, FinancialRow[]>()
      for (const row of collectionRows) {
        if (row.provider !== 'admin_cash_settlement' || !row.settlement_request_id) continue
        const group = settlementGroups.get(row.settlement_request_id) ?? []
        group.push(row)
        settlementGroups.set(row.settlement_request_id, group)
      }
      const adminSettlementTransactions: AdminPayment[] = Array.from(settlementGroups.entries()).map(([requestId, rows]) => {
        const first = rows[0]
        const bookings = Array.from(new Map(rows.map((row) => [`${row.booking_type}:${row.booking_id}`, {
          booking_type: row.booking_type,
          booking_id: row.booking_id,
        }])).values())
        return {
          id: `admin-settlement:${requestId}`,
          booking_type: first.booking_type,
          booking_id: first.booking_id,
          customer_id: first.customer_id,
          amount: rows.reduce((total, row) => total + Number(row.amount), 0),
          currency: first.currency ?? 'PHP',
          provider: 'admin_cash_settlement',
          provider_reference: null,
          status: 'recognized',
          created_at: first.created_at,
          updated_at: first.updated_at ?? first.created_at,
          customer_name: customersById.get(first.customer_id) ?? null,
          record_kind: 'collection',
          record_source: 'admin_settlement_cash',
          is_payment: false,
          account_quote_id: first.account_quote_id ?? null,
          account_quote_charge_count: first.allocation_count ?? rows.length,
          account_quote_bookings: bookings,
        }
      })
      const settledSourcePaymentIds = new Set(collectionRows
        .filter((row) => row.provider === 'admin_cash_settlement' && row.source_payment_id)
        .map((row) => row.source_payment_id as string))
      const transactionRows = [
        ...collectionTransactions.filter((row) => !settledSourcePaymentIds.has(row.id)),
        ...cashRecognitionTransactions,
        ...accountChargeTransactions,
        ...unlinkedOnlineRevenueTransactions,
        ...adminSettlementTransactions,
      ]
      const projectedTransactions = projectPendingAccountQuoteAttempts(
        transactionRows,
        accountQuotes,
      )
      const visibleBaseQuoteBookings = new Set(projectedTransactions
        .filter((row) => row.status === 'pending' && row.account_quote_id)
        .flatMap((row) => {
          const quote = quoteById.get(row.account_quote_id!)
          return quote ? accountQuoteChargeIds(quote).flatMap((chargeId) => {
            const charge = quoteChargeById.get(chargeId)
            return charge?.kind === 'service_base' ? [`service:${charge.booking_id}`] : []
          }) : []
        }))
      const settledBaseBookings = new Set(projectedTransactions
        .filter((row) => row.record_source === 'admin_settlement_cash')
        .flatMap((row) => row.account_quote_bookings ?? [{ booking_type: row.booking_type, booking_id: row.booking_id }])
        .filter((booking) => {
          const baseCharge = baseChargeByBooking.get(booking.booking_id)
          return booking.booking_type === 'service'
            && baseCharge
            && Number(baseCharge.paid) + Number(baseCharge.waived) >= Number(baseCharge.amount)
        })
        .map((booking) => `${booking.booking_type}:${booking.booking_id}`))
      const transactionsWithoutDuplicateCashBaseRows = projectedTransactions.filter((row) => {
        const key = `${row.booking_type}:${row.booking_id}`
        const isCoveredCashBase = row.booking_type === 'service'
          && (visibleBaseQuoteBookings.has(key) || settledBaseBookings.has(key))
        if (!isCoveredCashBase) return true
        return !(
          (row.record_kind === 'recognition' && row.record_source === 'cash_completion')
          || (row.record_kind === 'collection' && row.record_source === 'cash_collection')
        )
      })
      if (generation === fetchGeneration.current) {
        setPayments(transactionsWithoutDuplicateCashBaseRows
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (generation === fetchGeneration.current) {
        setError(msg)
        setPayments([])
      }
    } finally {
      if (generation === fetchGeneration.current) setLoading(false)
    }
  }, [])

  const updatePaymentStatus = useCallback(async (paymentId: string, newStatus: 'refunded', reason?: string): Promise<boolean> => {
    const original = payments.find((payment) => payment.id === paymentId)
    if (!original || original.record_kind !== 'collection' || !original.is_payment || original.status !== 'succeeded') return false

    try {
      const refundReason = reason ?? window.prompt('Reason for this refund (required):')
      if (!refundReason || refundReason.trim().length < 3) return false
      requireFunctionData(
        await supabase.functions.invoke('refund-payment', { body: { payment_id: paymentId, reason: refundReason } }),
        'Refund request failed.',
      )
      setWarning('Refund requested. The payment changes only after the provider confirms settlement.')
      window.dispatchEvent(new Event('admin-financial-data-changed'))
      await fetchPayments()
      return true
    } catch (refundError) {
      setError(refundError instanceof Error ? refundError.message : 'Refund failed.')
      return false
    }
  }, [payments, fetchPayments])

  const refund = useCallback(async (paymentId: string): Promise<void> => {
    await updatePaymentStatus(paymentId, 'refunded')
  }, [updatePaymentStatus])

  const completeTransaction = useCallback(async (target: AdminTransactionCompletionTarget, reason: string) => {
    const { error: completionError } = await supabase.rpc('complete_admin_transaction', {
      p_payment: target.kind === 'account_quote' ? target.paymentId : null,
      p_request: crypto.randomUUID(),
      p_reason: reason.trim(),
      p_booking_type: target.kind === 'service_base' ? 'service' : null,
      p_booking: target.kind === 'service_base' ? target.bookingId : null,
    })
    if (completionError) throw completionError
    window.dispatchEvent(new Event('admin-financial-data-changed'))
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel(`admin-financial-transactions:${++realtimeInstance}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => { void fetchPayments() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'account_events' }, () => { void fetchPayments() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_revenue_recognitions' }, () => { void fetchPayments() })
      .subscribe()

    const refreshOnFinancialChange = () => { void fetchPayments() }
    const refreshOnFocus = () => {
      if (document.visibilityState === 'visible') void fetchPayments()
    }
    window.addEventListener('admin-financial-data-changed', refreshOnFinancialChange)
    document.addEventListener('visibilitychange', refreshOnFocus)

    return () => {
      window.removeEventListener('admin-financial-data-changed', refreshOnFinancialChange)
      document.removeEventListener('visibilitychange', refreshOnFocus)
      void supabase.removeChannel(channel)
    }
  }, [fetchPayments])

  useEffect(() => { void fetchPayments() }, [fetchPayments])

  return { payments, loading, error, warning, updatePaymentStatus, refund, completeTransaction, refetch: fetchPayments }
}
