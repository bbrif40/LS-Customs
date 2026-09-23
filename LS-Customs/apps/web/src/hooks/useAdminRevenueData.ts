/**
 * useAdminRevenueData — live revenue metrics for the Revenue Reports page.
 *
 * Replaces the static `revenueStats`, `revenueChartData`, and `transactions`
 * mocks from adminData.ts. Fetches all payments within a date range,
 * aggregates them into daily buckets for the chart, computes summary stats,
 * and provides the raw transaction list for the table.
 *
 * Also subscribes to realtime payment INSERT/UPDATE so new transactions
 * appear without a page refresh.
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import type { Payment, Profile } from '@ls-customs/shared-types'

export interface RevenueStat {
  label: string
  value: string
  sub?: string
  trend?: string
  trendUp?: boolean
  icon: string
}

export interface ChartDataPoint {
  label: string
  rentals: number
  mechanics: number
}

export interface RevenueTransaction {
  date: string
  customer: string
  serviceType: string
  serviceIcon: string
  amount: string
  status: 'completed' | 'refunded' | 'pending'
  provider: string | null
  paymentId: string
}

export interface AdminRevenueData {
  stats: RevenueStat[]
  chartData: { labels: string[]; rentals: number[]; mechanics: number[] }
  transactions: RevenueTransaction[]
  totalTransactions: number
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

// Default to last 30 days
const DEFAULT_DAYS = 30

export function useAdminRevenueData(
  days: number = DEFAULT_DAYS,
): AdminRevenueData {
  const [stats, setStats] = useState<RevenueStat[]>([])
  const [chartData, setChartData] = useState<{ labels: string[]; rentals: number[]; mechanics: number[] }>(
    { labels: [], rentals: [], mechanics: [] },
  )
  const [transactions, setTransactions] = useState<RevenueTransaction[]>([])
  const [totalTransactions, setTotalTransactions] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRevenue = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // Compute date range
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(endDate.getDate() - days)

      const previousStartDate = new Date(startDate)
      previousStartDate.setDate(startDate.getDate() - days)

      // ── 1. Fetch payments in the current period ─────────────────
      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select('id, booking_type, booking_id, customer_id, amount, status, provider, created_at')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: false })

      if (paymentsError) throw paymentsError

      const typedPayments = (payments ?? []) as Payment[]

      // ── 2. Fetch payments in the previous period (for trends) ────
      const { data: prevPayments, error: prevError } = await supabase
        .from('payments')
        .select('amount, status')
        .gte('created_at', previousStartDate.toISOString())
        .lt('created_at', startDate.toISOString())

      if (prevError) {
        console.warn('[useAdminRevenueData] previous period query failed (non-fatal)', prevError)
      }

      // ── 3. Fetch customer names ─────────────────────────────────
      const customerIds = Array.from(
        new Set(typedPayments.map((p) => p.customer_id).filter(Boolean))
      )
      const customersById = new Map<string, string>()
      if (customerIds.length > 0) {
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', customerIds)

        if (!profileError && profiles) {
          for (const p of profiles as { id: string; full_name: string | null }[]) {
            customersById.set(p.id, p.full_name ?? 'Unknown Customer')
          }
        }
      }

      // ── 4. Fetch booking references & statuses ───────────────
      const vehicleBookingIds = typedPayments
        .filter((p) => p.booking_type === 'vehicle')
        .map((p) => p.booking_id)
      const serviceBookingIds = typedPayments
        .filter((p) => p.booking_type === 'service')
        .map((p) => p.booking_id)

      const vehicleRefs = new Map<string, string>()
      const vehicleNames = new Map<string, string>()
      const bookingStatusMap = new Map<string, string>()

      if (vehicleBookingIds.length > 0) {
        type VehicleRow = { id: string; status?: string; vehicles: { name: string } | null }
        let vbRows: VehicleRow[] | null = null

        const { data: joinedVb, error: vbError } = await supabase
          .from('vehicle_bookings')
          .select('id, status, vehicles(name)')
          .in('id', vehicleBookingIds)

        if (!vbError && joinedVb) {
          vbRows = joinedVb as unknown as VehicleRow[]
        } else {
          const { data: fallbackVb } = await supabase
            .from('vehicle_bookings')
            .select('id, status')
            .in('id', vehicleBookingIds)
          vbRows = (fallbackVb ?? []) as unknown as VehicleRow[]
        }

        for (const row of vbRows ?? []) {
          vehicleRefs.set(row.id, `VR-${row.id.slice(0, 8).toUpperCase()}`)
          if (row.vehicles?.name) {
            vehicleNames.set(row.id, row.vehicles.name)
          }
          if (row.status) {
            bookingStatusMap.set(`vehicle:${row.id}`, row.status)
          }
        }
      }

      if (serviceBookingIds.length > 0) {
        const { data: sbRows, error: sbError } = await supabase
          .from('service_bookings')
          .select('id, status')
          .in('id', serviceBookingIds)

        if (!sbError && sbRows) {
          for (const row of (sbRows ?? []) as { id: string; status: string }[]) {
            if (row.status) {
              bookingStatusMap.set(`service:${row.id}`, row.status)
            }
          }
        }
      }

      // Also incorporate completed vehicle bookings in this period that don't have a payments row
      const existingVehicleBookingIds = new Set(vehicleBookingIds)
      const { data: standaloneVb } = await supabase
        .from('vehicle_bookings')
        .select('id, status, customer_id, total_price, created_at, vehicles(name)')
        .eq('status', 'completed')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())

      if (standaloneVb) {
        for (const vb of (standaloneVb as unknown as { id: string; status: string; customer_id: string; total_price: number; created_at: string; vehicles: { name: string } | null }[])) {
          if (!existingVehicleBookingIds.has(vb.id)) {
            existingVehicleBookingIds.add(vb.id)
            if (vb.vehicles?.name) {
              vehicleNames.set(vb.id, vb.vehicles.name)
            }
            bookingStatusMap.set(`vehicle:${vb.id}`, 'completed')
            typedPayments.push({
              id: `vb-${vb.id}`,
              booking_type: 'vehicle',
              booking_id: vb.id,
              customer_id: vb.customer_id,
              amount: Number(vb.total_price),
              currency: 'PHP',
              provider: 'completed_rental',
              provider_reference: null,
              status: 'succeeded',
              created_at: vb.created_at,
              updated_at: vb.created_at,
            })
          }
        }
      }

      // Also incorporate completed service bookings in this period that don't have a payments row
      const existingServiceBookingIds = new Set(serviceBookingIds)
      const { data: standaloneSb } = await supabase
        .from('service_bookings')
        .select('id, status, customer_id, total_price, created_at')
        .eq('status', 'completed')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())

      if (standaloneSb) {
        for (const sb of (standaloneSb as unknown as { id: string; status: string; customer_id: string; total_price: number; created_at: string }[])) {
          if (!existingServiceBookingIds.has(sb.id)) {
            existingServiceBookingIds.add(sb.id)
            bookingStatusMap.set(`service:${sb.id}`, 'completed')
            typedPayments.push({
              id: `sb-${sb.id}`,
              booking_type: 'service',
              booking_id: sb.id,
              customer_id: sb.customer_id,
              amount: Number(sb.total_price),
              currency: 'PHP',
              provider: 'completed_service',
              provider_reference: null,
              status: 'succeeded',
              created_at: sb.created_at,
              updated_at: sb.created_at,
            })
          }
        }
      }

      // Ensure any newly added customer IDs from standalone bookings are fetched
      const missingCustomerIds = Array.from(
        new Set(typedPayments.map((p) => p.customer_id).filter((id) => id && !customersById.has(id)))
      )
      if (missingCustomerIds.length > 0) {
        const { data: newProfiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', missingCustomerIds)
        if (newProfiles) {
          for (const p of newProfiles as { id: string; full_name: string | null }[]) {
            customersById.set(p.id, p.full_name ?? 'Unknown Customer')
          }
        }
      }

      // Any booking that has been marked 'completed' by admin is considered paid/succeeded revenue
      const isPaymentSucceeded = (p: Payment) => {
        if (p.status === 'succeeded') return true
        const bStatus = bookingStatusMap.get(`${p.booking_type}:${p.booking_id}`)
        return bStatus === 'completed'
      }

      // ── 5. Compute revenue stats ────────────────────────────────
      const currentRevenue = typedPayments
        .filter(isPaymentSucceeded)
        .reduce((sum, p) => sum + Number(p.amount), 0)

      const currentCompletedCount = typedPayments.filter(isPaymentSucceeded).length
      const prevRevenue = (prevError ? [] : (prevPayments ?? []))
        .filter((p) => p.status === 'succeeded')
        .reduce((sum, p) => sum + Number(p.amount), 0)

      const aov = currentCompletedCount > 0 ? currentRevenue / currentCompletedCount : 0
      const prevAov = ((prevPayments ?? []).filter((p) => p.status === 'succeeded').length) || 1
      const prevAovAmount = ((prevPayments ?? []).filter((p) => p.status === 'succeeded')
        .reduce((sum, p) => sum + Number(p.amount), 0)) / prevAov

      const prevRevenueTrend = prevRevenue > 0
        ? ((currentRevenue - prevRevenue) / prevRevenue) * 100
        : currentRevenue > 0 ? 100 : 0

      const aovTrend = prevAovAmount > 0
        ? ((aov - prevAovAmount) / prevAovAmount) * 100
        : aov > 0 ? 100 : 0

      // ── 6. Build daily chart buckets ────────────────────────────
      const buckets = new Map<string, { rentals: number; mechanics: number }>()
      const allDates: string[] = []

      for (let i = days - 1; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const dateKey = d.toLocaleDateString('en-US', { month: 'short' })
        allDates.push(dateKey)
        buckets.set(dateKey, { rentals: 0, mechanics: 0 })
      }

      for (const p of typedPayments) {
        if (!isPaymentSucceeded(p)) continue
        const dateKey = new Date(p.created_at).toLocaleDateString('en-US', { month: 'short' })
        const bucket = buckets.get(dateKey)
        if (bucket) {
          if (p.booking_type === 'vehicle') {
            bucket.rentals += Number(p.amount)
          } else {
            bucket.mechanics += Number(p.amount)
          }
        }
      }

      // Aggregate same-month dates (e.g., Jan 5 + Jan 12 → Jan bucket)
      const aggregated = new Map<string, { rentals: number; mechanics: number }>()
      for (const dateKey of allDates) {
        const bucket = buckets.get(dateKey)!
        if (!aggregated.has(dateKey)) {
          aggregated.set(dateKey, { rentals: 0, mechanics: 0 })
        }
        const agg = aggregated.get(dateKey)!
        agg.rentals += bucket.rentals
        agg.mechanics += bucket.mechanics
      }

      // Deduplicate labels (same month appears multiple times)
      const uniqueLabels: string[] = []
      for (const d of allDates) {
        if (!uniqueLabels.includes(d)) uniqueLabels.push(d)
      }

      const rentalsData = uniqueLabels.map((l) => aggregated.get(l)!.rentals)
      const mechanicsData = uniqueLabels.map((l) => aggregated.get(l)!.mechanics)

      // ── 7. Build transaction list for the table ─────────────────
      const txList: RevenueTransaction[] = typedPayments.map((p) => {
        const customer = customersById.get(p.customer_id) ?? (p.customer_id ? p.customer_id.slice(0, 8) : 'Customer')
        const ref = p.booking_type === 'vehicle'
          ? (vehicleRefs.get(p.booking_id) ?? `#${p.booking_id.slice(0, 8)}`)
          : `#${p.booking_id.slice(0, 8)}`
        const succeeded = isPaymentSucceeded(p)

        if (succeeded && p.status !== 'succeeded' && !p.id.startsWith('vb-')) {
          void supabase.from('payments').update({ status: 'succeeded' }).eq('id', p.id)
        }

        const vName = vehicleNames.get(p.booking_id)
        const vehicleLabel = vName ? `${vName} Rental` : 'Premium Sedan Rental'

        return {
          date: new Date(p.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
          customer,
          serviceType: p.booking_type === 'vehicle' ? vehicleLabel : 'Mobile Mechanic Service',
          serviceIcon: p.booking_type === 'vehicle' ? 'vehicle' : 'service',
          amount: `${Number(p.amount).toLocaleString()}.00`,
          status: succeeded ? 'completed' : p.status as 'completed' | 'refunded' | 'pending',
          provider: p.provider,
          paymentId: p.id,
        }
      })

      // ── 8. Compute summary stats ────────────────────────────────
      const computedStats: RevenueStat[] = [
        {
          label: 'Total Revenue',
          value: `₱${currentRevenue.toLocaleString()}`,
          trend: prevRevenueTrend !== 0 && prevRevenue > 0
            ? `${prevRevenueTrend >= 0 ? '+' : ''}${prevRevenueTrend.toFixed(1)}% period over period`
            : undefined,
          trendUp: prevRevenueTrend >= 0,
          icon: 'revenue',
        },
        {
          label: 'Average Order Value',
          value: `₱${aov.toFixed(2)}`,
          trend: aovTrend !== 0 && prevAovAmount > 0
            ? `${aovTrend >= 0 ? '+' : ''}${aovTrend.toFixed(1)}% vs last period`
            : undefined,
          trendUp: aovTrend >= 0,
          icon: 'avg',
        },
        {
          label: 'Total Transactions',
          value: String(typedPayments.length),
          sub: `${currentCompletedCount} completed`,
          icon: 'subs',
        },
      ]

      setStats(computedStats)
      setChartData({
        labels: uniqueLabels,
        rentals: rentalsData,
        mechanics: mechanicsData,
      })
      setTransactions(txList)
      setTotalTransactions(txList.length)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load revenue data')
      setStats([])
      setChartData({ labels: [], rentals: [], mechanics: [] })
      setTransactions([])
      setTotalTransactions(0)
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    void fetchRevenue()
  }, [fetchRevenue])

  // ── Realtime: refresh when payments or bookings change ──────
  useEffect(() => {
    const channel = supabase
      .channel('admin-revenue-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'payments',
      }, () => { void fetchRevenue() })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'service_bookings',
      }, () => { void fetchRevenue() })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'vehicle_bookings',
      }, () => { void fetchRevenue() })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [fetchRevenue])

  return {
    stats,
    chartData,
    transactions,
    totalTransactions,
    loading,
    error,
    refetch: fetchRevenue,
  }
}
