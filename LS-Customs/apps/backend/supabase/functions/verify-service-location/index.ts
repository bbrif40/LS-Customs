import { createUserClient, extractJwt } from '../_shared/supabaseClient.ts'
import { getCorsHeaders, jsonResponse } from '../_shared/cors.ts'

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(null, { code: 'METHOD', message: 'POST required' }, 405, req)
  try {
    const client = createUserClient(extractJwt(req))
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (authError || !user) return jsonResponse(null, { code: 'AUTH', message: 'Sign in required' }, 401, req)
    const { lat, lng } = await req.json()
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
      return jsonResponse(null, { code: 'LOCATION', message: 'Choose a valid map location' }, 400, req)
    const { data, error } = await client.rpc('verify_service_pin', { p_lat: lat, p_lng: lng })
    if (error) return jsonResponse(null, { code: 'COVERAGE', message: error.code === '22023' ? error.message : 'Coverage could not be checked. Please retry.' }, error.code === '22023' ? 409 : 503, req)
    return jsonResponse(data, null, 200, req)
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 401) return jsonResponse(null, { code: 'AUTH', message: 'Sign in required' }, 401, req)
    return jsonResponse(null, { code: 'LOCATION', message: 'Your location could not be checked. Keep your draft and try again.' }, 503, req)
  }
})
