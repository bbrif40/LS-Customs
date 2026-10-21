import { createServiceClient } from '../_shared/supabaseClient.ts'
import { createRefund, getProviderConfig } from '../_shared/paymentProvider.ts'
import { jsonResponse } from '../_shared/cors.ts'

/** Scheduled server-only work. Deployment must configure the private worker token. */
Deno.serve(async (req: Request): Promise<Response> => {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '')
  const expected = Deno.env.get('OPERATIONS_WORKER_TOKEN')
  if (!expected || !token || token !== expected) return jsonResponse(null, { code: 'AUTH', message: 'Worker authorization required' }, 401, req)
  if (req.method !== 'POST') return jsonResponse(null, { code: 'METHOD', message: 'POST required' }, 405, req)
  const admin = createServiceClient()
  try {
    const { error: maintenanceError } = await admin.rpc('run_account_maintenance')
    if (maintenanceError) throw maintenanceError
    const { data: refunds, error: refundError } = await admin.from('workflow_refunds').select('*,payments(provider,provider_reference)')
      .in('state', ['pending', 'processing']).order('created_at').limit(5)
    if (refundError) throw refundError
    for (const refund of refunds ?? []) {
      const { data: claimed, error: claimError } = await admin.rpc('claim_workflow_refund', { p_id: refund.id })
      if (claimError) throw claimError
      if (!claimed) continue
      try {
        const config = getProviderConfig()
        if (refund.payments.provider !== config.provider) throw new Error('Refund provider differs from current configuration; manual review required')
        let reference: string, status: string
        if (refund.provider_reference) {
          const url = config.provider === 'stripe' ? `${config.baseUrl}/refunds/${refund.provider_reference}` : `${config.baseUrl}/v1/refunds/${refund.provider_reference}`
          const response = await fetch(url, { headers: { Authorization: config.provider === 'stripe' ? `Bearer ${config.secretKey}` : `Basic ${btoa(`${config.secretKey}:`)}` }, signal: AbortSignal.timeout(8000) })
          if (!response.ok) throw new Error('Refund status retrieval failed; verify provider state before retrying')
          const body = await response.json()
          reference = refund.provider_reference; status = config.provider === 'stripe' ? body.status : body.data?.attributes?.status
        } else {
          if (refund.first_attempt_at && Date.now() - Date.parse(refund.first_attempt_at) > 23 * 3600000)
            throw new Error('Refund outcome unknown beyond provider idempotency window; manual reconciliation required')
          const result = await createRefund(refund.payments.provider_reference, Number(refund.amount), `refund:${refund.id}`)
          reference = result.refundReference; status = result.status ?? 'pending'
        }
        const state = status === 'succeeded' ? 'succeeded' : ['failed', 'canceled'].includes(status) ? 'failed' : 'processing'
        const { error: settleError } = await admin.rpc('settle_workflow_refund', { p_id: refund.id, p_reference: reference, p_state: state, p_failure: state === 'failed' ? 'Provider declined the refund' : null })
        if (settleError) throw settleError
      } catch (failure) {
        const reason = failure instanceof Error ? failure.message : 'Refund processing failed'
        const { error: failureError } = await admin.rpc('settle_workflow_refund', { p_id: refund.id, p_reference: refund.provider_reference, p_state: 'failed', p_failure: reason })
        if (failureError) console.error('Refund failure could not be recorded', failureError.message)
      }
    }
    // In-app delivery is the durable notification row. Email retries never roll back a decision.
    const { data: notifications, error: notificationError } = await admin.from('notifications').select('id,metadata,user_id,title,workflow_email_attempts')
      .eq('type', 'workflow_decision').is('workflow_email_delivered_at', null).lte('workflow_email_retry_at', new Date().toISOString()).order('workflow_email_retry_at').limit(5)
    if (notificationError) throw notificationError
    for (const notification of notifications ?? []) {
      const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/dispatch-notification`, {
        method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_id: notification.id }), signal: AbortSignal.timeout(8000),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.data?.channels?.includes('email')) {
        const attempts = notification.workflow_email_attempts + 1
        const { error: retryError } = await admin.from('notifications').update({ workflow_email_attempts: attempts,
          workflow_email_retry_at: new Date(Date.now() + Math.min(86400, 60 * 2 ** Math.min(attempts, 11)) * 1000).toISOString() }).eq('id', notification.id)
        if (retryError) throw retryError
        const { error: queueError } = await admin.from('operations_queue').upsert({ source_key: `email:${notification.id}`, kind: 'email_failed',
          customer_id: notification.user_id, title: `Email delivery needs attention: ${notification.title}`, details: { notification_id: notification.id } }, { onConflict: 'source_key' })
        if (queueError) throw queueError
      } else {
        const { error: deliveredError } = await admin.from('notifications').update({ workflow_email_delivered_at: new Date().toISOString() }).eq('id', notification.id)
        if (deliveredError) throw deliveredError
        const { error: closeError } = await admin.from('operations_queue').update({ closed_at: new Date().toISOString() }).eq('source_key', `email:${notification.id}`)
        if (closeError) throw closeError
      }
    }
    return jsonResponse({ processed: true }, null, 200, req)
  } catch (failure) {
    console.error('Operations worker failed', failure instanceof Error ? failure.message : 'unknown error')
    return jsonResponse(null, { code: 'WORKER', message: 'Operations processing failed; retry required' }, 500, req)
  }
})
