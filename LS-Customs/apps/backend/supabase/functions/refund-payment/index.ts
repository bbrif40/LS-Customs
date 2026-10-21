import { createUserClient, extractJwt } from '../_shared/supabaseClient.ts'
import { getCorsHeaders, jsonResponse } from '../_shared/cors.ts'

// Queuing and settlement are separate: never claim a provider-pending refund is paid.
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(null, { code: 'METHOD', message: 'POST required' }, 405, req)
  try {
    const client = createUserClient(extractJwt(req))
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (authError || !user) return jsonResponse(null, { code: 'AUTH', message: 'Sign in required' }, 401, req)
    const { payment_id, reason } = await req.json()
    if (typeof payment_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(payment_id) || typeof reason !== 'string' || reason.trim().length < 3)
      return jsonResponse(null, { code: 'INPUT', message: 'A payment reference and refund reason are required' }, 400, req)
    const { data, error } = await client.rpc('queue_admin_refund', { p_payment: payment_id, p_reason: reason.trim() })
    if (error) return jsonResponse(null, { code: 'REFUND', message: 'Refund could not be queued. Verify admin access and the payment state.' }, 409, req)
    return jsonResponse({ refund_id: data.id, amount: Number(data.amount), status: data.state }, null, 202, req)
  } catch (error) {
    console.error('Refund request failed', error instanceof Error ? error.message : 'unknown error')
    return jsonResponse(null, { code: 'REFUND', message: 'Refund request could not be processed' }, 500, req)
  }
})
