/**
 * useLiveTechnicians — fetches available mechanics for the overview map
 * and technician status list. Subscribes to realtime updates so the map
 * and status list stay current as mechanics toggle availability or update
 * their live GPS coordinates.
 *
 * Returns two shapes:
 *   - `technicians` — for the status list (name, role, status, rating, distance)
 *   - `mechanicPins` — for the <MapView> component (lat/lng + title)
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export interface TechnicianData {
  name: string
  role: string
  status: 'on-job' | 'available' | 'en-route'
  rating: number
  distance?: string
  avatar: string
}

export interface MechanicPin {
  id: string
  lat: number
  lng: number
  title: string
  status: 'available' | 'en-route' | 'on-job'
}

interface UseLiveTechniciansResult {
  technicians: TechnicianData[]
  mechanicPins: MechanicPin[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

// Map mechanic_profiles.is_available + service_bookings status to the
// three-state technician status used by the UI.
function deriveTechnicianStatus(
  isAvailable: boolean | null,
  bookingStatus: string | null,
): 'on-job' | 'available' | 'en-route' {
  if (bookingStatus === 'en_route') return 'en-route'
  if (bookingStatus === 'in_progress' || bookingStatus === 'assigned') return 'on-job'
  if (isAvailable) return 'available'
  return 'available'
}

export function useLiveTechnicians(): UseLiveTechniciansResult {
  const [technicians, setTechnicians] = useState<TechnicianData[]>([])
  const [mechanicPins, setMechanicPins] = useState<MechanicPin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTechnicians = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // Fetch all mechanics with their profiles and current service bookings.
      // Join mechanic_profiles → profiles for name/avatar, and service_bookings
      // for current assignment status.
      const { data: rows, error: queryError } = await supabase
        .from('mechanic_profiles')
        .select(`
          id,
          is_available,
          current_lat,
          current_lng,
          rating_avg,
          rating_count,
          specialties,
          profiles!inner (
            full_name,
            phone
          )
        `)

      if (queryError) throw queryError

      // Get active bookings to determine which mechanics are on-job
      const activeStatuses = ['assigned', 'en_route', 'in_progress']
      const { data: activeBookings, error: bookingError } = await supabase
        .from('service_bookings')
        .select('mechanic_id, status')
        .in('status', activeStatuses)

      if (bookingError) throw bookingError

      // Map mechanic_id → latest active booking status
      const mechanicBookingStatus = new Map<string, string>()
      for (const booking of (activeBookings ?? []) as { mechanic_id: string; status: string }[]) {
        // Keep the first (most recent) — bookings are ordered by created_at desc
        if (!mechanicBookingStatus.has(booking.mechanic_id)) {
          mechanicBookingStatus.set(booking.mechanic_id, booking.status)
        }
      }

      const techList: TechnicianData[] = []
      const pins: MechanicPin[] = []

      for (const row of rows ?? []) {
        type MechanicRow = {
          id: string
          is_available: boolean
          current_lat: number | null
          current_lng: number | null
          rating_avg: number
          rating_count: number
          specialties: string[] | null
          profiles: { full_name: string | null; phone: string | null } | { full_name: string | null; phone: string | null }[] | null
        }

        const typed = row as MechanicRow
        const profile = Array.isArray(typed.profiles) ? typed.profiles[0] : typed.profiles
        const fullName = profile?.full_name ?? 'Unassigned'
        const initials = fullName
          .split(' ')
          .map((n) => n[0])
          .join('')
          .slice(0, 2)
          .toUpperCase()

        const bookingStatus = typed.id ? mechanicBookingStatus.get(typed.id) ?? null : null
        const techStatus = deriveTechnicianStatus(typed.is_available, bookingStatus)

        // Human-readable distance/role based on status
        let distance = ''
        let role = 'Field Technician'
        if (techStatus === 'on-job') {
          distance = 'On job site'
        } else if (techStatus === 'en-route') {
          distance = 'En route'
        } else {
          distance = 'HQ Expert'
        }

        if (typed.specialties && typed.specialties.length > 0) {
          role = `${typed.specialties[0]} Specialist`
        }

        techList.push({
          name: fullName,
          role,
          status: techStatus,
          rating: typed.rating_avg ?? 0,
          distance,
          avatar: initials,
        })

        // Only create a map pin if we have coordinates
        if (typed.current_lat != null && typed.current_lng != null) {
          pins.push({
            id: typed.id,
            lat: typed.current_lat,
            lng: typed.current_lng,
            title: fullName,
            status: techStatus === 'on-job' ? 'on-job' : techStatus === 'en-route' ? 'en-route' : 'available',
          })
        }
      }

      // Limit to first 15 technicians for the status list (matches Figma design)
      setTechnicians(techList.slice(0, 15))
      setMechanicPins(pins)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load technicians')
      setTechnicians([])
      setMechanicPins([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchTechnicians()
  }, [fetchTechnicians])

  // ── Realtime: refresh on mechanic profile or booking status changes ──
  useEffect(() => {
    const mechanicsChannel = supabase
      .channel('overview-mechanics-changes')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'mechanic_profiles',
      }, () => {
        void fetchTechnicians()
      })
      .subscribe()

    const bookingsChannel = supabase
      .channel('overview-bookings-status-changes')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'service_bookings',
      }, () => {
        void fetchTechnicians()
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(mechanicsChannel)
      void supabase.removeChannel(bookingsChannel)
    }
  }, [fetchTechnicians])

  return { technicians, mechanicPins, loading, error, refetch: fetchTechnicians }
}
