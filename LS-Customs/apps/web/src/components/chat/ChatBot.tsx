/**
 * ChatBot — floating AI assistant widget for LS Customs.
 * Calls the `chatbot` Edge Function (OpenRouter-backed) for customer
 * support via the Supabase `functions.invoke` API.
 *
 * Rendered for signed-in users and on public content pages. Recommendation
 * actions are delegated to the parent so it can apply the right access flow.
 */
import { useState, useRef, useEffect } from 'react'
import { MessageCircle, Send, X, Sparkles, RefreshCw, TicketPlus } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import type { ChatMessage, ChatBotProps, ChatPlannerMode, ChatRecommendation } from '../../types'
import { TicketForm, TicketSuccess } from './TicketForm'
import { TicketThread } from '../common/TicketThread'
import { PlannerItinerary, PlannerModeBar, PlannerModePicker, PlannerRecommendations } from './PlannerExperience'
import './planner.css'

const WELCOME_MESSAGE =
  "Hi! I can help plan a trip and find a rental vehicle, or talk through car symptoms and suggest a service. Choose a starting point, then share whatever details you have."

const MODE_PROMPTS: Record<ChatPlannerMode, string> = {
  trip: "I'm planning a trip and need help with an itinerary and rental vehicle.",
  diagnosis: "I have a car problem and would like help understanding what service may be useful.",
}

interface ChatbotResponse {
  reply?: string
  conversation_id?: string
  ticket_form_requested?: boolean
  recommendations?: unknown
  itinerary?: unknown
}

/**
 * Format markdown-like text (bullet points, bold text, newlines) safely for display
 */
function FormattedMessage({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="chat-formatted-content">
      {lines.map((line, lineIdx) => {
        if (!line.trim()) {
          return <div key={lineIdx} className="chat-line-break" />
        }

        // Format bold text **word**
        const parts = line.split(/(\*\*.*?\*\*)/g)
        const parsedLine = parts.map((part, partIdx) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={partIdx}>{part.slice(2, -2)}</strong>
          }
          return part
        })

        if (line.trim().startsWith('- ') || line.trim().startsWith('• ')) {
          return (
            <div key={lineIdx} className="chat-bullet-item">
              <span className="bullet-dot">•</span>
              <span>{parsedLine}</span>
            </div>
          )
        }

        return <p key={lineIdx} className="chat-paragraph">{parsedLine}</p>
      })}
    </div>
  )
}

interface TicketSession {
  id: string
  tracking_number: string
  category: string
  priority: string
  status: string
  created_at: string
}

