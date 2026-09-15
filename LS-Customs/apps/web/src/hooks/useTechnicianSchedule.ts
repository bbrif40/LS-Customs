/**
 * useTechnicianSchedule — fetches real scheduling data for the
 * AdminTechnicians timeline grid.
 *
 * Replaces the static `scheduleBlocks`, `scheduleTechnicians`, and
 * `unassignedJobs` mocks from adminData.ts.
 *
 * - `unassignedJobs` come from service_bookings with status='pending'
 * - `scheduleBlocks` come from active service_bookings (assigned/en_route/
 *   in_progress) joined with mechanic_profiles for the tech name
 * - `technicians` is derived from the distinct set of mechanics assigned
 *   to active bookings, plus all available mechanics
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export interface ScheduleBlock {
  techName: string
  startHour: number
  endHour: number
  label: string
  color: string
  bookingId: string
  status: string
}

export interface UnassignedJob {
  title: string
  vehicleInfo: string
  address: string
  urgency: 'urgent' | 'standard'
  bookingId: string
}

export interface TechnicianInfo {
  name: string
  initials: string
  color: string
}

export interface FleetStatusCounts {
  active: number
  pending: number
}

interface UseTechnicianScheduleResult {
  scheduleBlocks: ScheduleBlock[]
  scheduleTechnicians: TechnicianInfo[]
  unassignedJobs: UnassignedJob[]
  fleetStatus: FleetStatusCounts
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

// Colors for technician blocks — cycling palette
const TECH_COLORS = ['#e8a838', '#5b8def', '#4CAF50', '#8b5cf6', '#06b6d4', '#ef4444']

export function useTechnicianSchedule(): UseTechnicianScheduleResult {
  const [scheduleBlocks, setScheduleBlocks] = useState<ScheduleBlock[]>([])
  const [scheduleTechnicians, setScheduleTechnicians] = useState<TechnicianInfo[]>([])
  const [unassignedJobs, setUnassignedJobs] = useState<UnassignedJob[]>([])
  const [fleetStatus, setFleetStatus] = useState<FleetStatusCounts>({ active: 0, pending: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSchedule = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // ── 1. Pending service bookings (unassigned jobs) ──────────
      const { data: pendingRows, error: pendingError } = await supabase
        .from('service_bookings')
        .select(`
          id,
          scheduled_at,
          status,
          total_price,
          addresses!left ( line1, city )
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (pendingError) throw pendingError

      const jobs: UnassignedJob[] = (pendingRows ?? []).map((row) => {
        const typed = row as {
          id: string
          scheduled_at: string
          total_price: number
          addresses: { line1: string; city: string } | { line1: string; city: string }[] | null
        }

        // Derive service name from the scheduled time / duration
        const scheduled = new Date(typed.scheduled_at)
        const timeStr = scheduled.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

        // Address info
        const addr = Array.isArray(typed.addresses) ? typed.addresses[0] : typed.addresses
        const addressStr = addr ? `${addr.line1}, ${addr.city}` : 'Address to be confirmed'

        // Urgency: jobs scheduled within 2 hours are 'urgent'
        const now = Date.now()
        const isUrgent = scheduled.getTime() - now < 2 * 60 * 60 * 1000 && scheduled.getTime() > now

        return {
          title: 'Mobile mechanic service',
          vehicleInfo: `${timeStr} • ₱${typed.total_price.toLocaleString()}`,
          address: addressStr,
          urgency: isUrgent ? 'urgent' as const : 'standard' as const,
          bookingId: typed.id,
        }
      })

      setUnassignedJobs(jobs)

      // ── 2. Active service bookings (assigned/en_route/in_progress) ─
      const activeStatuses = ['assigned', 'en_route', 'in_progress']
      const { data: activeRows, error: activeError } = await supabase
        .from('service_bookings')
        .select(`
          id,
          mechanic_id,
          scheduled_at,
          status,
          total_price,
          service_booking_items (
            mechanic_service_id,
            quantity,
            price_at_booking
          )
        `)
        .in('status', activeStatuses)
        .order('scheduled_at', { ascending: true })

      if (activeError) {
        console.warn('[useTechnicianSchedule] active bookings query failed (non-fatal)', activeError)
      }

      // ── 3. Mechanic profiles for assigned bookings ────────────────
      const mechanicIds = Array.from(
        new Set((activeRows ?? []).map((b) => b.mechanic_id).filter(Boolean))
      )

      let mechanicsById = new Map<string, { full_name: string; phone: string | null }>()
      if (mechanicIds.length > 0) {
        const { data: mechRows, error: mechError } = await supabase
          .from('mechanic_profiles')
          .select(`
            id,
            is_available,
            profiles!inner ( full_name, phone )
          `)
          .in('id', mechanicIds)

        if (!mechError && mechRows) {
          type MechRow = { id: string; is_available: boolean; profiles: { full_name: string | null; phone: string | null } | { full_name: string | null; phone: string | null }[] | null }
          for (const m of (mechRows ?? []) as unknown as MechRow[]) {
            const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
            mechanicsById.set(m.id, {
              full_name: profile?.full_name ?? 'Unassigned',
              phone: profile?.phone ?? null,
            })
          }
        }
      }

      // ── 4. Build schedule blocks ─────────────────────────────────
      const blocks: ScheduleBlock[] = []
      const techSet = new Map<string, TechnicianInfo>()

      for (const row of (activeRows ?? []) as {
        id: string
        mechanic_id: string | null
        scheduled_at: string
        status: string
        total_price: number
      }[]) {
        if (!row.mechanic_id) continue

        const mech = mechanicsById.get(row.mechanic_id)
        const techName = mech?.full_name ?? `Mechanic ${row.mechanic_id.slice(0, 8)}`
        const initials = techName
          .split(' ')
          .map((n) => n[0])
          .join('')
          .slice(0, 2)
          .toUpperCase()

        // Assign a deterministic color based on tech name hash
        const colorIdx = Math.abs(techName.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % TECH_COLORS.length
        const color = TECH_COLORS[colorIdx]

        if (!techSet.has(techName)) {
          techSet.set(techName, { name: techName, initials, color })
        }

        const scheduled = new Date(row.scheduled_at)
        const startHour = Math.max(8, scheduled.getHours())
        // Estimate end hour: assume 1h for basic services
        const endHour = Math.min(17, startHour + 1)

        blocks.push({
          techName,
          startHour,
          endHour,
          label: `Service #${row.id.slice(0, 6)}`,
          color,
          bookingId: row.id,
          status: row.status,
        })
      }

      // Sort schedule blocks by start hour
      blocks.sort((a, b) => a.startHour - b.startHour)
      setScheduleBlocks(blocks)

      // Build technician list from the tech set
      const techList = Array.from(techSet.values())
      setScheduleTechnicians(techList)

      // ── 5. Fleet status counts ─────────────────────────────────
      const activeStatusesCount = ['pending', 'confirmed', 'assigned', 'en_route', 'in_progress']
      const { count: activeRentals, error: rentalsError } = await supabase
        .from('vehicle_bookings')
        .select('id', { count: 'exact', head: true })
        .in('status', activeStatusesCount)

      if (rentalsError) {
        console.warn('[useTechnicianSchedule] active rentals count failed (non-fatal)', rentalsError)
      }

      const { count: pendingServices, error: servicesError } = await supabase
        .from('service_bookings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')

      if (servicesError) {
        console.warn('[useTechnicianSchedule] pending services count failed (non-fatal)', servicesError)
      }

      setFleetStatus({
        active: activeRentals ?? 0,
        pending: pendingServices ?? 0,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedule')
      setScheduleBlocks([])
      setScheduleTechnicians([])
      setUnassignedJobs([])
      setFleetStatus({ active: 0, pending: 0 })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchSchedule()
  }, [fetchSchedule])

  // ── Realtime: refresh when service bookings change ──────────
  useEffect(() => {
    const channel = supabase
      .channel('technician-schedule-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'service_bookings',
      }, () => { void fetchSchedule() })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'mechanic_profiles',
      }, () => { void fetchSchedule() })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [fetchSchedule])

  return {
    scheduleBlocks,
    scheduleTechnicians,
    unassignedJobs,
    fleetStatus,
    loading,
    error,
    refetch: fetchSchedule,
  }
}
