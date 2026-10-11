import { createUserClient, extractJwt, createServiceClient } from '../_shared/supabaseClient.ts'
import { getCorsHeaders, jsonResponse } from '../_shared/cors.ts'
import { routeRequest, parseTrackingRoute } from '../_shared/trackingRoute.ts'
import { distanceBetween, virtualJourney, type JourneyPoint } from '../_shared/virtualJourney.ts'

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
    const { data: booking, error } = await client.from('service_bookings').select('id,status,mechanic_id,pin_lat,pin_lng,current_lat,current_lng,location_updated_at').eq('id', bookingId).single()
    if (error || !booking || booking.status !== 'en_route' || !booking.mechanic_id)
      return jsonResponse(null, { code: 'UNAVAILABLE', message: 'No active tracking data' }, 403, req)
    const validPoint = (lat: unknown, lng: unknown) => typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    const liveAge = Date.now() - Date.parse(booking.location_updated_at || '')
    const live = validPoint(booking.current_lat, booking.current_lng) && liveAge >= -5000 && liveAge <= 90_000
    const destination: JourneyPoint = live ? [booking.current_lng, booking.current_lat] : [booking.pin_lng, booking.pin_lat]
    if (!validPoint(destination[1], destination[0])) return jsonResponse(null, { code: 'LOCATION', message: 'Set a customer location to start the virtual journey' }, 409, req)
    const { data: cache } = await supabaseAdmin.from('booking_route_cache').select('route').eq('booking_id', bookingId).maybeSingle()
    const previous = cache?.route
    const sameJourney = previous?.mode === 'virtual' && previous.mechanicId === booking.mechanic_id
    if (sameJourney && distanceBetween([previous.destinationLng, previous.destinationLat], destination) < 100)
      return jsonResponse({ ...previous, serverTime: new Date().toISOString() }, null, 200, req)
    const endpoint = Deno.env.get('OSRM_BASE_URL')
    const geoapifyKey = Deno.env.get('GEOAPIFY_API_KEY')
    if (!endpoint && !geoapifyKey) return jsonResponse(null, { code: 'CONFIG', message: 'Arrival estimates are not configured' }, 503, req)
    const { data: claimed, error: claimError } = await supabaseAdmin.rpc('claim_booking_route', { p_booking_id: bookingId })
    if (claimError) throw claimError
    if (!claimed) {
      return jsonResponse(null, { code: 'RETRY', message: 'Route calculation pending' }, 429, req)
    }
    const { data: mechanic } = await supabaseAdmin.from('mechanic_profiles').select('current_lat,current_lng').eq('id', booking.mechanic_id).maybeSingle()
    // A virtual dispatch starts at the mechanic's configured location, or a
    // nearby virtual origin if there is no usable location in this area.
    let origin: JourneyPoint = [destination[0] - 0.02, destination[1] + (destination[1] > 89 ? -0.01 : 0.01)]
    origin[0] = ((origin[0] + 540) % 360) - 180
    if (sameJourney) origin = virtualJourney(previous.geometry.coordinates, previous.durationSeconds, previous.startedAt, Date.now()).position
    else if (mechanic && validPoint(mechanic.current_lat, mechanic.current_lng)) {
      const configured: JourneyPoint = [mechanic.current_lng, mechanic.current_lat]
      const distance = distanceBetween(configured, destination)
      if (distance > 100 && distance < 50_000) origin = configured
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
    const result = { ...route, mode: 'virtual', startedAt: new Date().toISOString(),
      calculatedAt: new Date().toISOString(), mechanicId: booking.mechanic_id, destinationLat: destination[1], destinationLng: destination[0], destinationSource: live ? 'live' : 'saved' }
    const { data: saved, error: saveError } = await supabaseAdmin.from('booking_route_cache').update({ route: result }).eq('booking_id', bookingId).select('booking_id').maybeSingle()
    if (saveError || !saved) throw new Error('Journey could not be saved')
    return jsonResponse({ ...result, serverTime: new Date().toISOString() }, null, 200, req)
  } catch {
    return jsonResponse(null, { code: 'ROUTE_UNAVAILABLE', message: 'Arrival estimate unavailable. Please try again.' }, 503, req)
  }
})
