/**
 * TicketForm — structured support-ticket submission form embedded in the
 * chatbot window. Replaces free-text "create ticket" with explicit
 * category / severity / description fields. Submits to the
 * `create-ticket` Edge Function, which returns a tracking number
 * (TKT-YYYYMMDD-XXXX).
 */
import { useState } from 'react'
import './ticket-form.css'
import {
  X,
  TicketPlus,
  Loader2,
  CheckCircle2,
  Car,
  Wrench,
  CreditCard,
  AlertCircle,
  HelpCircle,
  MoreHorizontal,
  Copy,
  Check,
  Send,
  ArrowLeft,
  Mail,
} from 'lucide-react'
import { supabase } from '../../supabaseClient'

export type Category = 'general' | 'rental' | 'billing' | 'bug' | 'mechanic' | 'other'
export type Priority = 'low' | 'medium' | 'high' | 'critical'

interface CategoryConfig {
  value: Category
  label: string
  icon: typeof Car
  helper: string
}

const CATEGORIES: CategoryConfig[] = [
  { value: 'rental', label: 'Car Rental', icon: Car, helper: 'Vehicle booking, reservation, pickup, or rental returns' },
  { value: 'mechanic', label: 'Mechanic', icon: Wrench, helper: 'Mobile service quality, appointment scheduling, or parts' },
  { value: 'billing', label: 'Billing', icon: CreditCard, helper: 'Charges, security deposits, refunds, or invoice inquiries' },
  { value: 'bug', label: 'App Glitch', icon: AlertCircle, helper: 'Technical bug, error messages, or system issues' },
  { value: 'general', label: 'General', icon: HelpCircle, helper: 'General questions, inquiries, or business feedback' },
  { value: 'other', label: 'Other', icon: MoreHorizontal, helper: 'Any other requests not covered by the categories above' },
]

interface PriorityConfig {
  value: Priority
  label: string
  color: string
  helper: string
}

const PRIORITIES: PriorityConfig[] = [
  { value: 'low', label: 'Low', color: '#10b981', helper: 'General question • No urgent rush' },
  { value: 'medium', label: 'Medium', color: '#3b82f6', helper: 'Standard priority • Within 24-48 hours' },
  { value: 'high', label: 'High', color: '#f59e0b', helper: 'Important • Needs attention today' },
  { value: 'critical', label: 'Critical', color: '#ef4444', helper: 'Urgent blocker • Requires immediate support' },
]

export interface SubmitResult {
  id: string
  tracking_number: string
  category: Category
  priority: Priority
  status: string
  created_at: string
}

interface TicketFormProps {
  onClose: () => void
  onSubmitted: (result: SubmitResult) => void
  onError: (message: string) => void
}

export function TicketForm({ onClose, onSubmitted, onError }: TicketFormProps) {
  const [category, setCategory] = useState<Category>('general')
  const [priority, setPriority] = useState<Priority>('medium')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const canSubmit = description.trim().length >= 5 && !submitting
  const selectedCategoryConfig = CATEGORIES.find((c) => c.value === category)
  const selectedPriorityConfig = PRIORITIES.find((p) => p.value === priority)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-ticket', {
        body: {
          category,
          priority,
          description: description.trim(),
        },
      })

      // The Edge Function returns { data: <ticket>, error: null }, and supabase-js
      // invoke() wraps that under its own { data, error } envelope. So we get
      // data.data.data = <ticket>. Unwrap both layers.
      const outer = data as
        | { data?: { data?: SubmitResult; error?: { message: string } }; error?: { message: string } }
        | null
      const inner = outer?.data
      const payload = (inner?.data ?? data) as SubmitResult | null
      const wrappedError = inner?.error ?? outer?.error

      if (error) {
        onError(error.message)
        return
      }
      if (wrappedError) {
        onError(wrappedError.message)
        return
      }
      if (!payload || !payload.tracking_number) {
        onError('Empty response from server. Please try again.')
        return
      }

      onSubmitted(payload)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to submit ticket')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="ticket-form ticket-compose" onSubmit={handleSubmit} aria-labelledby="ticket-heading" aria-busy={submitting}>
      <div className="ticket-compose-heading">
        <span className="ticket-compose-symbol"><TicketPlus size={22} /></span>
        <div><h2 id="ticket-heading">How can we help?</h2><p>Send a request to our support team.</p></div>
      </div>

      <fieldset className="ticket-topic-field" disabled={submitting} aria-describedby="ticket-topic-help">
        <legend>What is this about?</legend>
        <div className="ticket-topic-options">
          {CATEGORIES.map(({ value, label, icon: Icon }) => (
            <label key={value} className={`ticket-topic-option${category === value ? ' is-selected' : ''}`}>
              <input type="radio" name="ticket-category" value={value} checked={category === value} onChange={() => setCategory(value)} />
              <Icon size={17} aria-hidden="true" /><span>{label}</span>
              {category === value && <Check size={14} className="ticket-topic-check" aria-hidden="true" />}
            </label>
          ))}
        </div>
        <p id="ticket-topic-help" className="ticket-compose-help">{selectedCategoryConfig?.helper}</p>
      </fieldset>

      <div className="ticket-compose-field">
        <label htmlFor="ticket-description">Tell us what happened <span>Required</span></label>
        <textarea id="ticket-description" value={description} onChange={e => setDescription(e.target.value)} disabled={submitting}
          className="ticket-form-textarea" rows={4} maxLength={4000} required minLength={5}
          aria-describedby="ticket-description-help ticket-description-count"
          placeholder="Describe the issue and how we can help…" />
        <div className="ticket-description-meta">
          <p id="ticket-description-help">{description.length > 0 && description.trim().length < 5 ? 'Add a little more detail (at least 5 characters).' : 'Include a booking reference if you have one.'}</p>
          <span id="ticket-description-count">{description.length.toLocaleString()} / 4,000</span>
        </div>
      </div>

      <div className="ticket-compose-field">
        <label htmlFor="ticket-priority">How urgent is it?</label>
        <select id="ticket-priority" value={priority} onChange={e => setPriority(e.target.value as Priority)} disabled={submitting} aria-describedby="ticket-priority-help">
          {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}{p.value === 'medium' ? ' (default)' : ''}</option>)}
        </select>
        <p id="ticket-priority-help" className="ticket-compose-help">{selectedPriorityConfig?.helper}</p>
      </div>

      <div className="ticket-compose-footer">
        <p>You can follow up in this chat after submitting.</p>
        <div className="ticket-compose-actions">
          <button type="button" className="ticket-form-btn secondary" onClick={onClose} disabled={submitting}><ArrowLeft size={16} /> Back to chat</button>
          <button type="submit" className="ticket-form-btn primary" disabled={!canSubmit}>
            {submitting ? <><Loader2 size={16} className="spin" /> Sending…</> : <><Send size={16} /> Send request</>}
          </button>
        </div>
      </div>
    </form>
  )
}

