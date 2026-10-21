import { useWebsiteText } from "../../hooks/useWebsiteText"
import { MessageSquare, ArrowUpRight, Link2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { TicketThread } from './TicketThread'
interface Ticket { id: string; tracking_number: string; status: string; resolved_at: string | null; closed_at: string | null; booking_context: unknown }
export function BookingSupport({ bookingId, bookingType, admin = false }: { bookingId: string; bookingType: 'vehicle' | 'service'; admin?: boolean }) {
  const websiteText = useWebsiteText("Bookings")

  const [loading, setLoading] = useState(true)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [selected, setSelected] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('support_tickets').select('id,tracking_number,status,resolved_at,closed_at,booking_context').eq('booking_type', bookingType).eq('booking_id', bookingId).order('created_at', { ascending: false })
    if (loadError) setError('Support requests could not be loaded.'); else { setTickets(data ?? []); setError('') }
    setLoading(false)
  }, [bookingId, bookingType])
  useEffect(() => { void load() }, [load])
  const create = async () => {
    setBusy(true)
    const { data, error: createError } = await supabase.rpc('create_booking_support', { p_type: bookingType, p_booking: bookingId, p_description: description, p_parent: selected || null })
    if (createError) setError(createError.message); else { setSelected(data); setDescription(''); await load() }
    setBusy(false)
  }
  const reopen = async (id: string) => {
    setBusy(true)
    const { error: reopenError } = await supabase.rpc('reopen_customer_ticket', { p_ticket: id })
    if (reopenError) setError(reopenError.message); else await load()
    setBusy(false)
  }
  return <section className="account-panel booking-support"><div className="transaction-section-heading"><span className="transaction-icon"><MessageSquare size={20} strokeWidth={1.75} /></span><div><h3>{websiteText("Booking support")}</h3><p>{websiteText("Keep the conversation connected to your booking.")}</p></div></div>{error && <p role="alert">{error}</p>}
    <label>{websiteText("Conversation")}<select disabled={loading} value={selected} onChange={e => setSelected(e.target.value)}><option value="">{loading ? websiteText("Loading conversations...") : websiteText("Start a new conversation")}</option>{tickets.map(t => <option key={t.id} value={t.id}>{t.tracking_number} · {t.status}</option>)}</select></label>
    {selected && <TicketThread ticketId={selected} role={admin ? 'admin' : 'customer'} />}
    {!admin && tickets.filter(t => t.id === selected && ['resolved', 'closed'].includes(t.status)).map(t => <div key={t.id}>{Date.now() - Date.parse(t.resolved_at ?? t.closed_at ?? '') <= 7 * 86400000 ? <button type="button" disabled={busy} onClick={() => void reopen(t.id)}>{websiteText("Reopen the same unresolved issue")}</button> : <p>{websiteText("The 7-day reopening window ended. Submit a new linked ticket below.")}</p>}</div>)}
    {admin && tickets.filter(t => t.id === selected).map(t => <details key={t.id}><summary>{websiteText("Booking and payment context at submission")}</summary><pre>{JSON.stringify(t.booking_context, null, 2)}</pre></details>)}
    {!admin && <><label>{selected ? websiteText("New issue linked to selected ticket") : websiteText("Describe your issue")}<textarea rows={4} value={description} minLength={5} maxLength={4000} onChange={e => setDescription(e.target.value)} /></label><p className="transaction-helper"><Link2 size={15} aria-hidden="true" />{' '}{websiteText("Your booking reference and relevant payment history are included automatically.")}</p><button type="button" className="transaction-primary" disabled={busy || description.trim().length < 5} onClick={() => void create()}>{busy ? websiteText("Sending request...") : websiteText("Send request")}<ArrowUpRight size={16} aria-hidden="true" /></button></>}
  </section>
}
