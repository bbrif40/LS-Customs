/**
 * useMechanicDistance — calculates the estimated distance between the customer's
 * service location and the closest available mobile mechanic / driver, and computes
 * the distance travel fee (every 5km is 85 pesos).
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../supabaseClient'

export interface DispatchMechanic {
  id: string
  full_name: string
  phone?: string | null
  rating_avg: number
  rating_count?: number
  specialties?: string[] | null
  years_experience?: number
  current_lat: number
  current_lng: number
}

export const RATE_PER_5KM_PESOS = 85

export const DEFAULT_DISPATCH_MECHANICS: DispatchMechanic[] = [
  {
    id: 'b1111111-0000-0000-0000-000000000001',
    full_name: 'Rico Hernandez',
    phone: '+63 917 555 0192',
    rating_avg: 4.9,
    rating_count: 38,
    specialties: ['routine_fluid_service', 'diagnostic_repair', 'tire_wheel_care'],
    years_experience: 8,
    current_lat: 14.5995,
    current_lng: 120.9842,
  },
  {
    id: 'b1111111-0000-0000-0000-000000000002',
    full_name: 'Marco dela Cruz',
    phone: '+63 918 555 0184',
    rating_avg: 4.85,
    rating_count: 24,
    specialties: ['electrical_battery_care', 'lighting_visibility', 'quick_fixes'],
    years_experience: 5,
    current_lat: 14.676,
    current_lng: 121.0437,
  },
  {
    id: 'b1111111-0000-0000-0000-000000000003',
    full_name: 'Andre Villanueva',
    phone: '+63 920 555 0177',
    rating_avg: 4.95,
    rating_count: 52,
    specialties: ['routine_fluid_service', 'tire_wheel_care'],
    years_experience: 12,
    current_lat: 14.5547,
    current_lng: 121.0244,
  },
]

/**
 * Haversine distance in kilometers between two lat/lng coordinates.
 */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371 // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Calculates distance travel fee:
 * Rate: Every 5km is 85 pesos (e.g. 0-5km = ₱85, 5.1-10km = ₱170, 10.1-15km = ₱255).
 */
export function calculateDistanceFee(distanceKm: number): {
  feePesos: number
  tiers: number
  distanceKm: number
  formattedFee: string
} {
  const dist = Math.max(0.1, Number(distanceKm.toFixed(1)))
  const tiers = Math.max(1, Math.ceil(dist / 5))
  const feePesos = tiers * RATE_PER_5KM_PESOS
  return {
    feePesos,
    tiers,
    distanceKm: dist,
    formattedFee: `₱${feePesos.toFixed(2)}`,
  }
}

interface UseMechanicDistanceResult {
  mechanics: DispatchMechanic[]
  assignedMechanic: DispatchMechanic | null
  distanceKm: number
  distanceFeePesos: number
  distanceFeeCents: number
  tiers: number
  formattedDistance: string
  formattedDistanceFee: string
  loading: boolean
}

export function useMechanicDistance(
  customerLat?: number | null,
  customerLng?: number | null,
): UseMechanicDistanceResult {
  const [mechanics, setMechanics] = useState<DispatchMechanic[]>(DEFAULT_DISPATCH_MECHANICS)
  const [loading, setLoading] = useState(false)

  const fetchMechanics = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_dispatch_mechanics')
      if (!error && Array.isArray(data) && data.length > 0) {
        setMechanics(data as DispatchMechanic[])
      }
    } catch {
      // Gracefully retain DEFAULT_DISPATCH_MECHANICS
    }
  }, [])

  useEffect(() => {
    void fetchMechanics()
  }, [fetchMechanics])

  // Determine effective customer coordinates (defaulting to Manila center if unset)
  const hasCoords =
    customerLat != null &&
    customerLng != null &&
    customerLat !== 0 &&
    customerLng !== 0

  const effectiveLat = hasCoords ? (customerLat as number) : 14.5995
  const effectiveLng = hasCoords ? (customerLng as number) : 120.9842

  // Find nearest available mechanic
  const { nearest, minDistance } = useMemo(() => {
    if (!mechanics || mechanics.length === 0) {
      return { nearest: DEFAULT_DISPATCH_MECHANICS[0], minDistance: 3.5 }
    }

    let nearestMech = mechanics[0]
    let lowestDist = Infinity

    for (const mech of mechanics) {
      const dist = haversineDistanceKm(
        effectiveLat,
        effectiveLng,
        mech.current_lat,
        mech.current_lng,
      )
      if (dist < lowestDist) {
        lowestDist = dist
        nearestMech = mech
      }
    }

    // If distance is nearly 0 (e.g. at the depot), give a realistic baseline ~2.5 km
    const effectiveDist = lowestDist < 0.2 ? 2.5 : lowestDist

    return { nearest: nearestMech, minDistance: effectiveDist }
  }, [mechanics, effectiveLat, effectiveLng])

  const { feePesos, tiers, distanceKm, formattedFee } = useMemo(
    () => calculateDistanceFee(minDistance),
    [minDistance],
  )

  return {
    mechanics,
    assignedMechanic: nearest,
    distanceKm,
    distanceFeePesos: feePesos,
    distanceFeeCents: feePesos * 100,
    tiers,
    formattedDistance: `${distanceKm.toFixed(1)} km`,
    formattedDistanceFee: formattedFee,
    loading,
  }
}
