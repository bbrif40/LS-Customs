/**
 * useAdminOverviewStats — live operational metrics for the admin command center.
 *
 * Replaces the static `overviewStats` mock from adminData.ts.
 * Queries four independent aggregates and subscribes to realtime updates
 * so the stat cards stay current as bookings, payments, and vehicles change.
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export interface OverviewStat {
  label: string
  value: string
  sub?: string
  trend?: string
  trendUp?: boolean
  icon: string
}

export interface RevenueTrend {
  current: number
  previous: number
  percentage: number
  trendUp: boolean
}

interface UseAdminOverviewStatsResult {
  stats: OverviewStat[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

const ACTIVE_STATUSES = ['pending', 'confirmed', 'assigned', 'en_route', 'in_progress'] as const

export function useAdminOverviewStats(): UseAdminOverviewStatsResult {
  const [stats, setStats] = useState<OverviewStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // ── 1. Total Revenue (last 7 days) ──────────────────────────
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      const sevenDaysAgoIso = sevenDaysAgo.toISOString()

      const fourteenDaysAgo = new Date()
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
      const fourteenDaysAgoIso = fourteenDaysAgo.toISOString()

      const [
        currentRevenueRes,
        previousRevenueRes,
        currentCompletedVb,
        previousCompletedVb,
        currentCompletedSb,
        previousCompletedSb,
      ] = await Promise.all([
        supabase
          .from('payments')
          .select('booking_id, amount')
          .eq('status', 'succeeded')
          .gte('created_at', sevenDaysAgoIso),
        supabase
          .from('payments')
          .select('booking_id, amount')
          .eq('status', 'succeeded')
          .gte('created_at', fourteenDaysAgoIso)
          .lt('created_at', sevenDaysAgoIso),
        supabase
          .from('vehicle_bookings')
          .select('id, total_price')
          .eq('status', 'completed')
          .gte('created_at', sevenDaysAgoIso),
        supabase
          .from('vehicle_bookings')
          .select('id, total_price')
          .eq('status', 'completed')
          .gte('created_at', fourteenDaysAgoIso)
          .lt('created_at', sevenDaysAgoIso),
        supabase
          .from('service_bookings')
          .select('id, total_price')
          .eq('status', 'completed')
          .gte('created_at', sevenDaysAgoIso),
        supabase
          .from('service_bookings')
          .select('id, total_price')
          .eq('status', 'completed')
          .gte('created_at', fourteenDaysAgoIso)
          .lt('created_at', sevenDaysAgoIso),
      ])

      const currentPaidBookingIds = new Set(currentRevenueRes.data?.map((p) => p.booking_id).filter(Boolean))
      let currentRevenue = currentRevenueRes.data?.reduce((sum, p) => sum + Number(p.amount), 0) ?? 0
      for (const vb of (currentCompletedVb.data ?? [])) {
        if (!currentPaidBookingIds.has(vb.id)) {
          currentRevenue += Number(vb.total_price)
          currentPaidBookingIds.add(vb.id)
        }
      }
      for (const sb of (currentCompletedSb.data ?? [])) {
        if (!currentPaidBookingIds.has(sb.id)) {
          currentRevenue += Number(sb.total_price)
          currentPaidBookingIds.add(sb.id)
        }
      }

      const prevPaidBookingIds = new Set(previousRevenueRes.data?.map((p) => p.booking_id).filter(Boolean))
      let previousRevenue = previousRevenueRes.data?.reduce((sum, p) => sum + Number(p.amount), 0) ?? 0
      for (const vb of (previousCompletedVb.data ?? [])) {
        if (!prevPaidBookingIds.has(vb.id)) {
          previousRevenue += Number(vb.total_price)
          prevPaidBookingIds.add(vb.id)
        }
      }
      for (const sb of (previousCompletedSb.data ?? [])) {
        if (!prevPaidBookingIds.has(sb.id)) {
          previousRevenue += Number(sb.total_price)
          prevPaidBookingIds.add(sb.id)
        }
      }
      const revenueTrend = computeTrend(currentRevenue, previousRevenue)

      // ── 2. Active Rentals ───────────────────────────────────────
      const { count: activeRentals, error: rentalsError } = await supabase
        .from('vehicle_bookings')
        .select('id', { count: 'exact', head: true })
        .in('status', [...ACTIVE_STATUSES])

      if (rentalsError) throw rentalsError

      // Total fleet size
      const { count: totalFleet, error: fleetError } = await supabase
        .from('vehicles')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)

      if (fleetError) throw fleetError

      // ── 3. Pending Service Bookings ─────────────────────────────
      const { count: pendingServices, error: servicesError } = await supabase
        .from('service_bookings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')

      if (servicesError) throw servicesError

      // High-priority: pending services with no assigned mechanic (older than 2h)
      const twoHoursAgo = new Date()
      twoHoursAgo.setHours(twoHoursAgo.getHours() - 2)
      const { count: highPriority, error: highPriorityError } = await supabase
        .from('service_bookings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .is('mechanic_id', null)
        .lt('created_at', twoHoursAgo.toISOString())

      if (highPriorityError) throw highPriorityError

      // ── 4. Fleet Utilization ────────────────────────────────────
      const { count: rentedNow, error: rentedError } = await supabase
        .from('vehicle_bookings')
        .select('id', { count: 'exact', head: true })
        .in('status', [...ACTIVE_STATUSES])

      if (rentedError) throw rentedError

      const fleetUtilization = totalFleet && totalFleet > 0 ? Math.round(((rentedNow ?? 0) / totalFleet) * 100) : 0

      const computedStats: OverviewStat[] = [
        {
          label: 'Total Revenue (7d)',
          value: `₱${currentRevenue.toLocaleString()}`,
          trend: revenueTrend.percentage !== 0 ? `${revenueTrend.trendUp ? '+' : ''}${revenueTrend.percentage.toFixed(1)}% vs last week` : undefined,
          trendUp: revenueTrend.trendUp,
          icon: 'revenue',
        },
        {
          label: 'Active Rentals',
          value: String(activeRentals ?? 0),
          sub: `${totalFleet ?? 0} fleet vehicles`,
          icon: 'rentals',
        },
        {
          label: 'Pending Mechanics',
          value: String(pendingServices ?? 0),
          sub: `${highPriority ?? 0} high priority`,
          trendUp: false,
          icon: 'mechanics',
        },
        {
          label: 'Fleet Utilization',
          value: `${fleetUtilization}%`,
          sub: `${rentedNow ?? 0} of ${totalFleet ?? 0} active`,
          icon: 'fleet',
        },
      ]

      setStats(computedStats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load overview stats')
      setStats([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchStats()
  }, [fetchStats])

  // ── Realtime: recompute stats when payments / bookings change ──
  useEffect(() => {
    const paymentsChannel = supabase
      .channel('overview-payments-changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'payments',
        filter: "status=eq.succeeded",
      }, () => {
        void fetchStats()
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'payments',
      }, (payload) => {
        // Only recompute if status moved to/from succeeded
        const oldStatus = (payload.old as { status?: string })?.status
        const newStatus = (payload.new as { status?: string })?.status
        if (oldStatus === 'succeeded' || newStatus === 'succeeded') {
          void fetchStats()
        }
      })
      .subscribe()

    const bookingsChannel = supabase
      .channel('overview-bookings-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'vehicle_bookings',
      }, () => {
        void fetchStats()
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'service_bookings',
      }, () => {
        void fetchStats()
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(paymentsChannel)
      void supabase.removeChannel(bookingsChannel)
    }
  }, [fetchStats])

  return { stats, loading, error, refetch: fetchStats }
}

function computeTrend(current: number, previous: number): RevenueTrend {
  if (previous === 0) {
    return { current, previous, percentage: current > 0 ? 100 : 0, trendUp: current > 0 }
  }
  const percentage = ((current - previous) / previous) * 100
  return {
    current,
    previous,
    percentage,
    trendUp: percentage >= 0,
  }
}
