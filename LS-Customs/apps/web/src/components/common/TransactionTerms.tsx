import { ShieldCheck } from 'lucide-react'
import { createContext, useContext, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../supabaseClient'
import { useDialog } from '../../hooks/useDialog'

type TransactionKind = 'vehicle' | 'service' | 'roadside' | 'payment' | 'balance'
interface Review { id: string; kind: TransactionKind; version: string; content: string; resolve: (accepted: boolean) => void }
const TermsContext = createContext<(id: string, kind: TransactionKind) => Promise<boolean>>(async () => false)
export const useTransactionTerms = () => useContext(TermsContext)

export function TransactionTermsProvider({ children }: { children: ReactNode }) {
  const [review, setReview] = useState<Review | null>(null)
  const [accepted, setAccepted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const active = useRef(false)
  const close = () => { if (!saving) { review?.resolve(false); setReview(null); active.current = false } }
  const dialog = useDialog(close, !!review)
  const request = async (id: string, kind: TransactionKind): Promise<boolean> => {
    if (active.current) return false
    active.current = true
    setAccepted(false); setError('')
    const { data, error: loadError } = await supabase.from('transaction_terms').select('version,content')
      .eq('active', true).order('created_at', { ascending: false }).limit(1).single()
    if (loadError || !data) {
      active.current = false
      throw new Error('Transaction rules could not be loaded. Please try again.')
    }
    return new Promise(resolve => setReview({ id, kind, ...data, resolve }))
  }
  const confirm = async () => {
    if (!review || !accepted || saving) return
    setSaving(true); setError('')
    try {
      const { error: saveError } = await supabase.rpc('accept_transaction_terms', {
        p_transaction_id: review.id, p_kind: review.kind, p_version: review.version,
      })
      if (saveError) throw saveError
      review.resolve(true); setReview(null); active.current = false
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Acceptance could not be saved. Please try again.') }
    finally { setSaving(false) }
  }
  return <TermsContext.Provider value={request}>{children}{review && createPortal(
    <div className="auth-backdrop transaction-terms-backdrop"><section ref={dialog} className="auth-dialog transaction-terms" role="dialog" aria-modal="true" aria-labelledby="transaction-terms-title" tabIndex={-1}>
      <header className="terms-heading"><span className="transaction-icon"><ShieldCheck size={22} strokeWidth={1.75} aria-hidden="true" /></span><div><h2 id="transaction-terms-title">Terms of Service and Rules</h2><p>Review these rules before continuing.</p></div><span className="terms-version">Version {review.version}</span></header>
      {review.kind === 'roadside' && <p><strong>Roadside:</strong> mechanic acceptance is required. Cash is due after service. Online payments confirm after success. Coverage follows the configured service radius and operating hours.</p>}
      {review.kind === 'roadside' ? <details><summary>Read the full versioned terms and account rules</summary><div className="transaction-terms-content" tabIndex={0}>{review.content.split(/(?<=\.) (?=[A-Z])/).map((paragraph, i) => <p key={i}>{paragraph}</p>)}</div></details> : <div className="transaction-terms-content" tabIndex={0}>{review.content.split(/(?<=\.) (?=[A-Z])/).map((paragraph, i) => <p key={i}>{paragraph}</p>)}</div>}
      <label className="terms-consent"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} disabled={saving} /><span>I have read and accept these terms and the rules for this transaction.</span></label>
      {error && <p role="alert">{error}</p>}
      <div className="transaction-actions"><button type="button" className="outline-button" onClick={close} disabled={saving}>Cancel</button><button type="button" className="primary-button" onClick={() => void confirm()} disabled={!accepted || saving}>{saving ? 'Saving…' : 'Accept and continue'}</button></div>
    </section></div>, document.body)}</TermsContext.Provider>
}
