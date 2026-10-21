import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'

interface Refund { id: string; amount: number; state: string; provider_reference: string | null; failure_reason: string | null; payments: { provider: string; booking_id: string } }
export function RefundRecovery() {
  const [refunds, setRefunds] = useState<Refund[]>([])
  const [selected, setSelected] = useState('')
  const [reference, setReference] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = async () => {
    const { data, error: loadError } = await supabase.from('workflow_refunds').select('id,amount,state,provider_reference,failure_reason,payments(provider,booking_id)').neq('state', 'succeeded').order('created_at')
    if (loadError) setError(loadError.message); else setRefunds((data ?? []) as unknown as Refund[])
  }
  useEffect(() => { void load() }, [])
  const refund = refunds.find(item => item.id === selected)
  const recover = async () => {
    if (!refund || busy) return
    setBusy(true); setError('')
    const { error: recoveryError } = await supabase.rpc('recover_workflow_refund', { p_refund: refund.id,
      p_action: refund.payments.provider === 'cash' ? 'cash_paid' : 'poll_provider', p_reason: reason, p_reference: reference || null })
    if (recoveryError) setError(recoveryError.message); else { setSelected(''); setReason(''); setReference(''); await load() }
    setBusy(false)
  }
  return <section className="account-panel"><h2>Refund reconciliation</h2><p>Verify an online refund at the provider and supply its refund ID to resume status checks. For cash, record the actual repayment receipt. These actions retain the financial audit.</p>
    {error && <p role="alert">{error}</p>}
    <label>Unsettled refund<select value={selected} onChange={event => { setSelected(event.target.value); setReference('') }}><option value="">Select refund</option>{refunds.map(item => <option key={item.id} value={item.id}>{item.payments.booking_id.slice(0, 8)} · PHP {Number(item.amount).toFixed(2)} · {item.payments.provider} · {item.state}</option>)}</select></label>
    {refund && <><p>{refund.failure_reason ?? 'Awaiting settlement'}{refund.provider_reference && ` · Provider refund: ${refund.provider_reference}`}</p><label>{refund.payments.provider === 'cash' ? 'Cash repayment receipt' : 'Verified provider refund ID (existing ID is reused)'}<input value={reference} onChange={event => setReference(event.target.value)} /></label><label>Reconciliation reason<input value={reason} onChange={event => setReason(event.target.value)} /></label><button type="button" disabled={busy || reason.trim().length < 5 || (!refund.provider_reference && reference.trim().length < 3)} onClick={() => void recover()}>{refund.payments.provider === 'cash' ? 'Record cash returned to customer' : 'Resume provider status reconciliation'}</button></>}
    <button type="button" disabled={busy} onClick={() => void load()}>Refresh refunds</button>
  </section>
}