/**
 * TicketSuccess — confirmation card shown after a successful submission.
 * Displays the tracking number prominently with 1-click copy so the user
 * can reference it later.
 */
interface TicketSuccessProps {
  result: SubmitResult
  onClose: () => void
  onCopy: (text: string) => void
  onDismiss?: () => void
}

export function TicketSuccess({ result, onClose, onCopy, onDismiss }: TicketSuccessProps) {
  const [copied, setCopied] = useState(false)

  const formattedTicketId = result.tracking_number.startsWith('ticket-')
    ? result.tracking_number
    : `ticket-${(result.id || result.tracking_number).slice(0, 8).toLowerCase()}`

  const handleCopy = () => {
    onCopy(formattedTicketId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const categoryItem = CATEGORIES.find((c) => c.value === result.category)
  const priorityItem = PRIORITIES.find((p) => p.value === result.priority)
  const CategoryIcon = categoryItem?.icon ?? HelpCircle

  return (
    <div className="ticket-form ticket-success">
      <div className="ticket-form-header">
        <div className="ticket-form-title success">
          <span className="ticket-form-badge-icon success">
            <CheckCircle2 size={16} />
          </span>
          <span>Ticket Submitted</span>
        </div>
        <button
          type="button"
          className="chat-close"
          onClick={onDismiss ?? onClose}
          aria-label="Close confirmation"
          title="Back to chat"
        >
          <X size={17} />
        </button>
      </div>

      <div className="ticket-success-card">
        <div className="ticket-success-icon-badge">
          <CheckCircle2 size={26} />
        </div>
        <h4 className="ticket-success-title">Your request has been logged!</h4>
        <p className="ticket-success-desc">
          Our dispatchers and support staff have been notified. Please save your tracking reference number below:
        </p>

        {/* Tracking number box */}
        <div className="ticket-success-tracking-box">
          <span className="ticket-success-label">Ticket Tracking Number</span>
          <div className="ticket-tracking-pill">
            <span className="ticket-tracking-code">{formattedTicketId}</span>
            <button
              type="button"
              className={`ticket-copy-btn${copied ? ' copied' : ''}`}
              onClick={handleCopy}
              title="Copy tracking number"
            >
              {copied ? (
                <>
                  <Check size={12} /> Copied!
                </>
              ) : (
                <>
                  <Copy size={12} /> Copy
                </>
              )}
            </button>
          </div>
          <span className="ticket-success-hint">Reference this number when inquiring with our team.</span>
        </div>

        {/* Details breakdown */}
        <div className="ticket-success-grid">
          <div className="ticket-success-cell">
            <span className="ticket-success-meta-label">Category</span>
            <span className="ticket-success-meta-value inline-flex">
              <CategoryIcon size={13} />
              {categoryItem?.label ?? result.category}
            </span>
          </div>
          <div className="ticket-success-cell">
            <span className="ticket-success-meta-label">Severity</span>
            <span
              className="ticket-success-meta-value inline-flex"
              style={{ color: priorityItem?.color }}
            >
              <span
                className="ticket-priority-dot"
                style={{ background: priorityItem?.color ?? '#3b82f6' }}
              />
              {priorityItem?.label ?? result.priority}
            </span>
          </div>
          <div className="ticket-success-cell">
            <span className="ticket-success-meta-label">Status</span>
            <span className="ticket-success-meta-value status-tag">
              {result.status || 'open'}
            </span>
          </div>
          <div className="ticket-success-cell">
            <span className="ticket-success-meta-label">Logged</span>
            <span className="ticket-success-meta-value">
              {new Date(result.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      </div>

      <div className="ticket-form-actions success-actions">
        <button
          type="button"
          className="ticket-form-btn secondary"
          onClick={onDismiss ?? onClose}
        >
          <ArrowLeft size={14} /> Back to Assistant
        </button>
        <p className="ticket-success-email-note" style={{ fontSize: '13px', color: '#6b7280', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Mail size={14} /> An email has been sent to you regarding your concern.
        </p>
      </div>
    </div>
  )
}
