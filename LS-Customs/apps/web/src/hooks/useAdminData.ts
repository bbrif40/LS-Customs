/**
 * Admin data fetching hooks — typed against shared-types.
 * All queries use the shared Supabase client and rely on RLS policies
 * (admin access via is_admin() helper) for authorization.
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { useTicketRealtime } from '../components/common/TicketRealtimeProvider'
import type {
  Vehicle,
  MechanicService,
  MechanicProfile,
  Profile,
  VehicleBooking,
  ServiceBooking,
} from '@ls-customs/shared-types'

// Type aliases for joined data (Supabase returns joined tables as arrays)
type MechanicWithProfile = MechanicProfile & {
  profiles: Profile[] | null
}

type VehicleBookingWithCustomer = VehicleBooking & {
  profiles: Profile[] | null
  vehicles: Vehicle[] | null
}

type AdminProfileSummary = Pick<Profile, 'id' | 'full_name' | 'phone'>
type AdminMechanicSummary = Pick<MechanicProfile, 'id' | 'specialties' | 'rating_avg'> & {
  is_available: boolean | null
  profiles: AdminProfileSummary[] | null
}

type ServiceBookingWithDetails = ServiceBooking & {
  profiles: AdminProfileSummary[] | null
  mechanic_profiles: AdminMechanicSummary[] | null
  addresses: {
    id: string
    line1: string
    city: string
  }[] | null
  service_booking_items: (ServiceBookingItem & {
    mechanic_services: MechanicService | null
  })[] | null
}

type ServiceBookingItem = {
  id: string
  service_booking_id: string
  mechanic_service_id: string
  quantity: number
  price_at_booking: number
}

interface UseAdminQueryResult<T> {
  data: T[] | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

// Generic hook for admin list queries.
// NOTE: deps deliberately omit `orderBy` (object identity changes per render
// and would otherwise cause endless refetch + spinner flicker).
function useAdminList<T>(
  table: string,
  select: string,
  orderBy?: { column: string; ascending?: boolean }
): UseAdminQueryResult<T> {
  const [data, setData] = useState<T[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Stable string key so the effect doesn't refire on every render.
  const orderKey = orderBy ? `${orderBy.column}:${orderBy.ascending ?? false}` : ''

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let query = supabase.from(table).select(select)
      if (orderBy) {
        query = query.order(orderBy.column, { ascending: orderBy.ascending ?? false })
      }
      const { data: result, error: queryError } = await query
      if (queryError) throw queryError
      setData(result as T[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, select, orderKey])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { data, loading, error, refetch: fetchData }
}

// ── Vehicles (Fleet) ─────────────────────────────────────────────
export function useAdminVehicles() {
  return useAdminList<Vehicle>(
    'vehicles',
    'id, category, sub_category, name, description, seats, transmission, fuel_type, price_per_day, image_url, gallery_urls, location, host_name, host_rating, features, rental_rules, mileage_policy, max_trip, delivery_methods, is_active, rating_avg, rating_count, created_at, updated_at',
    { column: 'created_at', ascending: false }
  )
}

// Create vehicle
export async function createVehicle(vehicle: Omit<Vehicle, 'id' | 'created_at' | 'updated_at' | 'rating_avg' | 'rating_count'>) {
  const { data, error } = await supabase
    .from('vehicles')
    .insert(vehicle)
    .select()
    .single()
  if (error) throw error
  return data as Vehicle
}

// Update vehicle
export async function updateVehicle(id: string, updates: Partial<Vehicle>) {
  const { data, error } = await supabase
    .from('vehicles')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Vehicle
}

// Deactivate vehicle (soft delete)
export async function deactivateVehicle(id: string) {
  return updateVehicle(id, { is_active: false })
}

// ── Mechanic Services ────────────────────────────────────────────
export function useAdminMechanicServices() {
  return useAdminList<MechanicService>(
    'mechanic_services',
    'id, main_category, name, description, base_price, estimated_duration_minutes, is_active, created_at, updated_at',
    { column: 'main_category', ascending: true }
  )
}

export async function createMechanicService(service: Omit<MechanicService, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('mechanic_services')
    .insert(service)
    .select()
    .single()
  if (error) throw error
  return data as MechanicService
}

export async function updateMechanicService(id: string, updates: Partial<MechanicService>) {
  const { data, error } = await supabase
    .from('mechanic_services')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as MechanicService
}

export async function deactivateMechanicService(id: string) {
  return updateMechanicService(id, { is_active: false })
}

// ── Mechanics (Mechanic Profiles with Profiles join) ─────────────
export function useAdminMechanics() {
  const [data, setData] = useState<MechanicWithProfile[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: result, error: queryError } = await supabase
        .from('mechanic_profiles')
        .select(`
          id,
          specialties,
          is_available,
          current_lat,
          current_lng,
          years_experience,
          rating_avg,
          rating_count,
          created_at,
          updated_at,
          profiles!left (
            id,
            full_name,
            phone,
            avatar_url,
            role,
            created_at,
            updated_at
          )
        `)
        .order('created_at', { ascending: false })

      setData(result as unknown as MechanicWithProfile[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch mechanics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const updateMechanic = async (id: string, updates: Partial<MechanicProfile>) => {
    const { data, error: updateError } = await supabase
      .from('mechanic_profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (updateError) throw updateError
    await fetchData() // refetch
    return data as MechanicProfile
  }

  const deactivateMechanic = async (id: string) => {
    return updateMechanic(id, { is_available: false })
  }

  return { data, loading, error, refetch: fetchData, updateMechanic, deactivateMechanic }
}

// ── All Users (Profiles) ────────────────────────────────────────
export function useAdminUsers() {
  return useAdminList<Profile>(
    'profiles',
    'id, full_name, phone, avatar_url, role, created_at, updated_at',
    { column: 'created_at', ascending: false }
  )
}

// Admin update: phone only (avoids touching fields the admin shouldn't change).
// RLS permits this via the `profiles update admin` policy.
export async function updateUserPhone(userId: string, phone: string | null): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ phone })
    .eq('id', userId)
    .select('id, full_name, phone, avatar_url, role, created_at, updated_at')
    .single()
  if (error) throw error
  return data as Profile
}

// Admin upsert: create or update a customer's default address.
// RLS permits this via the new `addresses insert admin` / `addresses update admin`
// policies (20260829120000_admin_address_write.sql).
// `lat`/`lng` default to 0; replace with geocoded values when available.
export interface AdminAddressInput {
  customerId: string
  line1: string
  city: string
  label?: string | null
}

export async function upsertUserDefaultAddress(input: AdminAddressInput): Promise<AdminUserAddress> {
  // Look up an existing default for this customer.
  const { data: existing, error: lookupError } = await supabase
    .from('addresses')
    .select('id')
    .eq('customer_id', input.customerId)
    .eq('is_default', true)
    .maybeSingle()
  if (lookupError) throw lookupError

  if (existing?.id) {
    const { data, error } = await supabase
      .from('addresses')
      .update({
        line1: input.line1,
        city: input.city,
        label: input.label ?? null,
      })
      .eq('id', existing.id)
      .select('customer_id, line1, city, label')
      .single()
    if (error) throw error
    return data as AdminUserAddress
  }

  // No existing default — clear any other defaults and insert a new one.
  await supabase
    .from('addresses')
    .update({ is_default: false })
    .eq('customer_id', input.customerId)
    .eq('is_default', true)

  const { data, error } = await supabase
    .from('addresses')
    .insert({
      customer_id: input.customerId,
      line1: input.line1,
      city: input.city,
      lat: 0,
      lng: 0,
      is_default: true,
      label: input.label ?? 'Home',
    })
    .select('customer_id, line1, city, label')
    .single()
  if (error) throw error
  return data as AdminUserAddress
}

// ── Admin: flag a user (ban + delete profile) ────────────────────────
//
// This is IRREVERSIBLE from the app. The flag-user Edge Function:
//   1. Sets auth.users.banned_until to ~100 years out, blocking sign-in.
//   2. Deletes the profiles row; ON DELETE CASCADE wipes addresses,
//      bookings, support_tickets, etc.
//
// The only way to restore the user is to manually clear `banned_until`
// in the Supabase Studio auth dashboard.
export interface FlagUserResult {
  user_id: string
  banned_until: string
  deleted_profile: boolean
}

export async function flagUser(userId: string): Promise<FlagUserResult> {
  const { data, error } = await supabase.functions.invoke('flag-user', {
    body: { user_id: userId },
  })

  // supabase.functions.invoke returns { data, error }. The Edge Function
  // also wraps its payload in { data, error } per API.md §2, so unwrap once.
  const payload = (data as { data?: FlagUserResult; error?: { message: string } } | null)?.data ?? data
  const wrappedError = (data as { error?: { message: string } } | null)?.error

  if (error) throw new Error(error.message)
  if (wrappedError) throw new Error(wrappedError.message)
  if (!payload) throw new Error('Empty response from flag-user')

  return payload as FlagUserResult
}

// ── Default addresses for users (for the Users panel Contact column) ───
export interface AdminUserAddress {
  customer_id: string
  line1: string
  city: string
  label: string | null
}

/**
 * useAdminUserAddresses — fetches the default address for every user so the
 * admin Users panel can show contact info at a glance. One round-trip, then
 * keyed by customer_id for O(1) lookup in the table.
 */
