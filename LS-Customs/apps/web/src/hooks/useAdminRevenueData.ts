/** Live earned revenue and collection records for the admin Revenue Reports page. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'

let realtimeInstance = 0
export interface RevenueStat {
  label: string
  value: string
  sub?: string
  trend?: string
  trendUp?: boolean
  icon: string
}

export interface RevenueTransaction {
  recordId: string
  recordKind: 'collection' | 'recognition'
  date: string
  createdAt: string
  customer: string
  bookingId: string
  serviceType: string
  serviceIcon: string
  amount: string
  status: 'completed' | 'refunded' | 'pending' | 'failed' | 'recognized'
  provider: string | null
  recordSource: 'cash_completion' | 'online_payment' | 'account_charge_online' | 'account_charge_cash'
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

interface FinancialRow {
  id: string
  booking_type: 'vehicle' | 'service'
  booking_id: string
  customer_id: string
  amount: number | string
  status: string
  provider: string | null
  created_at: string
}

interface RecognitionRow {
  id: string
  payment_id: string | null
  booking_type: 'vehicle' | 'service'
  booking_id: string
  customer_id: string
  amount: number | string
  status: 'recognized' | 'succeeded'
  source: string
  created_at: string
}

interface BookingRow {
  id: string
  status?: string
  vehicles?: { name: string } | null
}

const DEFAULT_DAYS = 30

export function useAdminRevenueData(days: number = DEFAULT_DAYS): AdminRevenueData {
  const [stats, setStats] = useState<RevenueStat[]>([])
  const [chartData, setChartData] = useState<{ labels: string[]; rentals: number[]; mechanics: number[] }>({ labels: [], rentals: [], mechanics: [] })
  const [transactions, setTransactions] = useState<RevenueTransaction[]>([])
  const [totalTransactions, setTotalTransactions] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fetchGeneration = useRef(0)

  const fetchRevenue = useCallback(async () => {
    const generation = ++fetchGeneration.current
    setLoading(true)
    setError(null)

    try {
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(endDate.getDate() - days)
      const previousStartDate = new Date(startDate)
      previousStartDate.setDate(startDate.getDate() - days)

      // The revenue view combines completed cash booking values with successful
      // online payments and nonduplicated account-charge allocations. Actual
      // collection totals remain a separate metric.
      const [revenueResult, previousRevenueResult, collectionResult] = await Promise.all([
        supabase.from('financial_revenue')
          .select('id, payment_id, booking_type, booking_id, customer_id, amount, status, source, created_at')
          .in('status', ['recognized', 'succeeded'])
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())
          .order('created_at', { ascending: false }),
        supabase.from('financial_revenue')
          .select('amount, booking_type, booking_id, status')
          .in('status', ['recognized', 'succeeded'])
          .gte('created_at', previousStartDate.toISOString())
          .lt('created_at', startDate.toISOString()),
        supabase.from('financial_collections')
          .select('id, booking_type, booking_id, customer_id, amount, status, provider, created_at')
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())
          .order('created_at', { ascending: false }),
      ])

      if (revenueResult.error) throw revenueResult.error
      if (collectionResult.error) throw collectionResult.error
      if (previousRevenueResult.error) {
        console.warn('[useAdminRevenueData] previous revenue query failed (non-fatal)', previousRevenueResult.error)
      }

      const revenueRows = (revenueResult.data ?? []) as unknown as RecognitionRow[]
      const collectionRows = (collectionResult.data ?? []) as unknown as FinancialRow[]
      const previousRevenueRows = previousRevenueResult.error ? [] : (previousRevenueResult.data ?? []) as { amount: number | string; booking_type: string; booking_id: string; status: string }[]

      const customerIds = Array.from(new Set([
        ...revenueRows.map((row) => row.customer_id),
        ...collectionRows.map((row) => row.customer_id),
      ].filter(Boolean)))
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

      const vehicleBookingIds = Array.from(new Set([...revenueRows, ...collectionRows]
        .filter((row) => row.booking_type === 'vehicle')
        .map((row) => row.booking_id)))
      const vehicleNames = new Map<string, string>()

      if (vehicleBookingIds.length > 0) {
        const { data, error: vehicleError } = await supabase
          .from('vehicle_bookings')
          .select('id, vehicles(name)')
          .in('id', vehicleBookingIds)
        if (!vehicleError && data) {
          for (const row of data as unknown as BookingRow[]) {
            if (row.vehicles?.name) vehicleNames.set(row.id, row.vehicles.name)
          }
        }
      }

      const currentRevenue = revenueRows.reduce((sum, row) => sum + Number(row.amount), 0)
      const previousRevenue = previousRevenueRows.reduce((sum, row) => sum + Number(row.amount), 0)
      const bookingCount = new Set(revenueRows.map((row) => `${row.booking_type}:${row.booking_id}`)).size
      const previousBookingCount = new Set(previousRevenueRows.map((row) => `${row.booking_type}:${row.booking_id}`)).size
      const actualCollections = collectionRows.filter((row) => row.status === 'succeeded')
      const collectedAmount = actualCollections.reduce((sum, row) => sum + Number(row.amount), 0)
      const averageBookingValue = bookingCount > 0 ? currentRevenue / bookingCount : 0
      const previousAverage = previousBookingCount > 0 ? previousRevenue / previousBookingCount : 0
      const revenueTrend = computeTrend(currentRevenue, previousRevenue)
      const averageTrend = computeTrend(averageBookingValue, previousAverage)

      type BucketPoint = { label: string; dateStart: Date; dateEnd: Date; rentals: number; mechanics: number }
      const chartPoints: BucketPoint[] = []

      if (days <= 7) {
        for (let i = 6; i >= 0; i--) {
          const date = new Date()
          date.setDate(date.getDate() - i)
          date.setHours(0, 0, 0, 0)
          const dateEnd = new Date(date)
          dateEnd.setHours(23, 59, 59, 999)
          chartPoints.push({
            label: date.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }),
            dateStart: date,
            dateEnd,
            rentals: 0,
            mechanics: 0,
          })
        }
      } else if (days <= 30) {
        for (let i = days - 1; i >= 0; i--) {
          const date = new Date()
          date.setDate(date.getDate() - i)
          date.setHours(0, 0, 0, 0)
          const dateEnd = new Date(date)
          dateEnd.setHours(23, 59, 59, 999)
          chartPoints.push({
            label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            dateStart: date,
            dateEnd,
            rentals: 0,
            mechanics: 0,
          })
        }
      } else if (days <= 90) {
        for (let i = 11; i >= 0; i--) {
          const date = new Date()
          date.setDate(date.getDate() - (i * 7 + 6))
          date.setHours(0, 0, 0, 0)
          const dateEnd = new Date(date)
          dateEnd.setDate(date.getDate() + 7)
          chartPoints.push({
            label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            dateStart: date,
            dateEnd,
            rentals: 0,
            mechanics: 0,
          })
        }
      } else {
        for (let i = 11; i >= 0; i--) {
          const date = new Date()
          date.setMonth(date.getMonth() - i, 1)
          date.setHours(0, 0, 0, 0)
          const dateEnd = new Date(date)
          dateEnd.setMonth(date.getMonth() + 1, 0)
          dateEnd.setHours(23, 59, 59, 999)
          chartPoints.push({
            label: date.toLocaleDateString('en-US', { month: 'short' }),
            dateStart: date,
            dateEnd,
            rentals: 0,
            mechanics: 0,
          })
        }
      }

      for (const row of revenueRows) {
        const time = new Date(row.created_at).getTime()
        const bucket = chartPoints.find((point) => time >= point.dateStart.getTime() && time <= point.dateEnd.getTime())
        if (!bucket) continue
        if (row.booking_type === 'vehicle') bucket.rentals += Number(row.amount)
        else bucket.mechanics += Number(row.amount)
      }

      const formatAmount = (amount: number | string) => Number(amount).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      const dateLabel = (createdAt: string) => new Date(createdAt).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
      const transactionType = (bookingType: 'vehicle' | 'service', bookingId: string) => ({
        serviceType: bookingType === 'vehicle'
          ? `${vehicleNames.get(bookingId) ?? 'Vehicle'} Rental`
          : 'Mobile Mechanic Service',
        serviceIcon: bookingType === 'vehicle' ? 'vehicle' : 'service',
      })

      const revenueTransactions: RevenueTransaction[] = revenueRows
        .map((row) => ({
        recordId: row.id,
        recordKind: row.source === 'cash_completion' ? 'recognition' : 'collection',
        date: dateLabel(row.created_at),
        createdAt: row.created_at,
        customer: customersById.get(row.customer_id) ?? 'Customer',
        bookingId: row.booking_id,
        ...transactionType(row.booking_type, row.booking_id),
        amount: formatAmount(row.amount),
        status: row.source === 'cash_completion' ? 'recognized' : 'completed',
        provider: row.source === 'online_payment'
          ? 'online payment'
          : row.source === 'account_charge_online'
            ? 'online account balance'
            : row.source === 'account_charge_cash'
              ? 'cash account balance'
              : null,
        recordSource: row.source as RevenueTransaction['recordSource'],
      }))
      const txList = revenueTransactions
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

      if (generation !== fetchGeneration.current) return

      setStats([
        {
          label: 'Total Revenue',
          value: `₱${currentRevenue.toLocaleString()}`,
          trend: revenueTrend.percentage !== 0 && previousRevenue > 0
            ? `${revenueTrend.percentage >= 0 ? '+' : ''}${revenueTrend.percentage.toFixed(1)}% period over period`
            : undefined,
          trendUp: revenueTrend.trendUp,
          icon: 'revenue',
        },
        {
          label: 'Average Revenue per Booking',
          value: `₱${averageBookingValue.toFixed(2)}`,
          trend: averageTrend.percentage !== 0 && previousAverage > 0
            ? `${averageTrend.percentage >= 0 ? '+' : ''}${averageTrend.percentage.toFixed(1)}% vs last period`
            : undefined,
          trendUp: averageTrend.trendUp,
          icon: 'avg',
        },
        {
          label: 'Payments Collected',
          value: `₱${collectedAmount.toLocaleString()}`,
          sub: `${actualCollections.length} successful collections`,
          icon: 'subs',
        },
      ])
      setChartData({
        labels: chartPoints.map((point) => point.label),
        rentals: chartPoints.map((point) => point.rentals),
        mechanics: chartPoints.map((point) => point.mechanics),
      })
      setTransactions(txList)
      setTotalTransactions(txList.length)
    } catch (err) {
      if (generation === fetchGeneration.current) {
        setError(err instanceof Error ? err.message : 'Failed to load revenue data')
        setStats([])
        setChartData({ labels: [], rentals: [], mechanics: [] })
        setTransactions([])
        setTotalTransactions(0)
      }
    } finally {
      if (generation === fetchGeneration.current) setLoading(false)
    }
  }, [days])

  useEffect(() => { void fetchRevenue() }, [fetchRevenue])

  useEffect(() => {
    const channel = supabase
      .channel(`admin-revenue-changes:${++realtimeInstance}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => { void fetchRevenue() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'account_events' }, () => { void fetchRevenue() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_revenue_recognitions' }, () => { void fetchRevenue() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_bookings' }, () => { void fetchRevenue() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_bookings' }, () => { void fetchRevenue() })
      .subscribe()

    const refreshOnFinancialChange = () => { void fetchRevenue() }
    const refreshOnFocus = () => {
      if (document.visibilityState === 'visible') void fetchRevenue()
    }
    window.addEventListener('admin-financial-data-changed', refreshOnFinancialChange)
    document.addEventListener('visibilitychange', refreshOnFocus)

    return () => {
      window.removeEventListener('admin-financial-data-changed', refreshOnFinancialChange)
      document.removeEventListener('visibilitychange', refreshOnFocus)
      void supabase.removeChannel(channel)
    }
  }, [fetchRevenue])

  return { stats, chartData, transactions, totalTransactions, loading, error, refetch: fetchRevenue }
}

function computeTrend(current: number, previous: number): { percentage: number; trendUp: boolean } {
  if (previous === 0) return { percentage: current > 0 ? 100 : 0, trendUp: current > 0 }
  const percentage = ((current - previous) / previous) * 100
  return { percentage, trendUp: percentage >= 0 }
}
