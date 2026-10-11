import { useEffect, useState } from 'react'
import { X, Activity, Star, Receipt, Bike } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { useDialog } from '../../hooks/useDialog'
import type { MechanicWithProfile } from '../../hooks/useAdminData'
import { RecordAuditTrail } from './RecordAuditTrail'
import { LoadingMessage } from '../common/LoadingMessage'
import { logRecordAction } from '../../services/auditLogger'

export type MechanicSection = 'activities' | 'reviews' | 'transactions' | 'motorcycle'
export const mechanicSections = [
  { id: 'activities' as const, label: 'Activities', icon: Activity },
  { id: 'reviews' as const, label: 'Ratings & reviews', icon: Star },
  { id: 'transactions' as const, label: 'Transactions', icon: Receipt },
  { id: 'motorcycle' as const, label: 'Motorcycle', icon: Bike },
]
interface MechanicRecord {
  id: string; created_at: string; customer_name: string | null; status?: string
  rating?: number; comment?: string | null; amount?: number; currency?: string
  booking_id?: string; provider_reference?: string | null
}

export function MechanicDetailsModal({ mechanic, initialSection, onClose, onSaved }: {
  mechanic: MechanicWithProfile; initialSection: MechanicSection; onClose: () => void; onSaved: () => Promise<void>
}) {
  const dialogRef = useDialog(onClose)
  const profile = Array.isArray(mechanic.profiles) ? mechanic.profiles[0] : mechanic.profiles
  const name = profile?.full_name || 'Mechanic'
  const [section, setSection] = useState(initialSection)
  const [page, setPage] = useState(0)
  const [retry, setRetry] = useState(0)
  const [records, setRecords] = useState<MechanicRecord[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [model, setModel] = useState(mechanic.motorcycle_model || '')
  const [plate, setPlate] = useState(mechanic.motorcycle_plate || '')
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  useEffect(() => {
    if (section === 'motorcycle') { setLoading(false); setError(false); return }
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 25000)
    let active = true
    setLoading(true); setError(false); setRecords([])
    void (async () => {
      try {
        const result = await supabase.rpc('get_admin_mechanic_records', { p_mechanic_id: mechanic.id, p_section: section, p_offset: page * 20 }).abortSignal(controller.signal)
        if (result.error) throw result.error
        if (!Array.isArray(result.data)) throw new Error('Invalid records')
        if (active) { setRecords(result.data.slice(0, 20)); setHasMore(result.data.length > 20) }
      } catch { if (active) setError(true) }
      finally { window.clearTimeout(timeout); if (active) setLoading(false) }
    })()
    return () => { active = false; controller.abort(); window.clearTimeout(timeout) }
  }, [mechanic.id, section, page, retry])

  async function saveMotorcycle(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setSaveMessage('')
    try {
      const updates = { motorcycle_model: model.trim() || null, motorcycle_plate: plate.trim().toUpperCase() || null }
      const { data, error: updateError } = await supabase.from('mechanic_profiles').update(updates).eq('id', mechanic.id).select('id').abortSignal(AbortSignal.timeout(25000)).single()
      if (updateError || !data) throw updateError || new Error('Not saved')
      await logRecordAction({ actionType: 'update', recordType: 'mechanic', recordId: mechanic.id, recordTitle: `${name} motorcycle`, details: { old_model: mechanic.motorcycle_model, old_plate: mechanic.motorcycle_plate, ...updates } })
      setSaveMessage('Motorcycle details saved.'); await onSaved()
    } catch { setSaveMessage('We couldn’t save the motorcycle details. Please try again.') }
    finally { setSaving(false) }
  }
  return <div className="admin-modal-overlay" onClick={onClose}>
    <div ref={dialogRef} className="admin-modal admin-user-details mechanic-details" role="dialog" aria-modal="true" aria-labelledby="mechanic-details-title" tabIndex={-1} onClick={event => event.stopPropagation()}>
      <div className="admin-modal-header"><div><h2 id="mechanic-details-title">{name}</h2><p>{profile?.phone || 'No phone listed'} · {mechanic.years_experience ?? '—'} years experience</p></div><button className="admin-modal-close" aria-label="Close mechanic details" onClick={onClose}><X size={20} /></button></div>
      <div className="admin-modal-body">
        <div className="mechanic-detail-tabs" role="group" aria-label="Mechanic information">{mechanicSections.map(item => <button key={item.id} type="button" aria-pressed={section === item.id} onClick={() => { setSection(item.id); setPage(0); setError(false); setLoading(item.id !== 'motorcycle') }}><item.icon size={16} />{item.label}</button>)}</div>
        <h3>{mechanicSections.find(item => item.id === section)?.label}</h3>
        {section === 'motorcycle' ? <form className="mechanic-motorcycle-form" onSubmit={saveMotorcycle}>
          <p>Record the motorcycle used for service visits.</p>
          <label>Make and model<input maxLength={100} value={model} onChange={event => setModel(event.target.value)} placeholder="e.g. Honda Click 125i" /></label>
          <label>Plate number<input maxLength={20} value={plate} onChange={event => setPlate(event.target.value)} placeholder="Enter registered plate number" /></label>
          <button type="submit" className="admin-modal-btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save motorcycle'}</button>
          {saving && <LoadingMessage label="Saving motorcycle details…" />}
          {saveMessage && <p role="status">{saveMessage}</p>}
        </form> : loading ? <LoadingMessage label={`Loading ${section === 'reviews' ? 'customer reviews' : section}…`} /> : error ? <div role="alert" className="custom-loading"><strong>We couldn’t load this information</strong><p>Your records haven’t been changed. Check your connection and try again.</p><button className="outline-button" onClick={() => setRetry(value => value + 1)}>Try again</button></div> : <>
          {section === 'reviews' && <p><Star size={16} /> {mechanic.rating_count ? `${Number(mechanic.rating_avg).toFixed(1)} / 5 · ${mechanic.rating_count} customer ratings` : 'No customer ratings yet'}</p>}
          {!records.length && <p className="muted">No {section === 'reviews' ? 'customer reviews' : section} recorded for this mechanic.</p>}
          <div className="mechanic-records">{records.map(record => <article key={record.id}>
            <div><strong>{record.customer_name || 'Customer'}</strong><time dateTime={record.created_at}>{new Date(record.created_at).toLocaleString()}</time></div>
            {section === 'reviews' ? <><strong>{record.rating} / 5 stars</strong><p>{record.comment || 'Customer left a rating without a written review.'}</p></> : section === 'transactions' ? <><strong>{new Intl.NumberFormat('en-PH', { style: 'currency', currency: record.currency || 'PHP' }).format(record.amount || 0)}</strong><p>{record.status} · {record.provider_reference || 'No payment reference'}</p><small>Booking: {record.booking_id}</small></> : <><p>Service booking · {record.status?.replace(/_/g, ' ')}</p><small>Booking: {record.id}</small></>}
          </article>)}</div>
          <div className="mechanic-detail-pagination"><button className="outline-button" disabled={!page} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page + 1}</span><button className="outline-button" disabled={!hasMore} onClick={() => setPage(value => value + 1)}>Next</button></div>
        </>}
        <RecordAuditTrail recordType="mechanic" recordId={mechanic.id} recordTitle={`Mechanic details: ${name}`} />
      </div>
    </div>
  </div>
}
