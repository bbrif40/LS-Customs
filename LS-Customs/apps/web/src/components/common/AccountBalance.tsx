import { useWebsiteText } from "../../hooks/useWebsiteText"
import { Wallet, CheckCircle2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { supabase } from '../../supabaseClient'
import { PaymentForm } from './PaymentForm'
import { usePaymentStatus } from '../../hooks/usePaymentStatus'
import { useTransactionTerms } from './TransactionTerms'
import { requireFunctionData } from '../../utils/functionResult'

interface Charge { id: string; customer_id: string; booking_id: string; booking_type: string; kind: string; description: string; amount: number; paid: number; waived: number; due_at: string | null; blocks_rentals: boolean }
interface AccountEvent { id: string; kind: string; amount: number; reason: string; created_at: string; actor_id: string | null; reverses_event_id: string | null }
interface Intent { payment_id: string; client_secret: string; checkout_url?: string; provider: string; amount: number; currency: string }
const money = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value)
const remainder = (c: Charge) => Math.round((Number(c.amount) - Number(c.paid) - Number(c.waived)) * 100) / 100
const quoteIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function accountPaymentReturnUrl(result: 'success' | 'cancelled', quoteId: string) {
  const origin = Capacitor.isNativePlatform() ? 'https://ls-customs-web.vercel.app' : window.location.origin
  const url = new URL('/profile', origin)
  url.searchParams.set('account_payment', result)
  url.searchParams.set('quote_id', quoteId)
  return url.href
}

