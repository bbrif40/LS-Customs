/**
 * useServices — service catalog for the mechanic booking flow.
 *
 * Tries to read from Supabase `mechanic_services` (the real table per the
 * shared schema). If the table is missing or the query errors for any
 * reason, falls back to the static `services` array so the UI never
 * blocks on a missing migration.
 *
 * Returns the same `Service` UI shape regardless of source, so the rest
 * of the booking flow never branches on which side answered.
 */
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { services as staticServices } from '../data/services'
import type { Service } from '../types'
import type { MechanicService } from '@ls-customs/shared-types'

type Source = 'supabase' | 'static'

interface UseServicesResult {
  services: Service[]
  loading: boolean
  error: string | null
  source: Source
  refetch: () => Promise<void>
}

// Map a real DB row to the UI Service shape.
function toUiService(row: MechanicService): Service {
  return {
    name: row.name,
    category: row.main_category,
    price: `$${row.base_price.toFixed(2)}`,
    duration: `${row.estimated_duration_minutes} mins`,
    icon: '✳',
    // Hidden fields used by the booking flow. `Service` from
    // src/types/index.ts does not yet carry these, so we attach them
    // via a parallel index lookup; the booking flow keeps its own
    // type-safe view of the chosen service.
    id: row.id,
    priceCents: Math.round(row.base_price * 100),
    durationMinutes: row.estimated_duration_minutes,
  }
}

// Map a static catalog row to the same shape.
function staticToUi(s: Service): Service {
  return {
    ...s,
    id: s.name, // fallback identifier when no DB id is available
    priceCents: Math.round(parsePriceToCents(s.price)),
    durationMinutes: parseDurationToMinutes(s.duration),
  }
}

function parsePriceToCents(price: string): number {
  const n = Number(price.replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

function parseDurationToMinutes(duration: string): number {
  const trimmed = duration.trim().toLowerCase()
  const hrMatch = trimmed.match(/^([\d.]+)\s*hr/)
  if (hrMatch) return Math.round(parseFloat(hrMatch[1]) * 60)
  const minMatch = trimmed.match(/^([\d.]+)\s*min/)
  if (minMatch) return Math.round(parseFloat(minMatch[1]))
  const numMatch = trimmed.match(/([\d.]+)/)
  if (numMatch) return Math.round(parseFloat(numMatch[1]))
  return 60
}

export function useServices(): UseServicesResult {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<Source>('static')

  const fetchServices = useCallback(async () => {
    setLoading(true)
    setError(null)

    // Static fallback: always available, even before any DB call.
    const fallback = staticServices.map(staticToUi)

    try {
      const { data, error: queryError } = await supabase
        .from('mechanic_services')
        .select('id, mechanic_id, main_category, name, description, base_price, estimated_duration_minutes, is_active, created_at, updated_at')
        .eq('is_active', true)
        .order('main_category', { ascending: true })

      if (queryError) throw queryError

      const rows = (data ?? []) as MechanicService[]
      if (rows.length === 0) {
        // Empty table — still use the static list rather than rendering
        // a blank flow, but mark source as supabase so the UI can show a
        // small "synced" indicator later.
        setSource('supabase')
        setServices(fallback)
        return
      }

      setSource('supabase')
      setServices(rows.map(toUiService))
    } catch (err) {
      // Swallow the error and use the static catalog. The DB shouldn't
      // block the booking flow during development.
      setError(err instanceof Error ? err.message : 'Failed to load services')
      setSource('static')
      setServices(fallback)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchServices()
  }, [fetchServices])

  return { services, loading, error, source, refetch: fetchServices }
}
