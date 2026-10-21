import { createUserClient, extractJwt, createServiceClient } from '../_shared/supabaseClient.ts'
import { getCorsHeaders, jsonResponse } from '../_shared/cors.ts'
import { routeRequest, parseTrackingRoute } from '../_shared/trackingRoute.ts'
import { distanceBetween, type JourneyPoint } from '../_shared/virtualJourney.ts'

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
    const { data: booking, error } = await client.from('service_bookings').select('id,status,mechanic_id,pin_lat,pin_lng,address_id,confirmed_lat,confirmed_lng').eq('id', bookingId).single()
    if (error || !booking || booking.status !== 'en_route' || !booking.mechanic_id)
      return jsonResponse(null, { code: 'UNAVAILABLE', message: 'No active tracking data' }, 403, req)
    const validPoint = (lat: unknown, lng: unknown) => typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    const { data: fix } = await client.from('booking_locations').select('mechanic_id,lat,lng,recorded_at').eq('booking_id', bookingId).maybeSingle()
    const fixAge = Date.now() - Date.parse(fix?.recorded_at || '')
    if (!fix || fix.mechanic_id !== booking.mechanic_id || !validPoint(fix.lat, fix.lng) || fixAge > 60_000 || fixAge < -5000)
      return jsonResponse(null, { code: 'GPS_UNAVAILABLE', message: 'Live location unavailable' }, 409, req)
    let destination: JourneyPoint = [booking.confirmed_lng ?? booking.pin_lng, booking.confirmed_lat ?? booking.pin_lat]
    if (booking.address_id && !validPoint(destination[1], destination[0])) {
      const { data: address } = await supabaseAdmin.from('addresses').select('lat,lng').eq('id', booking.address_id).single()
      if (address) destination = [address.lng, address.lat]
    }
    if (!validPoint(destination[1], destination[0])) return jsonResponse(null, { code: 'LOCATION', message: 'Confirmed booking location unavailable' }, 409, req)
    const origin: JourneyPoint = [fix.lng, fix.lat]
    const { data: cache } = await supabaseAdmin.from('booking_route_cache').select('route').eq('booking_id', bookingId).maybeSingle()
    const previous = cache?.route
    const sameJourney = previous?.mode === 'gps' && previous.mechanicId === booking.mechanic_id
    const trafficModel = Deno.env.get('GEOAPIFY_API_KEY') ? 'approximated' : 'none'
    if (sameJourney && Date.now() - Date.parse(previous.calculatedAt) < 25_000
      && distanceBetween([previous.originLng, previous.originLat], origin) < 50
      && distanceBetween([previous.destinationLng, previous.destinationLat], destination) < 10)
      return jsonResponse(previous, null, 200, req)
    const endpoint = Deno.env.get('OSRM_BASE_URL')
    const geoapifyKey = Deno.env.get('GEOAPIFY_API_KEY')
    if (!endpoint && !geoapifyKey) return jsonResponse(null, { code: 'CONFIG', message: 'Arrival estimates are not configured' }, 503, req)
    const { data: claimed, error: claimError } = await supabaseAdmin.rpc('claim_booking_route', { p_booking_id: bookingId })
    if (claimError) throw claimError
    if (!claimed) {
      return jsonResponse(null, { code: 'RETRY', message: 'Route calculation pending' }, 429, req)
    }
    const request = routeRequest({ geoapifyKey, osrmBase: endpoint, osrmKey: Deno.env.get('OSRM_API_KEY'), mode: Deno.env.get('ROUTING_MODE') }, origin, destination)
    const response = await fetch(request.url, { signal: AbortSignal.timeout(8000), headers: request.headers })
    if (!response.ok) throw new Error('Routing failed')
    const body = await response.json()
    const route = parseTrackingRoute(body, request.provider)
    // Recheck after the provider call so a cancelled/reassigned dispatch
    // cannot recreate its cache after the lifecycle trigger cleared it.
    const { data: current } = await client.from('service_bookings').select('status,mechanic_id').eq('id', bookingId).single()
    if (!current || current.status !== 'en_route' || current.mechanic_id !== booking.mechanic_id)
      return jsonResponse(null, { code: 'UNAVAILABLE', message: 'Dispatch ended' }, 409, req)
    const result = { ...route, trafficModel, mode: 'gps', originLat: origin[1], originLng: origin[0],
      calculatedAt: new Date().toISOString(), mechanicId: booking.mechanic_id, destinationLat: destination[1], destinationLng: destination[0], destinationSource: 'saved' }
    const { data: saved, error: saveError } = await supabaseAdmin.from('booking_route_cache').update({ route: result }).eq('booking_id', bookingId).select('booking_id').maybeSingle()
    if (saveError || !saved) throw new Error('Route could not be saved')
    return jsonResponse(result, null, 200, req)
  } catch {
    return jsonResponse(null, { code: 'ROUTE_UNAVAILABLE', message: 'Arrival estimate unavailable. Please try again.' }, 503, req)
  }
})