export function ChatBot({ userId, onNotify, onRecommendation }: ChatBotProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | undefined>(undefined)
  const [mode, setMode] = useState<ChatPlannerMode | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [ticketFormOpen, setTicketFormOpen] = useState(false)
  // The active ticket lives in sessionStorage: closing the chat or changing
  // pages rejoins the same thread, and closing the browser tab ends it.
  const ticketStorageKey = `ls-ticket-session:${userId ?? 'guest'}`
  const [ticketResult, setTicketResult] = useState<TicketSession | null>(() => {
    try { return JSON.parse(sessionStorage.getItem(ticketStorageKey) ?? 'null') as TicketSession | null }
    catch { return null }
  })
  // When true, the overlay shows the live thread instead of the form/success.
  // Set after the success card's Done button is clicked.
  const [ticketThreadOpen, setTicketThreadOpen] = useState(() => ticketResult !== null)

  useEffect(() => {
    try {
      if (ticketResult) sessionStorage.setItem(ticketStorageKey, JSON.stringify(ticketResult))
      else sessionStorage.removeItem(ticketStorageKey)
    } catch { /* Storage can be unavailable; the ticket stays usable until reload. */ }
  }, [ticketResult, ticketStorageKey])

  const minimizeTicket = () => {
    setTicketThreadOpen(true)
    setTicketFormOpen(false)
  }

  const endTicketSession = () => {
    setTicketThreadOpen(false)
    setTicketResult(null)
  }
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const requestVersionRef = useRef(0)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    if (open) {
      scrollToBottom()
      inputRef.current?.focus()
    }
  }, [messages, open])

  const toggleOpen = () => {
    setOpen(true)
    // Only seed the welcome message on the very first open — never on re-open,
    // so the conversation is preserved when the widget is minimized.
    if (messages.length === 0) {
      setMessages([
        {
          role: 'assistant',
          content: WELCOME_MESSAGE,
          timestamp: Date.now(),
        },
      ])
    }
  }

  const closeChat = () => {
    setOpen(false)
  }

  const resetChat = () => {
    requestVersionRef.current += 1
    setLoading(false)
    setInput('')
    setMode(null)
    setConversationId(undefined)
    setMessages([
      {
        role: 'assistant',
        content: WELCOME_MESSAGE,
        timestamp: Date.now(),
      },
    ])
  }

  const sendMessage = async (customText?: string, modeOverride?: ChatPlannerMode) => {
    const textToSend = (customText ?? input).trim()
    if (!textToSend || loading) return
    const requestVersion = ++requestVersionRef.current
    const requestMode = modeOverride ?? mode

    const userMsg: ChatMessage = {
      role: 'user',
      content: textToSend,
      timestamp: Date.now(),
    }

    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    if (!customText) {
      setInput('')
    }
    setLoading(true)

    try {
      // Keep enough context for longer planning and revisions; the backend
      // also caps the total history size before sending it to the model.
      const chatHistory = updatedMessages.slice(-32).map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const { data, error } = await supabase.functions.invoke('chatbot', {
        body: {
          message: textToSend,
          messages: chatHistory,
          conversation_id: conversationId,
          user_id: userId,
          mode: requestMode ?? undefined,
        },
      })

      if (requestVersionRef.current !== requestVersion) return

      // Supabase may wrap the worker result in `data`; accept both forms.
      const response = data as { data?: ChatbotResponse } & ChatbotResponse | null
      const resPayload = response?.data ?? response

      if (error && !resPayload?.reply) {
        // If error response from Edge Function
        const fallbackMsg = "I'm having a quick connection issue reaching the assistance server. Please try again or reach out to our service team!"
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: fallbackMsg, timestamp: Date.now() },
        ])
        onNotify(error.message || 'Error communicating with assistant')
        return
      }

      const botReply = resPayload?.reply?.trim()
      const recommendations = parseRecommendations(resPayload?.recommendations)
      const itinerary = parseItinerary(resPayload?.itinerary)

      // The assistant may open the existing form after an explicit request;
      // ticket creation still happens only when the customer submits it.
      if (resPayload?.ticket_form_requested) {
        // An active ticket is rejoined rather than replaced.
        setTicketFormOpen(true)
      }

      if (resPayload?.conversation_id && resPayload.conversation_id !== conversationId) {
        setConversationId(resPayload.conversation_id)
      }

      if (!botReply) {
        const fallbackMsg = "I'm here to help with all LS Customs car rentals and mobile mechanic services! How can I assist you today?"
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: fallbackMsg, timestamp: Date.now(), recommendations, itinerary },
        ])
        return
      }

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: botReply, timestamp: Date.now(), recommendations, itinerary },
      ])
    } catch {
      if (requestVersionRef.current !== requestVersion) return
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: "Sorry, I ran into a problem connecting to the support service. Please try asking again in a moment.",
          timestamp: Date.now(),
        },
      ])
      onNotify('Failed to reach assistant')
    } finally {
      if (requestVersionRef.current === requestVersion) setLoading(false)
    }
  }

  const startMode = (selectedMode: ChatPlannerMode) => {
    setMode(selectedMode)
    void sendMessage(MODE_PROMPTS[selectedMode], selectedMode)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !loading && input.trim()) {
      void sendMessage()
    }
  }

  return (
    <div className="chat-widget">
      {!open && (
        <button className="chat-toggle" onClick={toggleOpen} aria-label="Open LS Customs Assistant">
          <MessageCircle size={26} />
          <span className="chat-toggle-badge">AI</span>
        </button>
      )}

      {open && (
        <div className="chat-window">
          <div className="chat-header">
            <div className="chat-header-info">
              <div className="chat-header-avatar">
                <Sparkles size={16} />
              </div>
              <div>
                <h3>LS Customs Assistant</h3>
                <span className="chat-header-status">Online • 24/7 Support</span>
              </div>
            </div>
            <div className="chat-header-actions">
              <button
                className={`chat-action-btn${ticketFormOpen ? ' active' : ''}`}
                onClick={() => setTicketFormOpen((prev) => !prev)}
                title={ticketFormOpen ? "Return to chat" : ticketResult ? "Return to your ticket" : "Create support ticket"}
                aria-label={ticketFormOpen ? "Return to chat" : ticketResult ? "Return to your ticket" : "Create support ticket"}
              >
                <TicketPlus size={14} />
              </button>
              <button className="chat-action-btn" onClick={resetChat} title="Reset conversation" aria-label="Reset chat">
                <RefreshCw size={14} />
              </button>
              <button className="chat-close" onClick={closeChat} aria-label="Close chat">
                <X size={18} />
              </button>
            </div>
          </div>

          {mode && !ticketFormOpen && (
            <PlannerModeBar mode={mode} onChange={resetChat} />
          )}

          {ticketFormOpen ? (
            <div className="chat-ticket-overlay">
              {ticketThreadOpen && ticketResult ? (
                // Live thread: replaces the success card after the customer
                // clicks Done. Same overlay surface, same close behavior.
                <ThreadOverlay
                  ticketId={ticketResult.id}
                  trackingNumber={ticketResult.tracking_number}
                  onClose={minimizeTicket}
                  onNewTicket={endTicketSession}
                  onError={(message) => onNotify(message)}
                />
              ) : ticketResult ? (
                <TicketSuccess
                  result={{
                    id: ticketResult.id,
                    tracking_number: ticketResult.tracking_number,
                    category: ticketResult.category as 'general' | 'rental' | 'billing' | 'bug' | 'mechanic' | 'other',
                    priority: ticketResult.priority as 'low' | 'medium' | 'high' | 'critical',
                    status: ticketResult.status,
                    created_at: ticketResult.created_at,
                  }}
                  onClose={() => {
                    // Collapse success card into the live thread view.
                    setTicketThreadOpen(true)
                  }}
                  onDismiss={minimizeTicket}
                  onCopy={(text) => {
                    void navigator.clipboard.writeText(text).then(
                      () => onNotify(`Copied ${text}`),
                      () => onNotify('Could not copy to clipboard'),
                    )
                  }}
                />
              ) : (
                <TicketForm
                  onClose={() => setTicketFormOpen(false)}
                  onError={(message) => onNotify(message)}
                  onSubmitted={(result) => {
                    setTicketResult(result)
                    const formatted = result.tracking_number.startsWith('ticket-')
                      ? result.tracking_number
                      : `ticket-${(result.id || result.tracking_number).slice(0, 8).toLowerCase()}`
                    onNotify(`Ticket ${formatted} submitted`)
                  }}
                />
              )}
            </div>
          ) : (
            <>
              <div className="chat-messages" role="log" aria-live="polite" aria-label="Assistant conversation" aria-relevant="additions">
                {messages.map((msg, i) => (
                  <div
                    key={`${msg.timestamp}-${i}`}
                    className={`chat-message ${msg.role === 'user' ? 'user' : 'assistant'}`}
                  >
                    <div className="chat-bubble">
                      <FormattedMessage text={msg.content} />
                    </div>
                    {msg.role === 'assistant' && msg.itinerary && (
                      <PlannerItinerary itinerary={msg.itinerary} variant="message" />
                    )}
                    {msg.role === 'assistant' && msg.recommendations && (
                      <PlannerRecommendations
                        recommendations={msg.recommendations}
                        mode={mode}
                        hideNestedItinerary={Boolean(msg.itinerary)}
                        onSelect={(recommendation) => {
                          closeChat()
                          onRecommendation?.(recommendation)
                        }}
                      />
                    )}
                    <div className="chat-time">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="chat-message assistant" role="status" aria-label="Assistant is preparing a reply">
                    <div className="chat-bubble typing-dots">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                )}

                {mode === null && messages.length === 1 && (
                  <PlannerModePicker disabled={loading} onChoose={startMode} />
                )}

                <div ref={messagesEndRef} />
              </div>

              <div className="chat-input-row">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  aria-label="Chat input field"
                  onKeyDown={handleKeyDown}
                  placeholder={mode === 'trip'
                    ? 'Add your destination, dates, or group size...'
                    : mode === 'diagnosis'
                      ? 'Describe the symptoms you noticed...'
                      : 'Choose a guide above or ask a question...'}
                  disabled={loading}
                />
                <button
                  className="chat-send"
                  onClick={() => void sendMessage()}
                  disabled={loading || !input.trim()}
                  aria-label="Send message"
                >
                  <Send size={16} />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function parseRecommendations(value: unknown): ChatRecommendation[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item): ChatRecommendation[] => {
    if (!isRecord(item)
      || (item.kind !== 'vehicle' && item.kind !== 'service')
      || typeof item.id !== 'string'
      || typeof item.title !== 'string'
      || typeof item.reason !== 'string') {
      return []
    }

    const recommendation: ChatRecommendation = {
      kind: item.kind,
      id: item.id,
      title: item.title,
      reason: item.reason,
    }

    if (typeof item.price === 'number' && Number.isFinite(item.price)) {
      recommendation.price = item.price
    }
    if (item.currency === 'PHP') recommendation.currency = item.currency
    if (isRecord(item.dates)
      && typeof item.dates.start === 'string'
      && typeof item.dates.end === 'string') {
      recommendation.dates = { start: item.dates.start, end: item.dates.end }
    }
    if (item.availability_status === 'available_for_dates' || item.availability_status === 'not_checked') {
      recommendation.availability_status = item.availability_status
    }
    if (typeof item.checked_at === 'string') recommendation.checked_at = item.checked_at
    const itinerary = parseItinerary(item.itinerary)
    if (itinerary) recommendation.itinerary = itinerary

    return [recommendation]
  })
}

function parseItinerary(value: unknown): ChatRecommendation['itinerary'] {
  if (!isRecord(value) || typeof value.title !== 'string' || !Array.isArray(value.days)) return undefined

  const days = value.days.slice(0, 30).flatMap((day): NonNullable<ChatRecommendation['itinerary']>['days'] => {
    if (!isRecord(day)
      || typeof day.day !== 'number'
      || !Number.isInteger(day.day)
      || day.day < 1
      || typeof day.title !== 'string'
      || !Array.isArray(day.activities)) {
      return []
    }
    return [{
      day: day.day,
      title: day.title.slice(0, 160),
      activities: day.activities
        .slice(0, 12)
        .filter((activity): activity is string => typeof activity === 'string')
        .map((activity) => activity.slice(0, 280)),
    }]
  })

  return days.length > 0 ? { title: value.title.slice(0, 160), days } : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * ThreadOverlay — wraps TicketThread with a small header (tracking # +
 * close button) so the customer sees a familiar surface when the success
 * card collapses into the live thread. Sits inside chat-ticket-overlay.
 */
function ThreadOverlay({
  ticketId,
  trackingNumber,
  onClose,
  onNewTicket,
  onError,
}: {
  ticketId: string
  trackingNumber: string
  onClose: () => void
  onNewTicket: () => void
  onError: (message: string) => void
}) {
  return (
    <div className="ticket-form">
      <div className="ticket-form-header">
        <div className="ticket-form-title">
          <TicketPlus size={16} />
          <span>{trackingNumber.startsWith('ticket-') ? trackingNumber : `ticket-${trackingNumber.slice(0, 8).toLowerCase()}`}</span>
        </div>
        <div className="chat-header-actions">
          <button type="button" className="chat-action-btn" onClick={onNewTicket} title="Start a new ticket" aria-label="Start a new ticket">
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            className="chat-close"
            onClick={onClose}
            aria-label="Minimize ticket thread"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      <p className="ticket-form-subtitle">
        You're now in a live conversation with LS Customs Support. New
        messages will appear here automatically.
      </p>
      <TicketThread
        ticketId={ticketId}
        role="customer"
        onError={onError}
        theme={{
          // Match the chatbot surface — slightly lighter than the admin panel.
          surface: 'transparent',
          surfaceMuted: '#f5f5f7',
          text: '#1a1a1a',
          muted: '#6b7280',
          border: '#e5e7eb',
          ownBubble: '#1f2937',
          ownText: '#ffffff',
          otherBubble: '#ffffff',
          otherText: '#1a1a1a',
          accent: '#e8a838',
        }}
      />
    </div>
  )
}
