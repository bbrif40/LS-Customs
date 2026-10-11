import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useMechanicGps } from '../../hooks/useMechanicGps'
import { VirtualMechanicTracker } from '../common/VirtualMechanicTracker'

interface Assignment { id: string; status: string; scheduled_at: string; pin_lat: number | null; pin_lng: number | null }
export function MechanicDispatch({ userId }: { userId: string }) {
  const [jobs, setJobs] = useState<Assignment[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const job = jobs.find(item => item.id === selected)
  const travelling = job && ['assigned', 'en_route'].includes(job.status)
  const gps = useMechanicGps(travelling ? job.id : null, enabled)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data, error: loadError } = await supabase.from('service_bookings').select('id,status,scheduled_at,pin_lat,pin_lng').eq('mechanic_id', userId).in('status', ['assigned', 'en_route', 'in_progress']).order('scheduled_at')
      if (!cancelled) { setJobs(data ?? []); setError(loadError ? 'Assignments unavailable' : null) }
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
  return <section className="ls-card mechanic-dispatch"><h2>Mechanic dispatch</h2><p>Select your assigned job to share GPS and update its progress.</p>
    {error && <p role="alert">{error}</p>}
    <label>Active assignment<select value={selected ?? ''} onChange={event => { setEnabled(false); setSelected(event.target.value || null) }}><option value="">Select a job</option>{jobs.filter(item => item.status !== 'completed').map(item => <option key={item.id} value={item.id}>{new Date(item.scheduled_at).toLocaleString()} · {item.id.slice(0, 8)} · {item.status.replace(/_/g, ' ')}</option>)}</select></label>
    {job && <><p>Keep this screen open for GPS sharing. Background tracking is currently paused.</p><label><input type="checkbox" checked={enabled && !!travelling} disabled={!travelling} onChange={event => setEnabled(event.target.checked)} /> Share GPS for this job</label><p role="status">{gps.message}{gps.lastSent && ` · last sent ${new Date(gps.lastSent).toLocaleTimeString()}`}</p>
      {job.status !== 'completed' && <button type="button" disabled={updating} onClick={() => void advance()}>{job.status === 'assigned' ? 'Start travelling' : job.status === 'en_route' ? 'Confirm arrival and start service' : 'Complete service'}</button>}
      <VirtualMechanicTracker key={job.id} bookingId={job.id} status={job.status} customerLocation={job.pin_lat != null && job.pin_lng != null ? { lat: job.pin_lat, lng: job.pin_lng } : null} />
    </>}
    {!jobs.length && <p>No active assignments.</p>}
  </section>
}
