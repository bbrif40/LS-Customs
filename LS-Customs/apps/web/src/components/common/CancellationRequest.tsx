import { useWebsiteText } from "../../hooks/useWebsiteText"
import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'

interface CancellationQuote { allowed: boolean; refund_amount: number; refund_percentage: number; support_review: boolean; cash: boolean }
interface Request { id: string; state: string; reason: string; amount: number; review_reason: string | null }
export function CancellationRequest({ bookingId, bookingType }: { bookingId: string; bookingType: 'vehicle' | 'service' }) {
  const websiteText = useWebsiteText("Bookings")

  const [quote, setQuote] = useState<CancellationQuote | null>(null)
  const [refunds, setRefunds] = useState<{ id: string; state: string; amount: number }[]>([])
  const [requests, setRequests] = useState<Request[]>([])
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const load = () => { void Promise.all([
      supabase.rpc('cancellation_quote', { p_type: bookingType, p_booking: bookingId }),
      supabase.from('workflow_refunds').select('id,state,amount,payments!inner(booking_id,booking_type)').eq('payments.booking_id', bookingId).eq('payments.booking_type', bookingType),
      supabase.from('booking_requests').select('id,state,reason,amount,review_reason').eq('booking_type', bookingType).eq('booking_id', bookingId).eq('kind', 'cancellation').order('created_at', { ascending: false }),
    ]).then(([preview, refundResult, history]) => {
      if (!active) return
      if (preview.error || history.error || refundResult.error) setError('Cancellation details could not be loaded.')
      else { setQuote(preview.data); setRequests(history.data ?? []); setRefunds(refundResult.data ?? []) }
    }) }
    load(); const timer = window.setInterval(load, 15000)
    return () => { active = false; clearInterval(timer) }
  }, [bookingId, bookingType])
  const request = async () => {
    if (busy || !quote?.allowed) return
    setBusy(true); setError('')
    const { data, error: requestError } = await supabase.rpc('request_booking_cancellation', { p_type: bookingType, p_booking: bookingId, p_reason: reason })
    if (requestError) setError(requestError.message)
    else setRequests(previous => [data, ...previous.filter(item => item.id !== data.id)])
    setBusy(false)
  }
  return <section className="account-panel"><h3>{websiteText("Cancellation and refund")}</h3>
    {error && <p role="alert">{error}</p>}
    {refunds.map(refund => <p key={refund.id} role="status">{websiteText("Refund PHP")} {Number(refund.amount).toFixed(2)} · {refund.state === 'succeeded' ? websiteText("Confirmed repaid") : refund.state === 'failed' ? websiteText("Admin reconciliation required") : websiteText("Awaiting provider / cash repayment confirmation")}</p>)}
    {requests.map(r => <p key={r.id}>{r.state === 'pending' ? websiteText("Cancellation requested Â· booking remains active until approval") : r.state}{websiteText("Â· Proposed refund PHP")} {Number(r.amount).toFixed(2)}{r.review_reason && ` Â· ${r.review_reason}`}</p>)}
    {quote && !quote.allowed && <p>{websiteText("Customer cancellation is unavailable for this booking. Contact support.")}</p>}
    {quote?.allowed && !requests.some(r => ['pending', 'approved'].includes(r.state)) && <>
      <p>{quote.support_review ? websiteText("Work or handover has started. Support must review completed work and any refund.") : quote.cash && bookingType === 'service' ? websiteText("Cash mechanic cancellation is free before work starts.") : websiteText("Proposed refund: PHP {value1} ({value2}% of the amount paid), subject to admin approval.", { value1: String(Number(quote.refund_amount).toFixed(2)), value2: String(quote.refund_percentage) })}</p>
      <label>{websiteText("Reason")}<textarea value={reason} maxLength={2000} onChange={event => setReason(event.target.value)} /></label>
      <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => void request()}>{websiteText("Submit cancellation request")}</button>
    </>}
  </section>
}
