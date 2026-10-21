import { useWebsiteText } from "../../hooks/useWebsiteText"
import { ClipboardCheck, ImagePlus, FileText, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import { supabase } from '../../supabaseClient'
import { useTransactionTerms } from './TransactionTerms'

interface Report { id: string; version: number; kind: string; notes: string; parts_used: string | null; photos: string[]; created_at: string }
interface Quote { id: string; kind: string; state: string; amount: number; reason: string; response_deadline: string | null; review_reason: string | null; payload: { items?: { description: string; amount: number }[]; photos?: string[]; customer_reason?: string } }
export function BookingReports({ bookingId, bookingType, operator = 'customer', originalTotal }: { bookingId: string; bookingType: 'vehicle' | 'service'; operator?: 'customer' | 'admin' | 'mechanic'; originalTotal?: number }) {
  const websiteText = useWebsiteText("Bookings")

  const [loading, setLoading] = useState(true)
  const [reports, setReports] = useState<Report[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [kind, setKind] = useState(bookingType === 'vehicle' ? 'handover' : 'service')
  const [notes, setNotes] = useState('')
  const [parts, setParts] = useState('')
  const [items, setItems] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const reviewTerms = useTransactionTerms()
  const load = useCallback(async () => {
    const [reportResult, quoteResult] = await Promise.all([
      supabase.from('booking_reports').select('*').eq('booking_type', bookingType).eq('booking_id', bookingId).order('created_at', { ascending: false }),
      supabase.from('booking_requests').select('*').eq('booking_type', bookingType).eq('booking_id', bookingId).in('kind', ['damage', 'service_extra']).order('created_at', { ascending: false }),
    ])
    if (reportResult.error || quoteResult.error) setError('Reports could not be loaded. Please retry.')
    else { setReports(reportResult.data ?? []); setQuotes(quoteResult.data ?? []); setError('') }
    setLoading(false)
  }, [bookingId, bookingType])
  useEffect(() => { void load() }, [load])
  const action = async (work: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try { await work(); await load() }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Action could not be completed.') }
    finally { setBusy(false) }
  }
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []); event.target.value = ''
    await action(async () => {
      if (!files.length || photos.length + files.length > 20) throw new Error('Choose up to 20 photos.')
      const paths: string[] = []
      for (const file of files) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('Use JPEG, PNG or WebP photos no larger than 10 MB.')
        const path = `${bookingType}/${bookingId}/${crypto.randomUUID()}.${file.type.split('/')[1]}`
        const { error: uploadError } = await supabase.storage.from('booking-evidence').upload(path, file, { contentType: file.type })
        if (uploadError) throw uploadError
        paths.push(path)
      }
      setPhotos(previous => [...previous, ...paths])
    })
  }
  const preview = (path: string) => action(async () => {
    const { data, error: previewError } = await supabase.storage.from('booking-evidence').createSignedUrl(path, 120)
    if (previewError) throw previewError
    // Open only following this explicit preview action; never email evidence URLs.
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  })
  const save = () => action(async () => {
    const result = kind === 'damage' || kind === 'service_extra'
      ? await supabase.rpc('propose_booking_charge', { p_type: bookingType, p_booking: bookingId, p_kind: kind,
        p_items: items.split('\n').filter(line => line.trim()).map(line => { const [description, amount] = line.split('|'); return { description: description?.trim(), amount: Number(amount) } }), p_photos: photos, p_notes: notes })
      : await supabase.rpc('create_booking_report', { p_id: crypto.randomUUID(), p_type: bookingType, p_booking: bookingId, p_kind: kind, p_notes: notes, p_parts: parts, p_photos: photos })
    if (result.error) throw result.error
    setNotes(''); setItems(''); setParts(''); setPhotos([]); setMessage('Saved. Submitted reports are preserved as separate versions.')
  })
  const respond = (quote: Quote, accept: boolean) => action(async () => {
    if (accept && !await reviewTerms(quote.id, 'payment')) return
    const { error: responseError } = await supabase.rpc('respond_booking_quote', { p_request: quote.id, p_accept: accept, p_reason: notes || null, p_evidence: photos })
    if (responseError) throw responseError
    setMessage(accept ? 'Quote approved. Payment status is separate.' : 'Response saved.'); setNotes(''); setPhotos([])
  })
  const finalize = (quote: Quote, approve: boolean) => action(async () => {
    const { error: finalError } = await supabase.rpc('finalize_damage_charge', { p_request: quote.id, p_approve: approve, p_reason: notes })
    if (finalError) throw finalError
    setNotes(''); setMessage('Review saved.')
  })
  return <section className="account-panel booking-reports"><div className="transaction-section-heading"><span className="transaction-icon"><ClipboardCheck size={20} strokeWidth={1.75} /></span><div><h3>{websiteText("Condition, work reports and quotes")}</h3><p>{websiteText("Reports and approvals for this booking.")}</p></div></div>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {originalTotal !== undefined && <div className="booking-bill-summary"><div><span>{websiteText("Agreed booking")}</span><strong>{new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(originalTotal)}</strong></div><div><span>{websiteText("Approved extras")}</span><strong>{new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(quotes.filter(q => q.kind === 'service_extra' && q.state === 'approved').reduce((sum, q) => sum + Number(q.amount), 0))}</strong></div><p>{websiteText("Payment collection is shown separately.")}</p></div>}
    {loading && <div className="transaction-loading" role="status"><span /><span /><span className="sr-only">{websiteText("Loading reports")}</span></div>}
    {!loading && !error && !reports.length && !quotes.length && <div className="transaction-empty transaction-empty-compact"><FileText size={26} strokeWidth={1.5} aria-hidden="true" /><div><strong>{websiteText("No reports or quotes yet")}</strong><p>{websiteText("Condition reports, work updates and quotes will appear here when submitted.")}</p></div></div>}
    {reports.map(report => <article key={report.id}><h4>{report.kind}{websiteText("· Version")} {report.version} · {new Date(report.created_at).toLocaleString()}</h4><p>{report.notes}</p>{report.parts_used && <p>{websiteText("Parts:")} {report.parts_used}</p>}<div>{report.photos.map((path, i) => <button type="button" key={path} disabled={busy} onClick={() => void preview(path)}>{websiteText("View photo")} {i + 1}</button>)}</div>
      {operator === 'customer' && report.kind === 'handover' && <button type="button" disabled={busy} onClick={() => void action(async () => { const { error: ackError } = await supabase.rpc('acknowledge_handover_report', { p_report: report.id }); if (ackError) throw ackError; setMessage('Handover report version acknowledged.') })}>{websiteText("I reviewed this report; discrepancies have been resolved")}</button>}
    </article>)}
    {quotes.map(quote => <article className="account-panel" key={quote.id}><h4>{quote.kind.replace(/_/g, ' ')} · {quote.state}{websiteText("· PHP")} {Number(quote.amount).toFixed(2)}</h4><p>{quote.reason}</p><ul>{quote.payload.items?.map((item, i) => <li key={i}>{item.description}{websiteText(": PHP")} {Number(item.amount).toFixed(2)}</li>)}</ul>{quote.payload.photos?.map((path, i) => <button type="button" key={path} disabled={busy} onClick={() => void preview(path)}>{websiteText("View supporting photo")} {i + 1}</button>)}
      {quote.response_deadline && <p>{websiteText("Respond before")} {new Date(quote.response_deadline).toLocaleString()}</p>}{quote.payload.customer_reason && <p>{websiteText("Customer response:")} {quote.payload.customer_reason}</p>}{quote.review_reason && <p>{websiteText("Admin review:")} {quote.review_reason}</p>}
      {operator === 'customer' && quote.state === 'pending' && <div><button type="button" disabled={busy} onClick={() => void respond(quote, true)}>{websiteText("Approve this quote")}</button><button type="button" disabled={busy || notes.trim().length < 3} onClick={() => void respond(quote, false)}>{quote.kind === 'damage' ? websiteText("Dispute with notes / evidence below") : websiteText("Decline with reason below")}</button></div>}
      {operator === 'admin' && quote.kind === 'damage' && !['declined', 'finalized'].includes(quote.state) && <div><button type="button" disabled={busy || notes.trim().length < 3} onClick={() => void finalize(quote, true)}>{websiteText("Finalize damage charge after review")}</button><button type="button" disabled={busy || notes.trim().length < 3} onClick={() => void finalize(quote, false)}>{websiteText("Dismiss damage charge")}</button></div>}
    </article>)}
    {(operator !== 'customer' || quotes.some(quote => quote.state === 'pending')) && <fieldset disabled={busy}><legend>{operator === 'customer' ? websiteText("Response notes and evidence") : websiteText("Create report or quote")}</legend>
      {operator !== 'customer' && <label>{websiteText("Type")}<select value={kind} onChange={e => setKind(e.target.value)}>{bookingType === 'vehicle' ? <><option value="handover">{websiteText("Handover condition")}</option><option value="return">{websiteText("Return condition")}</option><option value="damage">{websiteText("Itemized damage proposal")}</option></> : <><option value="service">{websiteText("Service completion")}</option><option value="service_extra">{websiteText("Additional work quote")}</option></>}</select></label>}
      <label>{websiteText("Notes / response / review reason")}<textarea value={notes} maxLength={10000} onChange={e => setNotes(e.target.value)} /></label>
      {operator !== 'customer' && <><label>{websiteText("Parts used")}<textarea value={parts} onChange={e => setParts(e.target.value)} /></label>{['damage', 'service_extra'].includes(kind) && <label>{websiteText("One repair item per line: description | PHP amount")}<textarea value={items} onChange={e => setItems(e.target.value)} placeholder={websiteText("Replacement part | 500.00")} /></label>}</>}
      <label className="transaction-upload"><span><ImagePlus size={19} aria-hidden="true" />{' '}{websiteText("Evidence photos")}</span><input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={e => void upload(e)} /><small>{photos.length ? websiteText("{value1} photos attached", { value1: String(photos.length) }) : websiteText("JPEG, PNG or WebP. Up to 10 MB each.")}</small></label>
      {operator !== 'customer' && <button type="button" disabled={busy || photos.length === 0 || notes.trim().length < 3} onClick={() => void save()}>{websiteText("Save report / send quote")}</button>}
    </fieldset>}<div className="transaction-section-footer"><button type="button" className="transaction-quiet" disabled={busy} onClick={() => void load()}><RefreshCw size={14} />{' '}{websiteText("Refresh reports")}</button></div>
  </section>
}