export function useAdminUserAddresses(): {
  addressesByCustomerId: Record<string, AdminUserAddress>
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
} {
  const [addressesByCustomerId, setAddressesByCustomerId] = useState<Record<string, AdminUserAddress>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAddresses = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: queryError } = await supabase
        .from('addresses')
        .select('customer_id, line1, city, label')
        .eq('is_default', true)
      if (queryError) throw queryError
      const map: Record<string, AdminUserAddress> = {}
      for (const row of data ?? []) {
        map[row.customer_id] = row as AdminUserAddress
      }
      setAddressesByCustomerId(map)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load addresses')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchAddresses()
  }, [fetchAddresses])

  return { addressesByCustomerId, loading, error, refetch: fetchAddresses }
}

// ── Bookings (Vehicle + Service) ────────────────────────────────
export function useAdminVehicleBookings() {
  const [data, setData] = useState<VehicleBookingWithCustomer[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: result, error: queryError } = await supabase
        .from('vehicle_bookings')
        .select(`
          id,
          vehicle_id,
          customer_id,
          start_date,
          end_date,
          pickup_location,
          status,
          total_price,
          created_at,
          updated_at,
          profiles!inner (
            id,
            full_name,
            phone
          ),
          vehicles!inner (
            id,
            name,
            category,
            image_url
          )
        `)
        .order('created_at', { ascending: false })

      if (queryError) throw queryError
      setData(result as unknown as VehicleBookingWithCustomer[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch vehicle bookings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const updateBookingStatus = async (id: string, status: VehicleBooking['status']) => {
    const { error: updateError } = await supabase
      .from('vehicle_bookings')
      .update({ status })
      .eq('id', id)
    if (updateError) throw updateError
    await fetchData()
  }

  return { data, loading, error, refetch: fetchData, updateBookingStatus }
}

export function useAdminServiceBookings() {
  const [data, setData] = useState<ServiceBookingWithDetails[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // PostgREST's auto-detected relationships can lag the schema cache
      // on Supabase, which causes the booking query to 400 if it tries to
      // follow FK chains in a single SELECT. The previous fix used a
      // two-pass query but still embedded `mechanic_profiles!left ( ...
      // profiles!inner ( ... ) )` directly on `service_bookings`, which
      // is the same nested-embed pattern PostgREST can refuse. To make
      // the call robust regardless of cache state, start with a flat
      // column list (no embeds), then enrich each booking with the
      // joined rows in follow-up queries keyed by id. Every follow-up
      // failure is non-fatal: the panel still shows the bookings, just
      // with whichever joins the schema cache happens to support.
      const { data: rows, error: queryError } = await supabase
        .from('service_bookings')
        .select(
          'id, customer_id, mechanic_id, address_id, pin_lat, pin_lng, ' +
            // current_lat, current_lng, location_updated_at
            // are read by AdminBookingDetail's live map. They are added
            // by migration 20260901120000 — until the migration is
            // applied, the SELECT omits them so the page still loads.
            'scheduled_at, status, total_price, notes, created_at, updated_at',
        )
        .order('created_at', { ascending: false })

      if (queryError) {
        // eslint-disable-next-line no-console
        console.error('[useAdminServiceBookings] first query failed', queryError)
        throw queryError
      }

      const safeRows: ServiceBookingWithDetails[] = ((rows ?? []) as unknown as ServiceBookingWithDetails[]).map(
        (b) => ({
          ...b,
          profiles: null,
          mechanic_profiles: null,
          addresses: null,
          service_booking_items: [],
        }),
      )

      const bookingIds = safeRows.map((b) => b.id)
      if (bookingIds.length === 0) {
        setData(safeRows)
        return
      }

      // Each follow-up is independent and non-fatal. We never throw
      // out of the catch; we only set `error` if the very first query
      // (or the absolute data shape) is broken.

      // 1. Customer profiles (one per booking by customer_id). PostgREST
      //    returns one row per id, not an array; we wrap with `[row]`
      //    so the existing `b.profiles?.[0]?.full_name` accesses in the
      //    panel still work (the type was always `Profile[] | null`).
      const customerIds = Array.from(
        new Set(safeRows.map((b) => b.customer_id).filter((id): id is string => Boolean(id))),
      )
      if (customerIds.length > 0) {
        const { data: customerRows, error: customerErr } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', customerIds)
        if (customerErr) {
          // eslint-disable-next-line no-console
          console.warn('[useAdminServiceBookings] customers query failed (non-fatal)', customerErr)
        } else if (customerRows) {
          const byCustomer = new Map<string, NonNullable<ServiceBookingWithDetails['profiles']>>()
          for (const row of customerRows as { id: string; full_name: string; phone: string | null }[]) {
            byCustomer.set(row.id, [row])
          }
          for (const b of safeRows) {
            b.profiles = byCustomer.get(b.customer_id) ?? null
          }
        }
      }

      // 2. Mechanic profiles — single-level embed of profiles inside
      //    mechanic_profiles is still nested, so do them in two
      //    separate passes and stitch the result in memory.
      const mechanicIds = Array.from(
        new Set(safeRows.map((b) => b.mechanic_id).filter((id): id is string => Boolean(id))),
      )
      if (mechanicIds.length > 0) {
        const { data: mechanicRows, error: mechanicErr } = await supabase
          .from('mechanic_profiles')
          .select('id, specialties, is_available, rating_avg, user_id')
          .in('id', mechanicIds)
        if (mechanicErr) {
          // eslint-disable-next-line no-console
          console.warn('[useAdminServiceBookings] mechanics query failed (non-fatal)', mechanicErr)
        } else if (mechanicRows) {
          const userIds = Array.from(
            new Set(
              (mechanicRows as { user_id: string | null }[])
                .map((r) => r.user_id)
                .filter((id): id is string => Boolean(id)),
            ),
          )
          let userRows: { id: string; full_name: string; phone: string | null }[] = []
          if (userIds.length > 0) {
            const { data: users, error: usersErr } = await supabase
              .from('profiles')
              .select('id, full_name, phone')
              .in('id', userIds)
            if (usersErr) {
              // eslint-disable-next-line no-console
              console.warn('[useAdminServiceBookings] mechanic users query failed (non-fatal)', usersErr)
            } else if (users) {
              userRows = users as { id: string; full_name: string; phone: string | null }[]
            }
          }
          const usersById = new Map(userRows.map((u) => [u.id, u]))
          const byMechanic = new Map<string, NonNullable<ServiceBookingWithDetails['mechanic_profiles']>>()
          for (const row of mechanicRows as { id: string; specialties: string[] | null; is_available: boolean | null; rating_avg: number | null; user_id: string | null }[]) {
            const u = row.user_id ? usersById.get(row.user_id) : undefined
            byMechanic.set(row.id, [
              {
                id: row.id,
                specialties: row.specialties,
                is_available: row.is_available,
                rating_avg: row.rating_avg ?? 0,
                profiles: u ? [u] : null,
              },
            ])
          }
          for (const b of safeRows) {
            b.mechanic_profiles = b.mechanic_id ? byMechanic.get(b.mechanic_id) ?? null : null
          }
        }
      }

      // 3. Addresses — single-level, but pull by id to be safe. PostgREST
      //    returns one row per id; the type is `Address[] | null` (the
      //    Supabase convention for embed-like fields) so we wrap with
      //    `[row]` for panel compatibility.
      const addressIds = Array.from(
        new Set(safeRows.map((b) => b.address_id).filter((id): id is string => Boolean(id))),
      )
      if (addressIds.length > 0) {
        const { data: addressRows, error: addressErr } = await supabase
          .from('addresses')
          .select('id, line1, city')
          .in('id', addressIds)
        if (addressErr) {
          // eslint-disable-next-line no-console
          console.warn('[useAdminServiceBookings] addresses query failed (non-fatal)', addressErr)
        } else if (addressRows) {
          const byAddress = new Map<string, NonNullable<ServiceBookingWithDetails['addresses']>>()
          for (const row of addressRows as { id: string; line1: string; city: string }[]) {
            byAddress.set(row.id, [row])
          }
          for (const b of safeRows) {
            b.addresses = b.address_id ? byAddress.get(b.address_id) ?? null : null
          }
        }
      }

      // 4. Line items + their mechanic_services. Same nested-embed
      //    risk, so split into two passes.
      const { data: itemRows, error: itemsError } = await supabase
        .from('service_booking_items')
        .select('id, service_booking_id, mechanic_service_id, quantity, price_at_booking')
        .in('service_booking_id', bookingIds)
      if (itemsError) {
        // eslint-disable-next-line no-console
        console.warn('[useAdminServiceBookings] items query failed (non-fatal)', itemsError)
      } else if (itemRows) {
        const itemRowsTyped = itemRows as {
          id: string
          service_booking_id: string
          mechanic_service_id: string
          quantity: number
          price_at_booking: number
        }[]
        const serviceIds = Array.from(
          new Set(
            itemRowsTyped
              .map((r) => r.mechanic_service_id)
              .filter((id): id is string => Boolean(id)),
          ),
        )
        let servicesById = new Map<string, MechanicService>()
        if (serviceIds.length > 0) {
          const { data: serviceRows, error: serviceErr } = await supabase
            .from('mechanic_services')
            .select('id, name, main_category, base_price')
            .in('id', serviceIds)
          if (serviceErr) {
            // eslint-disable-next-line no-console
            console.warn('[useAdminServiceBookings] services query failed (non-fatal)', serviceErr)
          } else if (serviceRows) {
            servicesById = new Map(
              (serviceRows as MechanicService[]).map((s) => [s.id, s]),
            )
          }
        }
        const byBooking = new Map<string, NonNullable<ServiceBookingWithDetails['service_booking_items']>>()
        for (const row of itemRowsTyped) {
          const list = byBooking.get(row.service_booking_id) ?? []
          list.push({
            id: row.id,
            service_booking_id: row.service_booking_id,
            mechanic_service_id: row.mechanic_service_id,
            quantity: row.quantity,
            price_at_booking: row.price_at_booking,
            mechanic_services: servicesById.get(row.mechanic_service_id) ?? null,
          })
          byBooking.set(row.service_booking_id, list)
        }
        for (const b of safeRows) {
          b.service_booking_items = byBooking.get(b.id) ?? []
        }
      }

      setData(safeRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch service bookings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const updateBookingStatus = async (id: string, status: ServiceBooking['status']) => {
    const { error: updateError } = await supabase
      .from('service_bookings')
      .update({ status })
      .eq('id', id)
    if (updateError) throw updateError
    await fetchData()
  }

  return { data, loading, error, refetch: fetchData, updateBookingStatus }
}

// ── Per-user transactions for the logbook modal ────────────────────

export interface VehicleBookingLogEntry {
  id: string
  created_at: string
  start_date: string
  end_date: string
  status: VehicleBooking['status']
  total_price: number
  pickup_location: string | null
  vehicle_name: string | null
  vehicle_category: string | null
}

export interface ServiceBookingLogEntry {
  id: string
  created_at: string
  scheduled_at: string
  status: ServiceBooking['status']
  total_price: number
  notes: string | null
  mechanic_name: string | null
  address_line1: string | null
  address_city: string | null
}

interface UseUserTransactionsResult {
  rentals: VehicleBookingLogEntry[]
  services: ServiceBookingLogEntry[]
  rentalsTotal: number
  servicesTotal: number
  loading: boolean
  error: string | null
  loadMoreRentals: () => Promise<void>
  loadMoreServices: () => Promise<void>
  hasMoreRentals: boolean
  hasMoreServices: boolean
  refetch: () => Promise<void>
}

const PAGE_SIZE = 10

/**
 * useUserTransactions — fetches a paginated logbook of one user's vehicle
 * rentals and mechanic service bookings. RLS permits admin reads via
 * is_admin() (see vehicle_bookings / service_bookings policies).
 */
export function useUserTransactions(
  customerId: string | null,
): UseUserTransactionsResult {
  const [rentals, setRentals] = useState<VehicleBookingLogEntry[]>([])
  const [services, setServices] = useState<ServiceBookingLogEntry[]>([])
  const [rentalsTotal, setRentalsTotal] = useState(0)
  const [servicesTotal, setServicesTotal] = useState(0)
  const [rentalsPage, setRentalsPage] = useState(0)
  const [servicesPage, setServicesPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRentals = useCallback(
    async (page: number, append: boolean) => {
      if (!customerId) return
      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      const { data, error: qErr, count } = await supabase
        .from('vehicle_bookings')
        .select(
          'id, created_at, start_date, end_date, status, total_price, pickup_location, vehicles!inner(name, category)',
          { count: 'exact' },
        )
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .range(from, to)
      if (qErr) throw qErr
      const rows: VehicleBookingLogEntry[] = (data ?? []).map((row) => {
        const v = (row as { vehicles: { name: string; category: string } | { name: string; category: string }[] | null })
          .vehicles
        const vehicle = Array.isArray(v) ? v[0] : v
        return {
          id: row.id,
          created_at: row.created_at,
          start_date: row.start_date,
          end_date: row.end_date,
          status: row.status,
          total_price: row.total_price,
          pickup_location: row.pickup_location,
          vehicle_name: vehicle?.name ?? null,
          vehicle_category: vehicle?.category ?? null,
        }
      })
      setRentals((prev) => (append ? [...prev, ...rows] : rows))
      setRentalsTotal(count ?? 0)
    },
    [customerId],
  )

  const fetchServices = useCallback(
    async (page: number, append: boolean) => {
      if (!customerId) return
      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      const { data, error: qErr, count } = await supabase
        .from('service_bookings')
        .select(
          `id, created_at, scheduled_at, status, total_price, notes,
           mechanic_profiles!left ( id, profiles!inner ( full_name ) ),
           addresses!left ( line1, city )`,
          { count: 'exact' },
        )
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .range(from, to)
      if (qErr) throw qErr
      const rows: ServiceBookingLogEntry[] = (data ?? []).map((row) => {
        const r = row as {
          mechanic_profiles: { profiles: { full_name: string } | { full_name: string }[] | null } | { profiles: { full_name: string } | { full_name: string }[] | null }[] | null
          addresses: { line1: string; city: string } | { line1: string; city: string }[] | null
        }
        const mpRaw = r.mechanic_profiles
        const mp = Array.isArray(mpRaw) ? mpRaw[0] : mpRaw
        const profRaw = mp?.profiles ?? null
        const prof = Array.isArray(profRaw) ? profRaw[0] : profRaw
        const addrRaw = r.addresses
        const addr = Array.isArray(addrRaw) ? addrRaw[0] : addrRaw
        return {
          id: row.id,
          created_at: row.created_at,
          scheduled_at: row.scheduled_at,
          status: row.status,
          total_price: row.total_price,
          notes: row.notes,
          mechanic_name: prof?.full_name ?? null,
          address_line1: addr?.line1 ?? null,
          address_city: addr?.city ?? null,
        }
      })
      setServices((prev) => (append ? [...prev, ...rows] : rows))
      setServicesTotal(count ?? 0)
    },
    [customerId],
  )

  const refetch = useCallback(async () => {
    if (!customerId) {
      setRentals([])
      setServices([])
      setRentalsTotal(0)
      setServicesTotal(0)
      return
    }
    setLoading(true)
    setError(null)
    setRentalsPage(0)
    setServicesPage(0)
    try {
      await Promise.all([fetchRentals(0, false), fetchServices(0, false)])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions')
    } finally {
      setLoading(false)
    }
  }, [customerId, fetchRentals, fetchServices])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const loadMoreRentals = useCallback(async () => {
    const next = rentalsPage + 1
    setLoading(true)
    setError(null)
    try {
      await fetchRentals(next, true)
      setRentalsPage(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more rentals')
    } finally {
      setLoading(false)
    }
  }, [rentalsPage, fetchRentals])

  const loadMoreServices = useCallback(async () => {
    const next = servicesPage + 1
    setLoading(true)
    setError(null)
    try {
      await fetchServices(next, true)
      setServicesPage(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more services')
    } finally {
      setLoading(false)
    }
  }, [servicesPage, fetchServices])

  return {
    rentals,
    services,
    rentalsTotal,
    servicesTotal,
    loading,
    error,
    loadMoreRentals,
    loadMoreServices,
    hasMoreRentals: rentals.length < rentalsTotal,
    hasMoreServices: services.length < servicesTotal,
    refetch,
  }
}

// ── Support Tickets ───────────────────────────────────────────────
//
// Created by customers via the chatbot's structured form (create-ticket
// edge function) or the legacy free-text fallback in the chatbot
// function. Admin can view all tickets, update status, category, or
// priority. RLS grants admin full access.

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical'
export type TicketCategory = 'general' | 'rental' | 'billing' | 'bug' | 'mechanic' | 'other'

export interface SupportTicket {
  id: string
  tracking_number: string
  customer_id: string
  category: TicketCategory
  priority: TicketPriority
  subject: string
  description: string
  status: TicketStatus
  assigned_admin_id: string | null
  resolved_at: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
}

export type SupportTicketWithCustomer = SupportTicket & {
  profiles: { id: string; full_name: string; phone: string | null }[] | null
}

interface UseAdminTicketsResult {
  data: SupportTicketWithCustomer[] | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  updateField: <K extends 'status' | 'category' | 'priority'>(
    id: string,
    field: K,
    value: SupportTicket[K],
  ) => Promise<SupportTicket>
}

export function useAdminTickets(): UseAdminTicketsResult {
  const [data, setData] = useState<SupportTicketWithCustomer[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: result, error: queryError } = await supabase
        .from('support_tickets')
        .select(`
          id,
          tracking_number,
          customer_id,
          category,
          priority,
          subject,
          description,
          status,
          assigned_admin_id,
          resolved_at,
          closed_at,
          created_at,
          updated_at,
          profiles!support_tickets_customer_id_fkey (
            id,
            full_name,
            phone
          )
        `)
        .order('created_at', { ascending: false })

      if (queryError) throw queryError
      setData(result as unknown as SupportTicketWithCustomer[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch support tickets')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const updateField = async <K extends 'status' | 'category' | 'priority'>(
    id: string,
    field: K,
    value: SupportTicket[K],
  ): Promise<SupportTicket> => {
    const updates: Partial<SupportTicket> = { [field]: value }
    if (field === 'status') {
      if (value === 'resolved') updates.resolved_at = new Date().toISOString()
      if (value === 'closed') updates.closed_at = new Date().toISOString()
    }
    const { data: row, error: updateError } = await supabase
      .from('support_tickets')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (updateError) throw updateError
    await fetchData()
    return row as SupportTicket
  }

  return { data, loading, error, refetch: fetchData, updateField }
}

/**
 * useOpenTicketCount — cheap count of open/in-progress tickets for the
 * sidebar badge. head:true so it never pulls row data. Light polling keeps
 * the badge close to live without needing a realtime channel.
 */
export function useOpenTicketCount(): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    const fetchCount = async () => {
      const { count: c, error } = await supabase
        .from('support_tickets')
        .select('id', { count: 'exact', head: true })
        .in('status', ['open', 'in_progress'])
      if (!cancelled && !error && typeof c === 'number') setCount(c)
    }
    void fetchCount()

    const id = window.setInterval(fetchCount, 1_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  return count
}

// Statuses that mean the booking still needs admin attention. `completed`
// and `cancelled` are terminal and intentionally excluded.
const ACTIVE_BOOKING_STATUSES = [
  'pending',
  'confirmed',
  'assigned',
  'en_route',
  'in_progress',
] as const

/**
 * useAdminBookingsCount — combined active-bookings count (vehicle rentals
 * + mechanic services) for the Bookings nav badge. Two head-only counts
 * summed so neither table pulls row data. Light polling keeps the badge
 * close to live without needing realtime infra.
 */
export function useAdminBookingsCount(): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    const fetchCount = async () => {
      const [vehicles, services] = await Promise.all([
        supabase
          .from('vehicle_bookings')
          .select('id', { count: 'exact', head: true })
          .in('status', [...ACTIVE_BOOKING_STATUSES]),
        supabase
          .from('service_bookings')
          .select('id', { count: 'exact', head: true })
          .in('status', [...ACTIVE_BOOKING_STATUSES]),
      ])
      if (cancelled) return
      const v = vehicles.count ?? 0
      const s = services.count ?? 0
      setCount(v + s)
    }
    void fetchCount()

    const id = window.setInterval(fetchCount, 1_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  return count
}

// ── Ticket thread messages ────────────────────────────────────────
// Shared between the admin tickets panel and the customer chatbot.
// Polls every 30s so both sides see new messages without realtime infra.

export type TicketMessageAuthor = 'customer' | 'admin'

export interface SupportTicketMessage {
  id: string
  ticket_id: string
  author_id: string
  author_role: TicketMessageAuthor
  body: string
  created_at: string
}

export interface SupportTicketMessageWithAuthor extends SupportTicketMessage {
  profiles: { id: string; full_name: string } | null
}

interface UseTicketMessagesResult {
  data: SupportTicketMessageWithAuthor[] | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  send: (body: string) => Promise<SupportTicketMessage>
}

const TICKET_MESSAGE_POLL_MS = 1_000

/**
 * useTicketMessages — fetch the thread for one ticket. Receives new
 * messages in real time via the TicketRealtimeProvider (mounted at app
 * level, filtered by ticket_id). Polling at 30s remains as a safety net
 * for the case where the realtime channel drops or the page is restored
 * from a background tab.
 *
 * Returns null data while ticketId is null so the component can
 * short-circuit on hide.
 */
export function useTicketMessages(ticketId: string | null): UseTicketMessagesResult {
  const [data, setData] = useState<SupportTicketMessageWithAuthor[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchMessages = useCallback(async () => {
    if (!ticketId) {
      setData(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data: rows, error: qErr } = await supabase
        .from('support_ticket_messages')
        .select(`
          id, ticket_id, author_id, author_role, body, created_at,
          profiles!support_ticket_messages_author_id_fkey ( id, full_name )
        `)
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true })
      if (qErr) throw qErr
      setData(rows as unknown as SupportTicketMessageWithAuthor[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch messages')
    } finally {
      setLoading(false)
    }
  }, [ticketId])

  useEffect(() => {
    void fetchMessages()
    if (!ticketId) return
    const id = window.setInterval(() => { void fetchMessages() }, TICKET_MESSAGE_POLL_MS)
    return () => window.clearInterval(id)
  }, [fetchMessages, ticketId])

  // Realtime: when a new INSERT arrives for this ticket, append it in-place.
  // The realtime payload doesn't include the joined profile, so we look up
  // the author by id from the existing list (re-using the name we already
  // know). Unknown authors fall back to null and the renderer uses the
  // role label (Support / Customer). A full refetch is intentionally
  // avoided here so the new bubble appears with no flash.
  const realtimeHandler = useMemo(
    () => (ticketId ? (row: SupportTicketMessage) => {
      setData((prev) => {
        if (!prev) return prev
        if (prev.some((m) => m.id === row.id)) return prev
        const known = prev.find((m) => m.author_id === row.author_id)
        const enriched: SupportTicketMessageWithAuthor = {
          ...row,
          profiles: known?.profiles ?? null,
        }
        // Insert in created_at order so the rendered list stays sorted
        // even if the realtime event arrives out of band.
        const next = [...prev, enriched].sort((a, b) =>
          a.created_at.localeCompare(b.created_at),
        )
        return next
      })
    } : null),
    [ticketId],
  )
  useTicketRealtime(ticketId, realtimeHandler)

  const send = useCallback(
    async (body: string): Promise<SupportTicketMessage> => {
      if (!ticketId) throw new Error('No ticket selected')
      const trimmed = body.trim()
      if (trimmed.length < 1) throw new Error('Message cannot be empty')
      if (trimmed.length > 4000) throw new Error('Message is too long (max 4000 characters)')

      const { data: row, error: insertErr } = await supabase
        .from('support_ticket_messages')
        .insert({ ticket_id: ticketId, body: trimmed })
        .select('id, ticket_id, author_id, author_role, body, created_at')
        .single()
      if (insertErr) throw insertErr
      // The realtime echo will deliver this row on the channel and
      // append it. No explicit refetch needed.
      return row as SupportTicketMessage
    },
    [ticketId],
  )

  return { data, loading, error, refetch: fetchMessages, send }
}
