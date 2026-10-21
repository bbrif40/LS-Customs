import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useMechanicGps } from '../../hooks/useMechanicGps'
import { VirtualMechanicTracker } from '../common/VirtualMechanicTracker'
import { BookingReports } from '../common/BookingReports'
import { ServiceExtraCollections } from '../common/ServiceExtraCollections'

interface Assignment { id: string; status: string; scheduled_at: string; pin_lat: number | null; pin_lng: number | null }
interface Offer { id: string; booking_id: string; expires_at: string; scheduled_at: string; city: string; services: string }
interface ChangeOffer { id: string; request_id: string; expires_at: string; scheduled_at: string; city: string; services: string }
export function MechanicDispatch({ userId }: { userId: string }) {
  const [jobs, setJobs] = useState<Assignment[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const [offers, setOffers] = useState<Offer[]>([])
  const [changeOffers, setChangeOffers] = useState<ChangeOffer[]>([])
  const [issue, setIssue] = useState('')
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  const job = jobs.find(item => item.id === selected)
  const travelling = job?.status === 'en_route'
  const gps = useMechanicGps(travelling ? job.id : null, enabled)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data, error: loadError } = await supabase.from('service_bookings').select('id,status,scheduled_at,pin_lat,pin_lng').eq('mechanic_id', userId).in('status', ['assigned', 'en_route', 'in_progress', 'completed']).order('scheduled_at', { ascending: false }).limit(100)
      const { data: offered, error: offerError } = await supabase.rpc('get_open_mechanic_offers')
      if (!cancelled) {
        setOffers(offered?.offers ?? []); setChangeOffers(offered?.changes ?? []); setJobs(data ?? [])
        setError(loadError ? 'Assignments unavailable' : offerError ? 'Offers could not be loaded.' : null)
      }
    }
    void load()
    const channel = supabase.channel(`mechanic-jobs:${userId}:${crypto.randomUUID()}`).on('postgres_changes', { event: '*', schema: 'public', table: 'service_bookings', filter: `mechanic_id=eq.${userId}` }, () => void load()).subscribe()
    const poll = window.setInterval(() => void load(), 15_000)
    return () => { cancelled = true; clearInterval(poll); void supabase.removeChannel(channel) }
  }, [userId])
  const advance = async () => {
    if (!job || updating) return
    setUpdating(true)
    const next = job.status === 'assigned' ? 'en_route' : job.status === 'en_route' ? 'in_progress' : 'completed'
    const { data, error: updateError } = await supabase.from('service_bookings').update({ status: next }).eq('id', job.id).eq('mechanic_id', userId).eq('status', job.status).select('id').maybeSingle()
    if (updateError || !data) setError('Status could not be changed. Refresh your assignment.')
    else { setError(null); setJobs(items => items.map(item => item.id === job.id ? { ...item, status: next } : item)); if (next !== 'en_route') setEnabled(false) }
    setUpdating(false)
  }
  const respond = async (id: string, accept: boolean, change = false) => {
    setUpdating(true)
    const { error: responseError } = await supabase.rpc(change ? 'respond_mechanic_change_offer' : 'respond_mechanic_offer', { p_offer: id, p_accept: accept })
    if (responseError) setError(responseError.message); else { setOffers(items => items.filter(item => item.id !== id)); setChangeOffers(items => items.filter(item => item.id !== id)); setError(null) }
    setUpdating(false)
  }
  const collectCash = async () => {
    if (!job) return
    setUpdating(true)
    const { error: cashError } = await supabase.rpc('record_service_cash', { p_booking: job.id, p_request: crypto.randomUUID() })
    setError(cashError ? cashError.message : null); setUpdating(false)
  }
  const reportIssue = async () => {
    if (!job || updating) return
    setUpdating(true)
    const { error: issueError } = await supabase.rpc('report_blocked_service', { p_booking: job.id, p_reason: issue })
    setError(issueError ? issueError.message : null); if (!issueError) setIssue(''); setUpdating(false)
  }
  return <section className="ls-card mechanic-dispatch"><h2>Mechanic dispatch</h2><p>Select your assigned job to share GPS and update its progress.</p>
    {error && <p role="alert">{error}</p>}
    <h3>Job offers</h3>{offers.map(offer => <article key={offer.id}><p>Booking {offer.booking_id.slice(0, 8)} · {Math.max(0, Math.ceil((Date.parse(offer.expires_at) - now) / 1000))}s remaining</p><button type="button" disabled={updating || Date.parse(offer.expires_at) <= now} onClick={() => void respond(offer.id, true)}>Accept assignment</button><button type="button" disabled={updating} onClick={() => void respond(offer.id, false)}>Decline</button></article>)}
    <h3>Reschedule offers</h3>{changeOffers.map(offer => <article key={offer.id}><p>Request {offer.request_id.slice(0, 8)} · {Math.max(0, Math.ceil((Date.parse(offer.expires_at) - now) / 1000))}s remaining</p><button type="button" disabled={updating || Date.parse(offer.expires_at) <= now} onClick={() => void respond(offer.id, true, true)}>Accept replacement time</button><button type="button" disabled={updating} onClick={() => void respond(offer.id, false, true)}>Decline</button></article>)}
    <label>Assignment<select value={selected ?? ''} onChange={event => { setEnabled(false); setSelected(event.target.value || null) }}><option value="">Select a job</option>{jobs.map(item => <option key={item.id} value={item.id}>{new Date(item.scheduled_at).toLocaleString()} · {item.id.slice(0, 8)} · {item.status.replace(/_/g, ' ')}</option>)}</select></label>
    {job && <><p>The Android app shares GPS during travel with a persistent notification, including in the background. Browser tracking requires this screen to remain visible. Sharing stops at arrival or cancellation.</p><label><input type="checkbox" checked={enabled && !!travelling} disabled={!travelling} onChange={event => setEnabled(event.target.checked)} /> I allow trip GPS sharing with this customer while travelling</label><p role="status">{gps.message}{gps.lastSent && ` · last sent ${new Date(gps.lastSent).toLocaleTimeString()}`}</p>
      {job.status !== 'completed' && <button type="button" disabled={updating} onClick={() => void advance()}>{job.status === 'assigned' ? 'Start travelling' : job.status === 'en_route' ? 'Confirm arrival and start service' : 'Complete service'}</button>}
      {job.status !== 'completed' && <div><label>Original work cannot proceed<textarea value={issue} onChange={event => setIssue(event.target.value)} maxLength={2000} /></label><button type="button" disabled={updating || issue.trim().length < 5} onClick={() => void reportIssue()}>Escalate to support without unapproved charges</button></div>}
      <VirtualMechanicTracker key={job.id} bookingId={job.id} status={job.status} customerLocation={job.pin_lat != null && job.pin_lng != null ? { lat: job.pin_lat, lng: job.pin_lng } : null} />
    </>}
    {!jobs.length && <p>No active assignments.</p>}
    {job?.status === 'completed' && <button type="button" disabled={updating} onClick={() => void collectCash()}>Record cash collected after service</button>}
    {job?.status === 'completed' && <ServiceExtraCollections key={`cash:${job.id}`} bookingId={job.id} />}
    {job && <BookingReports key={job.id} bookingId={job.id} bookingType="service" operator="mechanic" />}
  </section>
}
