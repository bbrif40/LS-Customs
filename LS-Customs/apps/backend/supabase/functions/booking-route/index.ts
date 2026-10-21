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
    const ownFix = !!fix && fix.mechanic_id === booking.mechanic_id && validPoint(fix.lat, fix.lng)
    // Fresh mechanic GPS always wins; without it the customer sees a labelled simulated journey.
    const live = ownFix && fixAge <= 60_000 && fixAge >= -5000
    let destination: JourneyPoint = [booking.confirmed_lng ?? booking.pin_lng, booking.confirmed_lat ?? booking.pin_lat]
    if (booking.address_id && !validPoint(destination[1], destination[0])) {
      const { data: address } = await supabaseAdmin.from('addresses').select('lat,lng').eq('id', booking.address_id).single()
      if (address) destination = [address.lng, address.lat]
    }
    if (!validPoint(destination[1], destination[0])) return jsonResponse(null, { code: 'LOCATION', message: 'Confirmed booking location unavailable' }, 409, req)
    const { data: cache } = await supabaseAdmin.from('booking_route_cache').select('route').eq('booking_id', bookingId).maybeSingle()
    const previous = cache?.route
    const mode = live ? 'gps' : 'virtual'
    const sameJourney = previous?.mode === mode && previous.mechanicId === booking.mechanic_id
      && distanceBetween([previous.destinationLng, previous.destinationLat], destination) < 10
    const trafficModel = Deno.env.get('GEOAPIFY_API_KEY') ? 'approximated' : 'none'
    if (live && sameJourney && Date.now() - Date.parse(previous.calculatedAt) < 25_000
      && distanceBetween([previous.originLng, previous.originLat], [fix.lng, fix.lat]) < 50)
      return jsonResponse(previous, null, 200, req)
    // A simulated journey keeps its clock: re-polling returns the same journey until it ends.
    if (!live && sameJourney) return jsonResponse({ ...previous, serverTime: new Date().toISOString() }, null, 200, req)
    const endpoint = Deno.env.get('OSRM_BASE_URL')
    const geoapifyKey = Deno.env.get('GEOAPIFY_API_KEY')
    if (!endpoint && !geoapifyKey) return jsonResponse(null, { code: 'CONFIG', message: 'Arrival estimates are not configured' }, 503, req)
    const { data: claimed, error: claimError } = await supabaseAdmin.rpc('claim_booking_route', { p_booking_id: bookingId })
    if (claimError) throw claimError
    if (!claimed) {
      return jsonResponse(null, { code: 'RETRY', message: 'Route calculation pending' }, 429, req)
    }
    let origin: JourneyPoint
    if (live) origin = [fix.lng, fix.lat]
    else {
      // Simulated start: last GPS fix, else the mechanic's saved location, else a point ~2 km away.
      const { data: mechanic } = await supabaseAdmin.from('mechanic_profiles').select('current_lat,current_lng').eq('id', booking.mechanic_id).maybeSingle()
      const candidates: JourneyPoint[] = [
        ...(ownFix ? [[fix.lng, fix.lat] as JourneyPoint] : []),
        ...(mechanic && validPoint(mechanic.current_lat, mechanic.current_lng) ? [[mechanic.current_lng, mechanic.current_lat] as JourneyPoint] : []),
      ]
      origin = candidates.find(point => { const distance = distanceBetween(point, destination); return distance > 100 && distance < 50_000 })
        ?? [((destination[0] - 0.02 + 540) % 360) - 180, destination[1] + (destination[1] > 89 ? -0.01 : 0.01)]
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
    const now = new Date().toISOString()
    const result = { ...route, trafficModel, mode, originLat: origin[1], originLng: origin[0], calculatedAt: now,
      ...(live ? {} : { startedAt: now }),
      mechanicId: booking.mechanic_id, destinationLat: destination[1], destinationLng: destination[0], destinationSource: 'saved' }
    const { data: saved, error: saveError } = await supabaseAdmin.from('booking_route_cache').update({ route: result }).eq('booking_id', bookingId).select('booking_id').maybeSingle()
    if (saveError || !saved) throw new Error('Route could not be saved')
    return jsonResponse(live ? result : { ...result, serverTime: now }, null, 200, req)
  } catch {
    return jsonResponse(null, { code: 'ROUTE_UNAVAILABLE', message: 'Arrival estimate unavailable. Please try again.' }, 503, req)
  }
})
