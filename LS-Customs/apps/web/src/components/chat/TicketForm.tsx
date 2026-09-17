/**
 * TicketForm — structured support-ticket submission form embedded in the
 * chatbot window. Replaces free-text "create ticket" with explicit
 * category / severity / description fields. Submits to the
 * `create-ticket` Edge Function, which returns a tracking number
 * (TKT-YYYYMMDD-XXXX).
 */
import { useState, useEffect, useRef } from 'react'
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
  MessageSquare,
  ArrowLeft,
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    // Focus textarea after brief mount
    const timer = setTimeout(() => {
      textareaRef.current?.focus()
    }, 150)
    return () => clearTimeout(timer)
  }, [])

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
    <form className="ticket-form" onSubmit={handleSubmit}>
      {/* Header bar with icon & close */}
      <div className="ticket-form-header">
        <div className="ticket-form-title">
          <span className="ticket-form-badge-icon">
            <TicketPlus size={16} />
          </span>
          <div>
            <span>Create Support Ticket</span>
          </div>
        </div>
        <button
          type="button"
          className="chat-close"
          onClick={onClose}
          aria-label="Back to chat"
          disabled={submitting}
          title="Back to chat"
        >
          <X size={17} />
        </button>
      </div>

      <p className="ticket-form-subtitle">
        Fill in the details below and we will route your ticket directly to our dispatch and support staff.
      </p>

      {/* Category selection */}
      <div className="ticket-form-field">
        <div className="ticket-form-label">
          <span>Category</span>
          <span className="ticket-form-selected-pill">{selectedCategoryConfig?.label}</span>
        </div>
        <div className="ticket-category-grid" role="radiogroup" aria-label="Ticket Category">
          {CATEGORIES.map((c) => {
            const Icon = c.icon
            const active = category === c.value
            return (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={submitting}
                onClick={() => setCategory(c.value)}
                className={`ticket-category-card${active ? ' active' : ''}`}
                title={c.helper}
              >
                <Icon size={16} />
                <span>{c.label}</span>
              </button>
            )
          })}
        </div>
        {selectedCategoryConfig && (
          <div className="ticket-category-helper-bubble">
            {selectedCategoryConfig.helper}
          </div>
        )}
      </div>

      {/* Severity selection */}
      <div className="ticket-form-field">
        <div className="ticket-form-label">
          <span>Severity</span>
          <span className="ticket-form-selected-pill" style={{ color: selectedPriorityConfig?.color }}>
            {selectedPriorityConfig?.label}
          </span>
        </div>
        <div className="ticket-form-priority-row" role="radiogroup" aria-label="Ticket Severity">
          {PRIORITIES.map((p) => {
            const active = priority === p.value
            return (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={submitting}
                onClick={() => setPriority(p.value)}
                className={`ticket-form-priority-chip${active ? ' active' : ''}`}
                style={
                  active
                    ? {
                        borderColor: p.color,
                        background: `${p.color}15`,
                        color: p.color,
                      }
                    : undefined
                }
                title={p.helper}
              >
                <span
                  className="ticket-priority-dot"
                  style={{ background: p.color }}
                />
                <span>{p.label}</span>
              </button>
            )
          })}
        </div>
        {selectedPriorityConfig && (
          <div className="ticket-form-priority-helper">
            {selectedPriorityConfig.helper}
          </div>
        )}
      </div>

      {/* Description textarea */}
      <div className="ticket-form-field">
        <div className="ticket-form-label">
          <span>Issue Description</span>
          <span className={`ticket-form-counter${description.length < 5 && description.length > 0 ? ' warning' : ''}`}>
            {description.length} / 4,000
          </span>
        </div>
        <textarea
          ref={textareaRef}
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 4000))}
          disabled={submitting}
          className="ticket-form-textarea"
          rows={3}
          placeholder="Please describe what happened in detail. Include any booking IDs, vehicle plate numbers, or specific questions..."
        />
        {description.length > 0 && description.length < 5 && (
          <span className="ticket-form-validation-hint">
            Please enter at least 5 characters to submit.
          </span>
        )}
      </div>

      {/* Form Action Footer */}
      <div className="ticket-form-actions">
        <button
          type="button"
          className="ticket-form-btn secondary"
          onClick={onClose}
          disabled={submitting}
        >
          <ArrowLeft size={14} /> Back
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
              <Send size={14} /> Submit Ticket
            </>
          )}
        </button>
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

  const handleCopy = () => {
    onCopy(result.tracking_number)
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
            <span className="ticket-tracking-code">{result.tracking_number}</span>
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
        <button
          type="button"
          className="ticket-form-btn primary"
          onClick={onClose}
          title="Open live ticket conversation"
        >
          <MessageSquare size={14} /> Live Discussion
        </button>
      </div>
    </div>
  )
}
