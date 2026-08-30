/**
 * TicketForm — structured support-ticket submission form embedded in the
 * chatbot window. Replaces free-text "create ticket" with explicit
 * category / severity / description fields. Submits to the
 * `create-ticket` Edge Function, which returns a tracking number
 * (TKT-YYYYMMDD-XXXX).
 */
import { useState, useEffect, useRef } from 'react'
import { X, TicketPlus, Loader2, CheckCircle2 } from 'lucide-react'
import { supabase } from '../../supabaseClient'

type Category = 'general' | 'rental' | 'billing' | 'bug' | 'mechanic' | 'other'
type Priority = 'low' | 'medium' | 'high' | 'critical'

const CATEGORIES: { value: Category; label: string; helper: string }[] = [
  { value: 'rental', label: 'Rental', helper: 'Vehicle booking, pickup, or rental issues' },
  { value: 'billing', label: 'Billing', helper: 'Charges, refunds, payments, invoices' },
  { value: 'bug', label: 'Bug', helper: 'App or website not working as expected' },
  { value: 'mechanic', label: 'Mechanic', helper: 'Service quality, scheduling, or parts' },
  { value: 'general', label: 'General', helper: 'Anything else' },
  { value: 'other', label: 'Other', helper: "Doesn't fit the categories above" },
]

const PRIORITIES: { value: Priority; label: string; color: string; helper: string }[] = [
  { value: 'low', label: 'Low', color: '#6b7280', helper: 'No rush' },
  { value: 'medium', label: 'Medium', color: '#3b82f6', helper: 'Within a day' },
  { value: 'high', label: 'High', color: '#f59e0b', helper: 'Today if possible' },
  { value: 'critical', label: 'Critical', color: '#ef4444', helper: 'Blocking my work' },
]

interface SubmitResult {
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
  const firstFieldRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    firstFieldRef.current?.focus()
  }, [])

  const canSubmit = description.trim().length >= 5 && !submitting

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
    <form className="ticket-form" onSubmit={handleSubmit}>
      <div className="ticket-form-header">
        <div className="ticket-form-title">
          <TicketPlus size={16} />
          <span>Create support ticket</span>
        </div>
        <button
          type="button"
          className="chat-close"
          onClick={onClose}
          aria-label="Close ticket form"
          disabled={submitting}
        >
          <X size={16} />
        </button>
      </div>

      <p className="ticket-form-subtitle">
        Tell us what's going on and we'll route it to the right team.
      </p>

      <label className="ticket-form-field">
        <span className="ticket-form-label">Issue type</span>
        <select
          ref={firstFieldRef}
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
          disabled={submitting}
          className="ticket-form-select"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <span className="ticket-form-helper">
          {CATEGORIES.find((c) => c.value === category)?.helper}
        </span>
      </label>

      <div className="ticket-form-field">
        <span className="ticket-form-label">Severity</span>
        <div className="ticket-form-priority-row">
          {PRIORITIES.map((p) => {
            const active = priority === p.value
            return (
              <button
                key={p.value}
                type="button"
                disabled={submitting}
                onClick={() => setPriority(p.value)}
                className={`ticket-form-priority-chip${active ? ' active' : ''}`}
                style={
                  active
                    ? {
                        borderColor: p.color,
                        background: `${p.color}22`,
                        color: p.color,
                      }
                    : undefined
                }
                title={p.helper}
              >
                {p.label}
              </button>
            )
          })}
        </div>
        <span className="ticket-form-helper">
          {PRIORITIES.find((p) => p.value === priority)?.helper}
        </span>
      </div>

      <label className="ticket-form-field">
        <span className="ticket-form-label">
          What's happening?
          <span className="ticket-form-counter">{description.length} / 4000</span>
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 4000))}
          disabled={submitting}
          className="ticket-form-textarea"
          rows={5}
          placeholder="Describe the issue. Include any booking IDs, error messages, or steps to reproduce."
        />
      </label>

      <div className="ticket-form-actions">
        <button
          type="button"
          className="ticket-form-btn secondary"
          onClick={onClose}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="ticket-form-btn primary"
          disabled={!canSubmit}
        >
          {submitting ? (
            <>
              <Loader2 size={14} className="spin" /> Submitting...
            </>
          ) : (
            <>
              <CheckCircle2 size={14} /> Submit ticket
            </>
          )}
        </button>
      </div>
    </form>
  )
}

/**
 * TicketSuccess — confirmation card shown after a successful submission.
 * Displays the tracking number prominently so the user can reference it
 * later (admin panel also searches by it).
 */
interface TicketSuccessProps {
  result: SubmitResult
  onClose: () => void
  onCopy: (text: string) => void
}

export function TicketSuccess({ result, onClose, onCopy }: TicketSuccessProps) {
  return (
    <div className="ticket-form ticket-success">
      <div className="ticket-form-header">
        <div className="ticket-form-title success">
          <CheckCircle2 size={18} />
          <span>Ticket submitted</span>
        </div>
        <button
          type="button"
          className="chat-close"
          onClick={onClose}
          aria-label="Close confirmation"
        >
          <X size={16} />
        </button>
      </div>

      <div className="ticket-success-tracking">
        <span className="ticket-success-label">Tracking number</span>
        <button
          type="button"
          className="ticket-success-number"
          onClick={() => onCopy(result.tracking_number)}
          title="Click to copy"
        >
          {result.tracking_number}
        </button>
        <span className="ticket-success-hint">Click to copy</span>
      </div>

      <div className="ticket-success-grid">
        <div>
          <span className="ticket-success-meta-label">Category</span>
          <span className="ticket-success-meta-value">{result.category}</span>
        </div>
        <div>
          <span className="ticket-success-meta-label">Severity</span>
          <span className="ticket-success-meta-value">{result.priority}</span>
        </div>
        <div>
          <span className="ticket-success-meta-label">Status</span>
          <span className="ticket-success-meta-value">{result.status}</span>
        </div>
        <div>
          <span className="ticket-success-meta-label">Submitted</span>
          <span className="ticket-success-meta-value">
            {new Date(result.created_at).toLocaleString()}
          </span>
        </div>
      </div>

      <p className="ticket-success-note">
        An admin will review your ticket and respond. Reference the tracking number
        in any follow-up.
      </p>

      <div className="ticket-form-actions">
        <button type="button" className="ticket-form-btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}
