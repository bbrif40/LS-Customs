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
  payments: {
    id: string
    status: string
    amount: number
    currency: string
    provider: string | null
  } | null
}

export interface CustomerServiceBooking {
  id: string
  scheduled_at: string
  status: string
  total_price: number
  created_at: string
  pin_lat: number | null
  pin_lng: number | null
  notes?: string | null
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
  payments: {
    id: string
    status: string
    amount: number
    currency: string
    provider: string | null
  } | null
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
      supabase.from('service_bookings').select('id, scheduled_at, status, total_price, notes, created_at, pin_lat, pin_lng, mechanic_id, mechanic_profiles(current_lat, current_lng, profiles(full_name, phone)), service_booking_items(mechanic_services(name))').eq('customer_id', userId).order('scheduled_at', { ascending: false }),
    ])
    if (vehiclesResult.error || servicesResult.error) setError((vehiclesResult.error ?? servicesResult.error)?.message ?? 'Failed to load bookings')
    const vehicles = (vehiclesResult.data ?? []) as unknown as CustomerVehicleBooking[]
    const services = (servicesResult.data ?? []) as unknown as CustomerServiceBooking[]

    // Fetch payments separately and merge — payments uses a polymorphic
    // (booking_type + booking_id) relation, so PostgREST can't auto-embed.
    const allIds = [...vehicles.map((b) => b.id), ...services.map((b) => b.id)]
    if (allIds.length > 0) {
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select('id, booking_type, booking_id, status, amount, currency, provider, created_at')
        .in('booking_id', allIds)

      if (!paymentsError && paymentsData) {
        const paymentByBooking = new Map<string, typeof paymentsData[0]>()
        for (const p of paymentsData) {
          const key = `${p.booking_type}:${p.booking_id}`
          // Keep the most recent payment if there are multiple
          const existing = paymentByBooking.get(key)
          if (!existing || new Date(p.created_at ?? p.id) > new Date(existing.created_at ?? existing.id)) {
            paymentByBooking.set(key, p)
          }
        }

        for (const booking of vehicles) {
          const payment = paymentByBooking.get(`vehicle:${booking.id}`)
          if (payment) {
            booking.payments = {
              id: payment.id,
              status: payment.status,
              amount: Number(payment.amount),
              currency: payment.currency,
              provider: payment.provider,
            }
          }
        }
        for (const booking of services) {
          const payment = paymentByBooking.get(`service:${booking.id}`)
          if (payment) {
            booking.payments = {
              id: payment.id,
              status: payment.status,
              amount: Number(payment.amount),
              currency: payment.currency,
              provider: payment.provider,
            }
          }
        }
      }
    }

    setVehicleBookings(vehicles)
    setServiceBookings(services)
    setLoading(false)
  }, [userId])

  useEffect(() => { void refetch() }, [refetch])
  return { vehicleBookings, serviceBookings, loading, error, refetch }
}

export const CUSTOMER_ACTIVE_STATUSES = [
  'pending',
  'confirmed',
  'assigned',
  'en_route',
  'in_progress',
] as const

/**
 * useCustomerActiveBookingsCount — provides a real-time reactive count of
 * the customer's current active bookings (both vehicle rentals and mechanic
 * services) to display in the sidebar.
 */
export function useCustomerActiveBookingsCount(userId: string | undefined): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!userId) {
      setCount(0)
      return
    }

    let cancelled = false
    const fetchCount = async () => {
      try {
        const [vehicles, services] = await Promise.all([
          supabase
            .from('vehicle_bookings')
            .select('id', { count: 'exact', head: true })
            .eq('customer_id', userId)
            .in('status', [...CUSTOMER_ACTIVE_STATUSES]),
          supabase
            .from('service_bookings')
            .select('id', { count: 'exact', head: true })
            .eq('customer_id', userId)
            .in('status', [...CUSTOMER_ACTIVE_STATUSES]),
        ])
        if (cancelled) return
        const v = vehicles.count ?? 0
        const s = services.count ?? 0
        setCount(v + s)
      } catch (err) {
        // Non-fatal
      }
    }

    void fetchCount()

    // Real-time listener on changes to customer bookings
    const channel = supabase
      .channel(`customer-active-bookings-count-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vehicle_bookings', filter: `customer_id=eq.${userId}` },
        () => { void fetchCount() },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_bookings', filter: `customer_id=eq.${userId}` },
        () => { void fetchCount() },
      )
      .subscribe()

    // Polling fallback to guarantee accuracy
    const intervalId = window.setInterval(fetchCount, 5_000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      void supabase.removeChannel(channel)
    }
  }, [userId])

  return count
}