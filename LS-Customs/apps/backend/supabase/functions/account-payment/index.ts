import { createServiceClient, createUserClient, extractJwt } from '../_shared/supabaseClient.ts'
import { getCorsHeaders, jsonResponse } from '../_shared/cors.ts'
import { createPaymentIntent, retrievePaymentIntent } from '../_shared/paymentProvider.ts'
import { validateCheckoutRedirect } from '../_shared/checkout.ts'

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(null, { code: 'METHOD', message: 'POST required' }, 405, req)
  try {
    const userClient = createUserClient(extractJwt(req))
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return jsonResponse(null, { code: 'AUTH', message: 'Sign in required' }, 401, req)
    const body = await req.json()
    if (typeof body.quote_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.quote_id))
      return jsonResponse(null, { code: 'INPUT', message: 'Invalid payment quote' }, 400, req)
    const admin = createServiceClient()
    const { data: quote, error } = await userClient.from('account_quotes').select('*').eq('id', body.quote_id).single()
    if (error || !quote || quote.customer_id !== user.id) return jsonResponse(null, { code: 'NOT_FOUND', message: 'Quote not found' }, 404, req)
    const { error: termsError } = await admin.rpc('require_transaction_terms', { p_transaction_id: quote.id, p_kind: 'balance', p_customer: user.id })
    if (termsError) return jsonResponse(null, { code: 'TERMS', message: 'Accept the payment terms first' }, 409, req)
    const { data: existing, error: existingError } = await admin.from('payments').select('*').eq('account_quote_id', quote.id).maybeSingle()
    if (existingError) throw existingError
    if (existing) {
      if (existing.status === 'succeeded') return jsonResponse(null, { code: 'PAID', message: 'Payment already received. Refresh your balance.' }, 409, req)
      if (existing.status === 'failed' && Date.parse(quote.expires_at) <= Date.now())
        return jsonResponse(null, { code: 'CHECKOUT_CLOSED', message: 'This checkout is closed. Refresh your balance before starting another payment.' }, 409, req)
      const recovered = await retrievePaymentIntent(existing.provider_reference, existing.provider)
      return jsonResponse({ ...recovered, payment_id: existing.id, provider: existing.provider, amount: Number(existing.amount), currency: existing.currency }, null, 200, req)
    }
    if (quote.settled_at || Date.parse(quote.expires_at) <= Date.now())
      return jsonResponse(null, { code: 'EXPIRED', message: 'Refresh the total before retrying payment' }, 409, req)
    const successUrl = validateCheckoutRedirect(body.success_url)
    const cancelUrl = validateCheckoutRedirect(body.cancel_url)
    const { data: source } = await admin.from('account_charges').select('booking_type,booking_id').eq('id', quote.allocations[0].charge_id).single()
    if (!source) throw new Error('Charge not found')
    const intent = await createPaymentIntent(source.booking_type, source.booking_id, user.id, Number(quote.amount), {
      description: 'LS Customs account balance', customerEmail: user.email,
      successUrl, cancelUrl, idempotencyKey: `account:${quote.id}`,
    })
    const { data: payment, error: paymentError } = await admin.from('payments').upsert({
      booking_type: source.booking_type, booking_id: source.booking_id, customer_id: user.id,
      account_quote_id: quote.id, amount: quote.amount, provider: intent.provider,
      provider_reference: intent.providerReference, status: 'pending', currency: 'PHP',
    }, { onConflict: 'account_quote_id', ignoreDuplicates: true }).select('id').maybeSingle()
    if (paymentError) throw paymentError
    const paymentId = payment?.id ?? (await admin.from('payments').select('id').eq('account_quote_id', quote.id).single()).data?.id
    if (!paymentId) throw new Error('Payment not recorded')
    const { error: sessionError } = await admin.from('payment_checkout_sessions').upsert({ payment_id: paymentId, client_secret: intent.clientSecret, checkout_url: intent.checkoutUrl })
    if (sessionError) throw sessionError
    return jsonResponse({ payment_id: paymentId, client_secret: intent.clientSecret, checkout_url: intent.checkoutUrl,
      provider: intent.provider, amount: intent.amount, currency: intent.currency }, null, 200, req)
  } catch (error) {
    console.error('Account checkout failed', error instanceof Error ? error.message : 'unknown error')
    return jsonResponse(null, { code: 'CHECKOUT', message: 'Payment could not be prepared. Please retry or contact support.' }, 502, req)
  }
})
