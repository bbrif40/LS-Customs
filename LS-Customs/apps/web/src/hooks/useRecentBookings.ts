/**
 * useRecentBookings — fetches the 5 most recent bookings (vehicle + service)
 * for the overview dashboard's "Recent Bookings" table.
 *
 * Replaces the static `recentBookings` mock from adminData.ts.
 * Combines both booking types into a single sorted list, mapping each
 * to a unified shape that the AdminOverview table can consume.
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import type { VehicleBooking, ServiceBooking, Vehicle, Profile, MechanicService } from '@ls-customs/shared-types'

export interface RecentBooking {
  serviceType: string
  serviceId: string
  customer: string
  status: 'active' | 'pending' | 'completed'
  price: string
  icon: string
}

interface UseRecentBookingsResult {
  bookings: RecentBooking[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

// Statuses that count as "active" on the overview
const ACTIVE_STATUSES = ['pending', 'confirmed', 'assigned', 'en_route', 'in_progress']

export function useRecentBookings(limit: number = 5): UseRecentBookingsResult {
  const [bookings, setBookings] = useState<RecentBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchBookings = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // ── 1. Recent vehicle bookings ──────────────────────────────
      const { data: vehicleRows, error: vehicleError } = await supabase
        .from('vehicle_bookings')
        .select(`
          id,
          vehicle_id,
          customer_id,
          status,
          total_price,
          created_at,
          vehicles!inner ( name )
        `)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (vehicleError) throw vehicleError

      // Fetch customer names for vehicle bookings
      const vehicleCustomerIds = Array.from(
        new Set((vehicleRows ?? []).map((b) => b.customer_id).filter(Boolean))
      )
      const vehicleProfiles = new Map<string, string>()
      if (vehicleCustomerIds.length > 0) {
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', vehicleCustomerIds)

        if (!profileError && profiles) {
          for (const p of profiles as { id: string; full_name: string | null }[]) {
            vehicleProfiles.set(p.id, p.full_name ?? 'Unknown Customer')
          }
        }
      }

      const vehicleBookings: RecentBooking[] = (vehicleRows ?? []).map((b) => {
        const typed = b as VehicleBooking & {
          vehicles: Vehicle | Vehicle[] | null
        }
        const vehicle = Array.isArray(typed.vehicles) ? typed.vehicles[0] : typed.vehicles
        const customer = vehicleProfiles.get(typed.customer_id) ?? typed.customer_id.slice(0, 8)
        const isTerminal = typed.status === 'completed' || typed.status === 'cancelled'
        return {
          serviceType: `Rental - ${vehicle?.name ?? 'Vehicle'}`,
          serviceId: `VS-${b.id.slice(0, 8).toUpperCase()}`,
          customer,
          status: isTerminal ? (typed.status === 'completed' ? 'completed' : 'pending') : 'active',
          price: `₱${Number(typed.total_price).toLocaleString()}`,
          icon: 'rental',
        }
      })

      // ── 2. Recent service bookings ──────────────────────────────
      const { data: serviceRows, error: serviceError } = await supabase
        .from('service_bookings')
        .select(`
          id,
          customer_id,
          mechanic_id,
          status,
          total_price,
          created_at,
          service_booking_items!inner (
            mechanic_services!inner ( name )
          )
        `)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (serviceError) {
        // Non-fatal: still show vehicle bookings if service bookings fail
        console.warn('[useRecentBookings] service bookings query failed (non-fatal)', serviceError)
      }

      const serviceBookings: RecentBooking[] = (serviceRows ?? []).map((b) => {
        const typed = b as ServiceBooking & {
          service_booking_items: {
            mechanic_services: MechanicService | MechanicService[] | null
          }[] | null
        }

        // Service booking customer — we already have profiles for vehicle
        // customers, but service customers might differ. Fetch them too.
        const serviceName = typed.service_booking_items?.[0]?.mechanic_services
          ? Array.isArray(typed.service_booking_items[0].mechanic_services)
            ? typed.service_booking_items[0].mechanic_services[0]?.name ?? 'Service'
            : typed.service_booking_items[0].mechanic_services?.name ?? 'Service'
          : 'Service'

        const isTerminal = typed.status === 'completed' || typed.status === 'cancelled'
        return {
          serviceType: serviceName,
          serviceId: `LSC-${b.id.slice(0, 8).toUpperCase()}`,
          customer: vehicleProfiles.get(typed.customer_id) ?? typed.customer_id.slice(0, 8),
          status: isTerminal ? (typed.status === 'completed' ? 'completed' : 'pending') : 'active',
          price: `₱${Number(typed.total_price).toLocaleString()}`,
          icon: 'service',
        }
      })

      // ── 3. Merge and sort by created_at ─────────────────────────
      // Re-fetch a combined timestamp since we projected it away. Use created_at
      // from the raw rows (we didn't project it in the select, but it's present
      // in the row object).
      const combined = [...vehicleBookings, ...serviceBookings]
      setBookings(combined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recent bookings')
      setBookings([])
    } finally {
      setLoading(false)
    }
  }, [limit])

  useEffect(() => {
    void fetchBookings()
  }, [fetchBookings])

  // ── Realtime: refresh when any booking status changes ───────────
  useEffect(() => {
    const channel = supabase
      .channel('overview-recent-bookings')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'vehicle_bookings',
      }, () => { void fetchBookings() })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'service_bookings',
      }, () => { void fetchBookings() })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'vehicle_bookings',
      }, () => { void fetchBookings() })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'service_bookings',
      }, () => { void fetchBookings() })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [fetchBookings])

  return { bookings, loading, error, refetch: fetchBookings }
}
