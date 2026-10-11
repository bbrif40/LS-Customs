import { createUserClient, extractJwt, createServiceClient } from '../_shared/supabaseClient.ts'
import { getCorsHeaders, jsonResponse } from '../_shared/cors.ts'
import { routeRequest, parseTrackingRoute } from '../_shared/trackingRoute.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(null, { code: 'METHOD', message: 'POST required' }, 405, req)
  if (!req.headers.get('authorization')?.startsWith('Bearer ')) return jsonResponse(null, { code: 'AUTH', message: 'Sign in required' }, 401, req)
  try {
    const client = createUserClient(extractJwt(req))
    const supabaseAdmin = createServiceClient()
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (authError || !user) return jsonResponse(null, { code: 'AUTH', message: 'Sign in required' }, 401, req)
    const { bookingId } = await req.json()
    if (typeof bookingId !== 'string' || !/^[0-9a-f-]{36}$/i.test(bookingId)) return jsonResponse(null, { code: 'INPUT', message: 'Invalid booking' }, 400, req)
    const { data: booking, error } = await client.from('service_bookings').select('id,status,mechanic_id,pin_lat,pin_lng').eq('id', bookingId).single()
    const { data: fix } = await client.from('booking_locations').select('*').eq('booking_id', bookingId).maybeSingle()
    if (error || !booking || booking.status !== 'en_route' || !fix || fix.mechanic_id !== booking.mechanic_id)
      return jsonResponse(null, { code: 'UNAVAILABLE', message: 'No active tracking data' }, 403, req)
    if (Date.now() - Date.parse(fix.recorded_at) > 30_000 || booking.pin_lat == null || booking.pin_lng == null)
      return jsonResponse(null, { code: 'STALE', message: 'Waiting for a fresh GPS fix' }, 409, req)
    const endpoint = Deno.env.get('OSRM_BASE_URL')
    const geoapifyKey = Deno.env.get('GEOAPIFY_API_KEY')
    if (!endpoint && !geoapifyKey) return jsonResponse(null, { code: 'CONFIG', message: 'Arrival estimates are not configured' }, 503, req)
    const { data: claimed, error: claimError } = await supabaseAdmin.rpc('claim_booking_route', { p_booking_id: bookingId })
    if (claimError) throw claimError
    if (!claimed) {
      const { data: cache } = await supabaseAdmin.from('booking_route_cache').select('route').eq('booking_id', bookingId).single()
      const route = cache?.route
      if (route && route.mechanicId === booking.mechanic_id && route.destinationLat === booking.pin_lat && route.destinationLng === booking.pin_lng && Date.now()-Date.parse(route.calculatedAt)<60_000)
        return jsonResponse(route, null, 200, req)
      return jsonResponse(null, { code: 'RETRY', message: 'Route calculation pending' }, 429, req)
    }
    const request = routeRequest({ geoapifyKey, osrmBase: endpoint, osrmKey: Deno.env.get('OSRM_API_KEY'), mode: Deno.env.get('ROUTING_MODE') }, [fix.lng, fix.lat], [booking.pin_lng, booking.pin_lat])
    const response = await fetch(request.url, { signal: AbortSignal.timeout(8000), headers: request.headers })
    if (!response.ok) throw new Error('Routing failed')
    const body = await response.json()
    const route = parseTrackingRoute(body, request.provider)
    const result = { ...route,
      calculatedAt: new Date().toISOString(), mechanicId: booking.mechanic_id, destinationLat: booking.pin_lat, destinationLng: booking.pin_lng }
    await supabaseAdmin.from('booking_route_cache').update({ route: result }).eq('booking_id', bookingId)
    return jsonResponse(result, null, 200, req)
  } catch {
    return jsonResponse(null, { code: 'ROUTE_UNAVAILABLE', message: 'Arrival estimate unavailable. Please try again.' }, 503, req)
  }
})
