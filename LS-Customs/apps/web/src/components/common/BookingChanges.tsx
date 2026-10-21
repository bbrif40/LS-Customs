import { useWebsiteText } from "../../hooks/useWebsiteText"
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useTransactionTerms } from './TransactionTerms'
import { verifyServiceLocation } from '../../utils/serviceLocation'
import { LocationPicker } from './map'
interface Change { id: string; kind: string; state: string; amount: number; payload: { new_return?: string; new_schedule?: string; price_difference?: number; accepted_mechanic?: string; payment_deadline?: string; provider_initiated?: boolean }; review_reason: string | null }
export function BookingChanges({ bookingId, bookingType }: { bookingId: string; bookingType: 'vehicle' | 'service' }) {
  const websiteText = useWebsiteText("Bookings")

  const [changes, setChanges] = useState<Change[]>([])
  const [time, setTime] = useState('')
  const [locationOpen, setLocationOpen] = useState(false)
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const reviewTerms = useTransactionTerms()
  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('booking_requests').select('*').eq('booking_type', bookingType).eq('booking_id', bookingId).in('kind', ['extension', 'reschedule', 'location_change']).order('created_at', { ascending: false })
    if (loadError) setError('Booking changes could not be loaded.'); else setChanges(data ?? [])
  }, [bookingId, bookingType])
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 10000); return () => clearInterval(timer) }, [load])
  const action = async (work: () => Promise<void>) => { if (busy) return; setBusy(true); setError(''); try { await work(); await load() } catch (failure) { setError(failure instanceof Error ? failure.message : 'Booking change failed.') } finally { setBusy(false) } }
  const request = () => action(async () => {
    const id = crypto.randomUUID()
    if (!await reviewTerms(id, bookingType)) return
    const next = new Date(`${time}:00+08:00`).toISOString()
    const { error: requestError } = bookingType === 'vehicle'
      ? await supabase.rpc('request_rental_extension', { p_request: id, p_booking: bookingId, p_return_at: next })
      : await supabase.rpc('request_mechanic_reschedule', { p_request: id, p_booking: bookingId, p_schedule: next })
    if (requestError) throw requestError
    setTime('')
  })
  const confirm = (change: Change) => action(async () => {
    if (!await reviewTerms(change.id, 'payment')) return
    const { error: confirmError } = await supabase.rpc(change.kind === 'location_change' ? 'confirm_service_location_change' : 'confirm_mechanic_reschedule', { p_request: change.id })
    if (confirmError) throw confirmError
  })
  const declineProvider = (id: string) => action(async () => { const { error: declineError } = await supabase.rpc('decline_provider_reschedule', { p_request: id }); if (declineError) throw declineError })
  const requestLocation = () => action(async () => {
    if (!location) return
    const id = crypto.randomUUID()
    if (!await reviewTerms(id, 'service')) return
    const checked = await verifyServiceLocation(location.lat, location.lng)
    const { error: requestError } = await supabase.rpc('request_service_location_change', { p_request: id, p_booking: bookingId, p_check: checked })
    if (requestError) throw requestError
    setLocationOpen(false)
  })
  return <section className="account-panel"><h3>{bookingType === 'vehicle' ? websiteText("Rental extension") : websiteText("Reschedule appointment")}</h3>{error && <p role="alert">{error}</p>}
    <p>{websiteText("The original booking stays active until the change is secured and any required payment succeeds. Rental extensions cost one daily rate per started extra 24 hours.")}</p>
    <label>{bookingType === 'vehicle' ? websiteText("Requested return") : websiteText("Requested appointment")}{websiteText("(Philippine time)")}<input type="datetime-local" value={time} onChange={e => setTime(e.target.value)} /></label><button type="button" disabled={busy || !time || changes.some(c => ['pending', 'approved'].includes(c.state))} onClick={() => void request()}>{websiteText("Request change")}</button>
    {bookingType === 'service' && <><button type="button" onClick={() => setLocationOpen(!locationOpen)}>{websiteText("Request destination change")}</button>{locationOpen && <div><LocationPicker value={location} onChange={setLocation} /><p>{websiteText("Original destination stays fixed until admin approval, capacity checks and your acceptance of the new price.")}</p><button type="button" disabled={busy || !location || changes.some(c => ['pending', 'approved'].includes(c.state))} onClick={() => void requestLocation()}>{websiteText("Verify and request this destination")}</button></div>}</>}
    {changes.map(change => <article key={change.id}><p>{change.kind} · {change.state}{websiteText("· PHP")} {Number(change.amount).toFixed(2)}</p><p>{change.payload.new_return || change.payload.new_schedule} {change.review_reason}</p>{change.payload.price_difference !== undefined && <p>{websiteText("Price difference: PHP")} {Number(change.payload.price_difference).toFixed(2)}</p>}{change.payload.payment_deadline && <p>{websiteText("Complete before")} {new Date(change.payload.payment_deadline).toLocaleString()}</p>}
      {((change.kind === 'reschedule' && change.state === 'pending' && change.payload.accepted_mechanic) || (change.kind === 'location_change' && change.state === 'approved')) && <button type="button" disabled={busy} onClick={() => void confirm(change)}>{websiteText("Accept secured change and quoted price")}</button>}
      {change.payload.provider_initiated && ['pending', 'approved'].includes(change.state) && <button type="button" disabled={busy} onClick={() => void declineProvider(change.id)}>{websiteText("Decline provider time change · cancel for full refund")}</button>}
      {change.state === 'approved' && <p>{websiteText("Pay any required increase from")} <a href="/profile">{websiteText("Account balance")}</a>{' '}{websiteText("before the deadline. Cash changes update the accepted amount due.")}</p>}
    </article>)}
  </section>
}
