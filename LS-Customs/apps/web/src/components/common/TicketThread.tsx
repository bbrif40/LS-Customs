/**
 * TicketThread — shared message thread for one support ticket.
 *
 * Used by:
 *  - AdminTickets (admin side, role="admin")
 *  - ChatBot overlay after a customer submits a ticket (role="customer")
 *
 * Renders past messages oldest→newest with author name + relative time,
 * plus a composer at the bottom. Polling is handled by useTicketMessages
 * inside the parent; this component just consumes { data, loading, error, send }.
 *
 * Visual style is inline + minimal so the same component looks right
 * inside the dark admin panel and the lighter chatbot overlay.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Loader2, Send, ShieldCheck, User as UserIcon } from 'lucide-react'
import {
  useTicketMessages,
  type SupportTicketMessageWithAuthor,
  type TicketMessageAuthor,
} from '../../hooks/useAdminData'

interface TicketThreadProps {
  ticketId: string
  role: TicketMessageAuthor
  emptyHint?: string
  headerExtra?: ReactNode
  onSent?: (msg: SupportTicketMessageWithAuthor) => void
  onError?: (message: string) => void
  // Theme tokens — defaults match the admin panel; chat passes its own.
  theme?: {
    surface?: string
    surfaceMuted?: string
    text?: string
    muted?: string
    border?: string
    ownBubble?: string
    ownText?: string
    otherBubble?: string
    otherText?: string
    accent?: string
  }
}

const DEFAULT_THEME = {
  surface: '#0f1320',
  surfaceMuted: '#1a1f2e',
  text: '#d4d9e6',
  muted: '#9ca3af',
  border: '#2d3748',
  ownBubble: '#e8a838',
  ownText: '#1a1f2e',
  otherBubble: '#1a1f2e',
  otherText: '#d4d9e6',
  accent: '#e8a838',
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime()
  if (!isFinite(t)) return ''
  const diffSec = Math.round((Date.now() - t) / 1000)
  if (diffSec < 5) return 'just now'
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return new Date(iso).toLocaleString()
}

function authorName(msg: SupportTicketMessageWithAuthor): string {
  // PostgREST returns the joined profile as a single object, not an array
  // (the relationship from support_ticket_messages → profiles is many-to-one
  // via author_id, not a list).
  const p = msg.profiles
  return p?.full_name ?? (msg.author_role === 'admin' ? 'Support' : 'Customer')
}

export function TicketThread({
  ticketId,
  role,
  emptyHint,
  headerExtra,
  onSent,
  onError,
  theme,
}: TicketThreadProps) {
  const t = { ...DEFAULT_THEME, ...theme }
  const { data, loading, error, send } = useTicketMessages(ticketId)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const wasAtBottom = useRef(true)

  // Auto-scroll on new messages, but only if the user was already at the bottom.
  useEffect(() => {
    if (!data || data.length === 0) return
    const el = listRef.current
    if (!el) return
    if (wasAtBottom.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [data?.length])

  const handleScroll = () => {
    const el = listRef.current
    if (!el) return
    wasAtBottom.current = el.scrollHeight - el.clientHeight - el.scrollTop < 40
  }

  const handleSend = async () => {
    const trimmed = body.trim()
    if (!trimmed || sending) return
    setSending(true)
    try {
      await send(trimmed)
      setBody('')
      wasAtBottom.current = true
      onSent?.({} as SupportTicketMessageWithAuthor) // parent re-reads via send's refetch
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send reply'
      onError?.(message)
    } finally {
      setSending(false)
    }
  }

  const messages = data ?? []
  const canSend = body.trim().length > 0 && !sending

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        color: t.text,
      }}
    >
      {headerExtra && <div>{headerExtra}</div>}

      <div
        ref={listRef}
        onScroll={handleScroll}
        style={{
          maxHeight: 320,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: 8,
          background: t.surfaceMuted,
          border: `1px solid ${t.border}`,
          borderRadius: 8,
        }}
      >
        {loading && messages.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 16, color: t.muted }}>
            <Loader2 size={16} className="spin" />
          </div>
        ) : messages.length === 0 ? (
          <div style={{ padding: 12, color: t.muted, fontSize: 13, textAlign: 'center' }}>
            {emptyHint ??
              (role === 'admin'
                ? 'No replies yet. Send the first response to the customer.'
                : 'An admin will reply here. You can also send a follow-up.')}
          </div>
        ) : (
          messages.map((m) => {
            const isOwn = m.author_role === role
            const align: 'flex-end' | 'flex-start' = isOwn ? 'flex-end' : 'flex-start'
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: align,
                  gap: 2,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    color: t.muted,
                  }}
                >
                  {m.author_role === 'admin' ? (
                    <ShieldCheck size={11} style={{ color: t.accent }} />
                  ) : (
                    <UserIcon size={11} />
                  )}
                  <span style={{ fontWeight: 600 }}>{authorName(m)}</span>
                  <span>· {formatRelative(m.created_at)}</span>
                </div>
                <div
                  style={{
                    background: isOwn ? t.ownBubble : t.otherBubble,
                    color: isOwn ? t.ownText : t.otherText,
                    border: `1px solid ${isOwn ? t.ownBubble : t.border}`,
                    borderRadius: 10,
                    padding: '8px 12px',
                    maxWidth: '85%',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: 13,
                    lineHeight: 1.4,
                  }}
                >
                  {m.body}
                </div>
              </div>
            )
          })
        )}
      </div>

      {error && (
        <div style={{ color: '#ef4444', fontSize: 12 }}>{error}</div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
          borderTop: `1px solid ${t.border}`,
          paddingTop: 10,
        }}
      >
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 4000))}
          placeholder={role === 'admin' ? 'Reply to the customer…' : 'Send a follow-up to support…'}
          rows={2}
          disabled={sending}
          style={{
            flex: 1,
            resize: 'vertical',
            minHeight: 56,
            maxHeight: 160,
            background: t.surfaceMuted,
            color: t.text,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            padding: '8px 10px',
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 13,
            outline: 'none',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void handleSend()
            }
          }}
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!canSend}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            background: canSend ? t.accent : t.surfaceMuted,
            color: canSend ? t.ownText : t.muted,
            border: `1px solid ${canSend ? t.accent : t.border}`,
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 13,
            cursor: canSend ? 'pointer' : 'not-allowed',
            whiteSpace: 'nowrap',
          }}
        >
          {sending ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
          {role === 'admin' ? 'Reply' : 'Send'}
        </button>
      </div>
    </div>
  )
}
