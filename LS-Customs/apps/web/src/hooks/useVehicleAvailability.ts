/**
 * useVehicleAvailability — for a [start, end] window, return the set
 * of vehicle_ids that already have an active (pending/confirmed/
 * in_progress) booking overlapping the window. Rentals uses this to
 * mark cards "unavailable for these dates" before the user clicks
 * Book, so they don't hit the `no_overlapping_bookings` exclusion
 * constraint at INSERT time.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export function useVehicleAvailability(startDate: string, endDate: string) {
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Need both dates and a valid range before asking the DB.
    if (!startDate || !endDate || endDate <= startDate) {
      setUnavailableIds(new Set())
      return
    }
    let cancelled = false
    setLoading(true)
    void (async () => {
      const { data, error } = await supabase.rpc('unavailable_vehicles', {
        p_start: startDate,
        p_end: endDate,
      })
      if (cancelled) return
      if (error) {
        // Don't block the page on a transient RPC error — show every
        // vehicle as available; the exclusion constraint at INSERT
        // will still catch the rare race.
        setUnavailableIds(new Set())
      } else {
        setUnavailableIds(new Set((data ?? []).map((row: { vehicle_id: string }) => row.vehicle_id)))
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [startDate, endDate])

  return { unavailableIds, loading }
}
