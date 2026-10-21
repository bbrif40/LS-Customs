import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import type { ServiceCoverage } from '../../utils/serviceCoverage'
interface Hours { scheduled_open: string; scheduled_close: string; roadside_open: string; roadside_close: string }
export function ServiceSettings() {
  const [coverage, setCoverage] = useState<ServiceCoverage | null>(null)
  const [hours, setHours] = useState<Hours | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { void (async () => {
    const [c, h] = await Promise.all([supabase.from('service_coverage').select('center_lat,center_lng,radius_km,active').eq('id', true).single(), supabase.from('service_operating_hours').select('scheduled_open,scheduled_close,roadside_open,roadside_close').eq('id', true).single()])
    if (c.error || h.error) setMessage('Service settings could not be loaded.'); else { setCoverage(c.data); setHours(h.data) }
  })() }, [])
  const save = async (kind: 'coverage' | 'hours') => {
    setBusy(true); setMessage('')
    const result = kind === 'coverage' ? await supabase.from('service_coverage').update(coverage!).eq('id', true) : await supabase.from('service_operating_hours').update(hours!).eq('id', true)
    setMessage(result.error ? result.error.message : 'Settings saved.'); setBusy(false)
  }
  return <section className="account-panel"><h2>Service coverage and hours</h2><p>Coverage is measured from the map pin. Operating hours use Philippine time.</p>{message && <p role="status">{message}</p>}
    {coverage && <form onSubmit={e => { e.preventDefault(); void save('coverage') }}><fieldset disabled={busy}><legend>Service radius</legend><p>The initial 100 km radius from Manila reaches Bulacan and Cavite. Changing coverage requires customers to verify their pin again before checkout.</p>
      <label>Radius (km)<input required type="number" min="1" max="300" step="1" value={coverage.radius_km} onChange={e => setCoverage({ ...coverage, radius_km: Number(e.target.value) })} /></label>
      <label>Center latitude<input required type="number" min="-90" max="90" step="any" value={coverage.center_lat} onChange={e => setCoverage({ ...coverage, center_lat: Number(e.target.value) })} /></label>
      <label>Center longitude<input required type="number" min="-180" max="180" step="any" value={coverage.center_lng} onChange={e => setCoverage({ ...coverage, center_lng: Number(e.target.value) })} /></label>
      <label><input type="checkbox" checked={coverage.active} onChange={e => setCoverage({ ...coverage, active: e.target.checked })} />Accept new service requests</label><button type="submit">{busy ? 'Saving…' : 'Save coverage'}</button>
    </fieldset></form>}
    {hours && <form onSubmit={e => { e.preventDefault(); void save('hours') }}><fieldset disabled={busy}><legend>Daily operating hours</legend>{(Object.keys(hours) as (keyof Hours)[]).map(key => <label key={key}>{key.replace(/_/g, ' ')}<input required type="time" value={hours[key]} onChange={e => setHours({ ...hours, [key]: e.target.value })} /></label>)}<button type="submit">Save hours</button></fieldset></form>}
  </section>
}
