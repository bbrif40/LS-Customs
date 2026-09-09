/**
 * useCustomerVehicles — customer-facing fleet query.
 *
 * Only returns vehicles with is_active = true (admins use the unfiltered
 * useAdminVehicles hook from useAdminData for the management screen).
 * Maps the DB row shape onto the lightweight UI Vehicle type used by
 * VehicleCard / Rentals / Dashboard, so the rest of the customer app
 * doesn't need to know about Supabase column names.
 */
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import type { Vehicle as DbVehicle } from '@ls-customs/shared-types'
import type { Vehicle as UiVehicle } from '../types'

interface UseCustomerVehiclesResult {
  vehicles: UiVehicle[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

// Map one DB row to the UI shape used by VehicleCard.
function toUiVehicle(row: DbVehicle): UiVehicle {
  const detailParts: string[] = []
  if (row.sub_category) detailParts.push(row.sub_category)
  if (row.seats) detailParts.push(`${row.seats} seats`)
  if (row.transmission) detailParts.push(row.transmission)

  return {
    id: row.id,
    category: row.category,
    name: row.name,
    detail: detailParts.join(' · ') || row.category.replace('_', ' '),
    price: `₱${row.price_per_day.toLocaleString()}`,
    pricePerDay: row.price_per_day,
    image: row.image_url || '',
    tag: row.sub_category ? row.sub_category.toUpperCase() : row.category.toUpperCase(),
    rating: row.rating_avg ? row.rating_avg.toFixed(1) : '0.0',
    galleryImages: row.gallery_urls?.length ? row.gallery_urls : row.image_url ? [row.image_url] : [],
    location: row.location || 'Los Santos',
    description: row.description || 'Always in good running condition.',
    hostName: row.host_name || 'LS Customs',
    hostRating: row.host_rating ? row.host_rating.toFixed(1) : 'N/A',
    features: row.features || [],
    rentalRules: row.rental_rules || [],
    mileagePolicy: row.mileage_policy || 'Mileage terms provided at pickup',
    maxTrip: row.max_trip || 'Flexible rental duration',
    deliveryMethods: row.delivery_methods || [],
  }
}

export function useCustomerVehicles(
  options: { limit?: number; orderByRating?: boolean } = {}
): UseCustomerVehiclesResult {
  const { limit, orderByRating = false } = options
  const [vehicles, setVehicles] = useState<UiVehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchVehicles = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('vehicles')
        .select(
          'id, category, sub_category, name, description, seats, transmission, fuel_type, price_per_day, image_url, gallery_urls, location, host_name, host_rating, features, rental_rules, mileage_policy, max_trip, delivery_methods, is_active, rating_avg, rating_count, created_at, updated_at'
        )
        .eq('is_active', true)

      if (orderByRating) {
        query = query.order('rating_avg', { ascending: false })
      } else {
        query = query.order('created_at', { ascending: false })
      }

      if (typeof limit === 'number') {
        query = query.limit(limit)
      }

      const { data, error: queryError } = await query
      if (queryError) throw queryError

      setVehicles((data ?? []).map(toUiVehicle))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vehicles')
    } finally {
      setLoading(false)
    }
  }, [limit, orderByRating])

  useEffect(() => {
    void fetchVehicles()
  }, [fetchVehicles])

  return { vehicles, loading, error, refetch: fetchVehicles }
}
