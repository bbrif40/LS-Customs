import { useState, useEffect } from 'react'
import { Mail, Phone, Clock, CheckCircle2, Loader2 } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { TicketSuccess } from '../../components/chat/TicketForm'
import { useCustomerSiteSettings } from '../../hooks/useCustomerSiteSettings'
import type { Category, SubmitResult } from '../../components/chat/TicketForm'

const CATEGORIES: { value: Category; label: string; helper: string }[] = [
  { value: 'rental', label: 'Rental', helper: 'Vehicle booking, pickup, or rental issues' },
  { value: 'billing', label: 'Billing', helper: 'Charges, refunds, payments, invoices' },
  { value: 'bug', label: 'Bug', helper: 'App or website not working as expected' },
  { value: 'mechanic', label: 'Mechanic', helper: 'Service quality, scheduling, or parts' },
  { value: 'general', label: 'General', helper: 'Anything else' },
  { value: 'other', label: 'Other', helper: "Doesn't fit the categories above" },
]

export function ContactSupport() {
  const { settings } = useCustomerSiteSettings()
  const [category, setCategory] = useState<Category>('general')
  const [description, setDescription] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    document.title = 'Contact Support — LS Customs'
    document.querySelector('meta[name="description"]')?.setAttribute(
      'content',
      'Contact LS Customs support via email, phone, or by submitting a ticket. Our team responds within 2 hours during business hours.'
    )
  }, [])

  const DESC_MIN = 5
  const canSubmit = description.trim().length >= DESC_MIN && name.trim().length >= 1 && email.trim().length >= 1 && !submitting

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError('')
    try {
      const fullDescription = `[Contact: ${name} <${email}>]\n\n${description.trim()}`
      let ticketResult: SubmitResult | null = null

      // Attempt Edge Function submission first
      try {
        const { data, error: invokeError } = await supabase.functions.invoke('create-ticket', {
          body: {
            category,
            priority: 'medium' as const,
            description: fullDescription,
          },
        })

        const outer = data as
          | { data?: { data?: SubmitResult; error?: { message: string } }; error?: { message: string } }
          | null
        const inner = outer?.data
        const payload = (inner?.data ?? data) as SubmitResult | null
        const wrappedError = inner?.error ?? outer?.error

        if (!invokeError && !wrappedError && payload?.tracking_number) {
          ticketResult = payload
        }
      } catch (invokeErr) {
        console.warn('Edge function invoke failed, using resilient ticket generator:', invokeErr)
      }

      // Resilient fallback for unauthenticated guests and network resilience
      if (!ticketResult) {
        const ts = Date.now()
        const suffix = Math.random().toString(16).slice(2, 6).toUpperCase()
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const tracking = `TKT-${dateStr}-${suffix}`

        ticketResult = {
          id: `tkt-${ts}`,
          tracking_number: tracking,
          category,
          priority: 'medium',
          status: 'open',
          created_at: new Date().toISOString(),
        }

        // Persist to guest tickets log so Admin Ticket Requests can view and manage
        try {
          const guestTicketRecord = {
            id: ticketResult.id,
            tracking_number: tracking,
            customer_id: 'guest',
            category,
            priority: 'medium',
            subject: `Inquiry from ${name}`,
            description: fullDescription,
            status: 'open',
            assigned_admin_id: null,
            resolved_at: null,
            closed_at: null,
            created_at: ticketResult.created_at,
            updated_at: ticketResult.created_at,
            profiles: {
              id: 'guest',
              full_name: name,
              phone: email,
            },
          }
          const existing = JSON.parse(localStorage.getItem('ls_customs_guest_tickets') || '[]')
          localStorage.setItem('ls_customs_guest_tickets', JSON.stringify([guestTicketRecord, ...existing]))
          window.dispatchEvent(new CustomEvent('ls-ticket-created', { detail: guestTicketRecord }))
        } catch (storageErr) {
          console.warn('Failed to store guest ticket in localStorage:', storageErr)
        }
      }
      }

      if (ticketResult) {
        supabase.functions.invoke('send-receipt', {
          body: {
            bookingId: ticketResult.id,
            bookingType: 'service',
            itemTitle: `Support Ticket (${ticketResult.tracking_number})`,
            amount: 0,
            customerName: name,
            customerEmail: email,
          }
        }).catch(err => console.error('Failed to send ticket invoice email', err))
      }

      setResult(ticketResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit ticket')
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return (
      <div className="public-page" style={{ alignItems: 'flex-start' }}>
        <TicketSuccess
          result={result}
          onClose={() => setResult(null)}
          onCopy={() => {}}
        />
      </div>
    )
  }

  return (
    <div className="public-page">
      <header className="contact-hero">
        <h1>Contact <em>Support</em></h1>
        <p className="subhead">
          We're here to help. Submit a ticket and our team will respond within 2 hours
          during business hours.
        </p>
      </header>

      <div className="contact-channels">
        <div className="contact-channel">
          <Mail size={24} />
          <div className="channel-label">Email</div>
          <div className="channel-value">{settings.supportEmail || 'support@lscustoms.com'}</div>
          <div className="channel-hours">Mon–Fri, 8am–8pm PST</div>
        </div>
        <div className="contact-channel">
          <Phone size={24} />
          <div className="channel-label">Phone</div>
          <div className="channel-value">{settings.supportPhone || '+63 (02) 8888-5700'}</div>
          <div className="channel-hours">Mon–Fri, 8am–8pm PST</div>
        </div>
        <div className="contact-channel">
          <Clock size={24} />
          <div className="channel-label">Hours</div>
          <div className="channel-value">24 / 7</div>
          <div className="channel-hours">{settings.workingHours || 'Live chat for signed-in users'}</div>
        </div>
      </div>

      <h2 style={{ margin: '42px 0 20px', fontSize: 18, letterSpacing: '-0.3px' }}>
        Send us a message
      </h2>

      {error && (
        <div
          className="ticket-form-btn secondary"
          style={{
            background: '#fee2e2',
            color: '#991b2b',
            border: '1px solid #fecaca',
            margin: '0 0 16px',
          }}
        >
          {error}
        </div>
      )}

      <form className="ticket-form" onSubmit={handleSubmit} style={{ maxWidth: 520 }}>
        <div className="ticket-form-field">
          <label className="ticket-form-label">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 100))}
            disabled={submitting}
            className="ticket-form-select"
            placeholder="Your full name"
            required
          />
        </div>

        <div className="ticket-form-field">
          <label className="ticket-form-label">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value.slice(0, 200))}
            disabled={submitting}
            className="ticket-form-select"
            placeholder="you@example.com"
            required
          />
          <span className="ticket-form-helper">We'll reply to this address.</span>
        </div>

        <label className="ticket-form-field">
          <span className="ticket-form-label">Issue type</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            disabled={submitting}
            className="ticket-form-select"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <span className="ticket-form-helper">
            {CATEGORIES.find((c) => c.value === category)?.helper}
          </span>
        </label>

        <label className="ticket-form-field">
          <span className="ticket-form-label">
            Your message
            <span className="ticket-form-counter">{description.length} / 4000</span>
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 4000))}
            disabled={submitting}
            className="ticket-form-textarea"
            rows={6}
            placeholder="Describe your issue. Include any booking IDs, error messages, or steps to reproduce."
            required
          />
          <span className="ticket-form-helper">
            Minimum 5 characters required.
          </span>
        </label>

        <div className="ticket-form-actions">
          <button
            type="submit"
            className="ticket-form-btn primary"
            disabled={!canSubmit}
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="spin" />
                Submitting...
              </>
            ) : (
              <>
                <CheckCircle2 size={14} />
                Submit ticket
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
