import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export interface CustomerVehicleBooking {
  id: string
  vehicle_id: string
  start_date: string
  end_date: string
  pickup_location: string | null
  status: string
  total_price: number
  created_at: string
  vehicles: { name: string; image_url: string | null } | null
}

export interface CustomerServiceBooking {
  id: string
  scheduled_at: string
  status: string
  total_price: number
  created_at: string
  pin_lat: number | null
  pin_lng: number | null
  mechanic_id: string | null
  // Mechanic's live location + contact details. Lives on the
  // mechanic_profiles row (not on the booking) and chains through
  // profiles to get the name/phone the customer sees in the assigned card.
  mechanic_profiles: {
    current_lat: number | null
    current_lng: number | null
    profiles: { full_name: string | null; phone: string | null } | null
  } | null
  service_booking_items: { mechanic_services: { name: string } | null }[] | null
}

export function useCustomerBookings(userId: string | undefined) {
  const [vehicleBookings, setVehicleBookings] = useState<CustomerVehicleBooking[]>([])
  const [serviceBookings, setServiceBookings] = useState<CustomerServiceBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!userId) { setVehicleBookings([]); setServiceBookings([]); setLoading(false); return }
    setLoading(true); setError(null)
    const [vehiclesResult, servicesResult] = await Promise.all([
      supabase.from('vehicle_bookings').select('id, vehicle_id, start_date, end_date, pickup_location, status, total_price, created_at, vehicles(name, image_url)').eq('customer_id', userId).order('created_at', { ascending: false }),
      supabase.from('service_bookings').select('id, scheduled_at, status, total_price, created_at, pin_lat, pin_lng, mechanic_id, mechanic_profiles(current_lat, current_lng, profiles(full_name, phone)), service_booking_items(mechanic_services(name))').eq('customer_id', userId).order('scheduled_at', { ascending: false }),
    ])
    if (vehiclesResult.error || servicesResult.error) setError((vehiclesResult.error ?? servicesResult.error)?.message ?? 'Failed to load bookings')
    setVehicleBookings((vehiclesResult.data ?? []) as unknown as CustomerVehicleBooking[])
    setServiceBookings((servicesResult.data ?? []) as unknown as CustomerServiceBooking[])
    setLoading(false)
  }, [userId])

  useEffect(() => { void refetch() }, [refetch])
  return { vehicleBookings, serviceBookings, loading, error, refetch }
}