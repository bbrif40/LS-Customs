/**
 * useTrendingServices — pick a few featured mechanic services for the
 * Dashboard's "Trending" tiles. Reads from the same `mechanic_services`
 * table as the booking flow; ordered by price so the cheapest offerings
 * surface first (proxy for "popular entry points" until we have real
 * booking counts to rank by).
 *
 * ponytail: in-memory ordering is fine for a 2-tile highlight; switch to a
 * weighted rank (booking count, rating) when those tables carry it.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import type { MechanicService } from '@ls-customs/shared-types'

export interface TrendingService {
  id: string
  name: string
  description: string | null
  category: string
  basePrice: number
  durationMinutes: number
}

interface UseTrendingServicesResult {
  services: TrendingService[]
  loading: boolean
  error: string | null
}

export function useTrendingServices(limit: number = 2): UseTrendingServicesResult {
  const [services, setServices] = useState<TrendingService[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    supabase
      .from('mechanic_services')
      .select('id, main_category, name, description, base_price, estimated_duration_minutes, is_active')
      .eq('is_active', true)
      .order('base_price', { ascending: true })
      .limit(limit)
      .then(({ data, error: queryError }) => {
        if (!mounted) return
        if (queryError) {
          setError(queryError.message)
          setLoading(false)
          return
        }
        const rows = (data ?? []) as Pick<MechanicService, 'id' | 'main_category' | 'name' | 'description' | 'base_price' | 'estimated_duration_minutes' | 'is_active'>[]
        setServices(
          rows.map((row) => ({
            id: row.id,
            name: row.name,
            description: row.description,
            category: row.main_category,
            basePrice: Number(row.base_price),
            durationMinutes: row.estimated_duration_minutes,
          })),
        )
        setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [limit])

  return { services, loading, error }
}