export function AccountBalance({ customerId, admin = false }: { customerId?: string; admin?: boolean }) {
  const websiteText = useWebsiteText("Profile")

  const [flaggedAt, setFlaggedAt] = useState<string | null>(null)
  const [charges, setCharges] = useState<Charge[]>([])
  const [events, setEvents] = useState<AccountEvent[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [intent, setIntent] = useState<Intent | null>(null)
  const [returnPaymentId, setReturnPaymentId] = useState<string | null>(null)
  const [paymentNotice, setPaymentNotice] = useState('')
  const [quoteExpires, setQuoteExpires] = useState<string | null>(null)
  const [quoteId, setQuoteId] = useState<string | null>(null)
  const { status: payment } = usePaymentStatus(intent?.payment_id ?? returnPaymentId)
  const reviewTerms = useTransactionTerms()
  const load = useCallback(async () => {
    if (!admin && !customerId) { setLoading(false); return }
    try {
      if (customerId) {
        const { error: refreshError } = await supabase.rpc('refresh_customer_account', { p_customer: customerId })
        if (refreshError) throw refreshError
      }
      let query = supabase.from('account_charges').select('*').order('posted_at', { ascending: false })
      let history = supabase.from('account_events').select('id,kind,amount,reason,created_at,actor_id,reverses_event_id').order('created_at', { ascending: false }).limit(200)
      if (customerId) { query = query.eq('customer_id', customerId); history = history.eq('customer_id', customerId) }
      const [chargeResult, eventResult] = await Promise.all([query, history])
      if (chargeResult.error) throw chargeResult.error
      if (eventResult.error) throw eventResult.error
      setCharges(chargeResult.data ?? []); setEvents(eventResult.data ?? []); setError('')
      if (customerId) {
        const { data: flag, error: flagError } = await supabase.from('account_flags').select('flagged_at').eq('customer_id', customerId).maybeSingle()
        if (flagError) throw flagError
        setFlaggedAt(flag?.flagged_at ?? null)
      }
      if (customerId && !admin) {
        const { data: activeQuote, error: activeError } = await supabase.from('account_quotes').select('id,expires_at').eq('customer_id', customerId).is('settled_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (activeError) throw activeError
        setQuoteId(activeQuote?.id ?? null); setQuoteExpires(activeQuote?.expires_at ?? null)
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Balance could not be loaded. Please retry.') }
    finally { setLoading(false) }
  }, [customerId, admin])
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 30000); return () => clearInterval(timer) }, [load])
  useEffect(() => {
    if (!customerId || admin) return
    const url = new URL(window.location.href)
    const result = url.searchParams.get('account_payment')
    const returnedQuoteId = url.searchParams.get('quote_id')
    if (!['success', 'cancelled'].includes(result ?? '') || !returnedQuoteId || !quoteIdPattern.test(returnedQuoteId)) return

    let active = true
    setPaymentNotice('Checking the provider-confirmed payment status. Your balance changes only after confirmation.')
    void (async () => {
      try {
        const { data: linkedPayment, error: paymentError } = await supabase
          .from('payments')
          .select('id')
          .eq('account_quote_id', returnedQuoteId)
          .maybeSingle()
        if (paymentError) throw paymentError
        if (!linkedPayment) {
          if (active) {
            setPaymentNotice('We could not find this checkout in your account yet. Refresh this page to check again.')
            await load()
          }
          return
        }
        if (active) {
          setReturnPaymentId(linkedPayment.id)
          url.searchParams.delete('account_payment')
          url.searchParams.delete('quote_id')
          window.history.replaceState(window.history.state, '', url)
          await load()
        }
      } catch (failure) {
        if (active) {
          setPaymentNotice('Payment status could not be checked. Refresh this page to retry.')
          setError(failure instanceof Error ? failure.message : 'Payment status could not be checked.')
        }
      }
    })()
    return () => { active = false }
  }, [customerId, admin, load])
  useEffect(() => {
    if (payment?.status === 'succeeded') {
      setIntent(null); setReturnPaymentId(null); setQuoteExpires(null)
      setPaymentNotice('Payment confirmed. Your account balance has been updated.')
      void load()
    } else if (payment?.status === 'failed') {
      setIntent(null); setReturnPaymentId(null); setQuoteExpires(null)
      setPaymentNotice('Checkout was not completed. Your latest account balance is shown below.')
      void load()
    }
  }, [payment?.status, load])
  useEffect(() => {
    if (!customerId) return
    const refresh = () => { void load() }
    const channel = supabase.channel(`account-balance:${customerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'account_charges', filter: `customer_id=eq.${customerId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'account_events', filter: `customer_id=eq.${customerId}` }, refresh)
      .subscribe()
    const refreshOnFocus = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', refreshOnFocus)
    window.addEventListener('admin-financial-data-changed', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refreshOnFocus)
      window.removeEventListener('admin-financial-data-changed', refresh)
      void supabase.removeChannel(channel)
    }
  }, [customerId, load])
  const outstanding = charges.filter(c => remainder(c) > 0)
  const total = outstanding.reduce((sum, c) => sum + remainder(c), 0)
  const checkout = async (chargeId?: string) => {
    if (busy) return
    setBusy(true); setError(''); setPaymentNotice('')
    try {
      const { data: quote, error: quoteError } = await supabase.rpc('create_account_quote', { p_charges: chargeId ? [chargeId] : null })
      if (quoteError || !quote) throw quoteError ?? new Error('Quote could not be created')
      setQuoteId(quote.id); setQuoteExpires(quote.expires_at)
      if (!await reviewTerms(quote.id, 'balance')) return
      const result = requireFunctionData<Intent>(await supabase.functions.invoke('account-payment', { body: {
        quote_id: quote.id,
        success_url: accountPaymentReturnUrl('success', quote.id),
        cancel_url: accountPaymentReturnUrl('cancelled', quote.id),
      } }), 'Account checkout failed.')
      setIntent(result); setQuoteExpires(quote.expires_at)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Payment could not be prepared.') }
    finally { setBusy(false) }
  }
  const adjust = async (kind: 'cash' | 'waiver') => {
    if (busy || !selected || reason.trim().length < 3 || Number(amount) <= 0) return
    setBusy(true); setError('')
    try {
      const { error: adjustmentError } = await supabase.rpc('adjust_account_charge', { p_charge: selected, p_amount: Number(amount), p_kind: kind, p_reason: reason.trim(), p_request: crypto.randomUUID() })
      if (adjustmentError) throw adjustmentError
      setAmount(''); setReason(''); await load()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Adjustment could not be saved.') }
    finally { setBusy(false) }
  }
  const reverse = async (eventId: string) => {
    if (busy || reason.trim().length < 3) { setError('Enter a correction reason in the admin notes first.'); return }
    setBusy(true)
    const { error: reverseError } = await supabase.rpc('reverse_account_collection', { p_event: eventId, p_reason: reason, p_request: crypto.randomUUID() })
    if (reverseError) setError(reverseError.message); else { setReason(''); await load() }
    setBusy(false)
  }
  const cancelQuote = async () => {
    if (!quoteId || busy) return
    setBusy(true)
    const { error: cancelError } = await supabase.rpc('cancel_account_quote', { p_quote: quoteId })
    if (cancelError) setError(cancelError.message); else { setQuoteId(null); setQuoteExpires(null); await load() }
    setBusy(false)
  }
  return <section className="account-panel account-balance" aria-label={websiteText("Account balance")}><div className="transaction-section-heading"><span className="transaction-icon"><Wallet size={20} strokeWidth={1.75} /></span><div><h2>{admin ? websiteText("Customer balances") : websiteText("Account balance")}</h2><p>{websiteText("Charges, payments and adjustments in one place.")}</p></div></div>
    {error && <p role="alert">{error}</p>}
    {paymentNotice && <p role="status">{websiteText(paymentNotice)}</p>}
    {loading ? <div className="transaction-loading" role="status"><span /><span /><span /><span className="sr-only">{websiteText("Loading balance")}</span></div> : <>
      <div className="account-balance-total"><span>{websiteText("Outstanding balance")}</span><strong>{money(total)}</strong><small>{total > 0 ? websiteText("{value1} unpaid {value2}", { value1: String(outstanding.length), value2: String(outstanding.length === 1 ? 'charge' : 'charges') }) : websiteText("No payment due")}</small></div>
      {flaggedAt && <p role="status" className="account-notice">{websiteText("Account flagged for unpaid late fees since")} {new Date(flaggedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}{' '}{websiteText("Philippine time. Settle all blocking debt to clear the flag; your history is retained.")}</p>}
      {!admin && outstanding.some(c => c.blocks_rentals) && <p className="account-notice">{websiteText("Settle all blocking balances to book another rental. Your account may be flagged if late-return charges remain unpaid. Mechanic services and roadside assistance remain available.")}</p>}
      {outstanding.length > 0 && <div className="account-scroll"><table><caption>{websiteText("Finalized charges · pending damage proposals are excluded")}</caption><thead><tr><th>{websiteText("Booking / charge")}</th><th>{websiteText("Calculation / deadline")}</th><th>{websiteText("Amount")}</th><th>{websiteText("Paid / waived")}</th><th>{websiteText("Remaining")}</th><th>{websiteText("Action")}</th></tr></thead><tbody>
        {outstanding.map(c => <tr key={c.id}><td><a href={`/bookings?booking_id=${c.booking_id}`}>{c.booking_type} · {c.booking_id}</a><br />{c.description}{c.blocks_rentals && remainder(c) > 0 && <small>{websiteText("· Blocks rentals")}</small>}</td>
          <td>{c.kind === 'late_return' ? websiteText("{value1} × {value2} completed late hours", { value1: String(money(250)), value2: String(Number(c.amount) / 250) }) : c.kind === 'daily_penalty' ? websiteText("One completed additional unpaid day") : c.kind.replace(/_/g, ' ')}{c.due_at && <><br />{' '}{websiteText("Due")} {new Date(c.due_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}{' '}{websiteText("Philippine time")}</>}</td>
          <td>{money(Number(c.amount))}</td><td>{money(Number(c.paid))} / {money(Number(c.waived))}</td><td>{money(remainder(c))}</td><td>{remainder(c) > 0 && (admin ? <button type="button" disabled={busy} onClick={() => { setSelected(c.id); setAmount(String(remainder(c))) }}>{websiteText("Select")}</button> : <button type="button" disabled={busy || !!intent || !!returnPaymentId} onClick={() => void checkout(c.id)}>{websiteText("Pay charge")}</button>)}</td></tr>)}
      </tbody></table></div>}
      {!outstanding.length && <div className="transaction-empty"><CheckCircle2 size={30} strokeWidth={1.5} aria-hidden="true" /><div><strong>{websiteText("You’re all settled")}</strong><p>{websiteText(charges.length ? "Paid charges are listed under payments, waivers and adjustments." : "No posted charges. Any future fees or approved adjustments will appear here.")}</p></div></div>}
      {!admin && total > 0 && <button type="button" className="primary-button" disabled={busy || !!intent || !!returnPaymentId} onClick={() => void checkout()}>{websiteText("Pay all")}</button>}
      {!admin && quoteId && !intent && !returnPaymentId && <button type="button" disabled={busy} onClick={() => void cancelQuote()}>{websiteText("Cancel unused quote to select different charges")}</button>}
      {intent && <><p>{websiteText("Total:")} {money(intent.amount)}{websiteText(". Protected until")} {quoteExpires && new Date(quoteExpires).toLocaleTimeString()}{websiteText("; a payment received later still reduces your balance.")}</p><PaymentForm clientSecret={intent.client_secret} checkoutUrl={intent.checkout_url} amount={intent.amount} currency={intent.currency} provider={intent.provider} onComplete={() => void load()} onCheckoutOpened={() => setPaymentNotice('Payment pending. Your balance will update after PayMongo confirms the payment.')} onError={setError} /><p>{websiteText("Payment is confirmed by the provider. Do not pay again while processing.")}</p></>}
      {admin && <fieldset disabled={busy}><legend>{websiteText("Record cash or approve a waiver")}</legend><label>{websiteText("Charge")}<select value={selected} onChange={e => setSelected(e.target.value)}><option value="">{websiteText("Select charge")}</option>{outstanding.map(c => <option key={c.id} value={c.id}>{c.customer_id.slice(0, 8)} · {c.description} · {money(remainder(c))}</option>)}</select></label><label>{websiteText("Amount (PHP)")}<input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label><label>{websiteText("Reason")}<input value={reason} minLength={3} onChange={e => setReason(e.target.value)} /></label><div className="transaction-actions"><button type="button" onClick={() => void adjust('cash')}>{websiteText("Record cash collection")}</button><button type="button" onClick={() => void adjust('waiver')}>{websiteText("Approve waiver")}</button></div></fieldset>}
      <details className="account-history"><summary>{websiteText("Payments, waivers and adjustments")}<span>{events.length}</span></summary>{!events.length && <p className="transaction-helper">{websiteText("No payments or adjustments to show yet.")}</p>}<ul>{events.map(e => <li key={e.id}>{new Date(e.created_at).toLocaleString()} · {e.kind} · {money(Number(e.amount))} · {e.reason}{admin && <>{websiteText("· Actor")} {e.actor_id?.slice(0, 8) ?? websiteText("System")}{['cash', 'waiver'].includes(e.kind) && Number(e.amount) > 0 && !events.some(reversal => reversal.reverses_event_id === e.id) && <button type="button" disabled={busy} onClick={() => void reverse(e.id)}>{websiteText("Correct this entry with an audited reversal")}</button>}</>}</li>)}</ul></details>
    </>}
    <button type="button" className="transaction-quiet" disabled={busy} onClick={() => void load()}><RefreshCw size={14} />{' '}{websiteText("Refresh balance")}</button>
  </section>
}
