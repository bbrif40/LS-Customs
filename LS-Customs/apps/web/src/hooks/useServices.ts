/**
 * useServices — service catalog for the mechanic booking flow.
 *
 * Reads from Supabase `mechanic_services`. The catalog is the source of
 * truth for both the customer and admin apps; no static fallback here.
 * If the query fails the hook surfaces the error so the caller can show
 * it instead of silently swapping in a divergent list.
 *
 * Subscribes to INSERT/UPDATE/DELETE on `mechanic_services` so a service
 * the admin just added or toggled appears in the customer flow without
 * a hard refresh.
 */
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import type { Service } from '../types'
import type { MechanicService } from '@ls-customs/shared-types'

type Source = 'supabase'

interface UseServicesResult {
  services: Service[]
  loading: boolean
  error: string | null
  source: Source
  refetch: () => Promise<void>
}

function toUiService(row: MechanicService): Service {
  return {
    name: row.name,
    category: row.main_category,
    price: `₱${row.base_price.toFixed(2)}`,
    duration: `${row.estimated_duration_minutes} mins`,
    icon: '✳',
    id: row.id,
    priceCents: Math.round(row.base_price * 100),
    durationMinutes: row.estimated_duration_minutes,
  }
}

export function useServices(): UseServicesResult {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [source] = useState<Source>('supabase')

  const fetchServices = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: queryError } = await supabase
        .from('mechanic_services')
        .select('id, main_category, name, description, base_price, estimated_duration_minutes, is_active')
        .eq('is_active', true)
        .order('main_category', { ascending: true })

      if (queryError) throw queryError
      const rows = (data ?? []) as MechanicService[]
      setServices(rows.map(toUiService))
    } catch (err) {
      const e = err as { message?: string } | null
      setError(e?.message ?? (err instanceof Error ? err.message : 'Failed to load services'))
      setServices([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchServices()
    // ponytail: any change to the catalog should land in the customer flow
    // without a hard refresh — refetch on insert/update/delete. Filter on
    // is_active so toggles that hide a row take effect immediately.
    const channel = supabase
      .channel('mechanic-services-catalog')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mechanic_services' }, () => { void fetchServices() })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [fetchServices])

  return { services, loading, error, source, refetch: fetchServices }
}
