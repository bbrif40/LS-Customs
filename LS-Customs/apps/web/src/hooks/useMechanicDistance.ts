import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export interface DispatchMechanic {
  id: string; full_name: string; phone?: string | null; rating_avg: number
  current_lat: number; current_lng: number
}
export const RATE_PER_5KM_PESOS = 85
export function useMechanicDistance(customerLat?: number | null, customerLng?: number | null) {
  const [quote, setQuote] = useState<{ distance_km: number; travel_fee: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    setQuote(null)
    setError(null)
    if (customerLat == null || customerLng == null) { setLoading(false); return }
    setLoading(true)
    void supabase.rpc('get_dispatch_quote', { p_lat: customerLat, p_lng: customerLng }).then(({ data, error: queryError }) => {
      if (!active) return
      const row = Array.isArray(data) ? data[0] : data
      if (queryError || !row) setError('Travel pricing is unavailable. Please try again or contact support.')
      else setQuote({ distance_km: Number(row.distance_km), travel_fee: Number(row.travel_fee) })
      setLoading(false)
    })
    return () => { active = false }
  }, [customerLat, customerLng])
  return {
    mechanics: [] as DispatchMechanic[], assignedMechanic: null as DispatchMechanic | null,
    distanceKm: quote?.distance_km ?? 0, distanceFeePesos: quote?.travel_fee ?? 0,
    distanceFeeCents: (quote?.travel_fee ?? 0) * 100,
    tiers: quote ? quote.travel_fee / RATE_PER_5KM_PESOS : 0,
    formattedDistance: quote ? `${quote.distance_km.toFixed(1)} km` : 'Unavailable',
    formattedDistanceFee: quote ? `₱${quote.travel_fee.toFixed(2)}` : 'Quote required',
    loading, error,
  }
}
