/**
 * ChatBot — floating AI assistant widget for LS Customs.
 * Calls the `chatbot` Edge Function (OpenRouter-backed) for customer
 * support via the Supabase `functions.invoke` API.
 *
 * Only rendered for signed-in users (see App.tsx). Guest users never
 * see or mount this component.
 */
import { useState, useRef, useEffect } from 'react'
import { MessageCircle, Send, X, Sparkles, RefreshCw, TicketPlus, Loader2, AlertCircle } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import type { ChatMessage, ChatBotProps } from '../../types'
import { TicketForm, TicketSuccess } from './TicketForm'
import { TicketThread } from '../common/TicketThread'

const WELCOME_MESSAGE =
  "Hi! I'm the LS Customs Assistant. How can I help you today with car rentals, vehicle bookings, or mobile mechanic services?"

const QUICK_SUGGESTIONS = [
  "🚗 Help me rent a car",
  "🔧 Need a mobile mechanic",
  "💰 Rates & pricing",
  "📍 Pickup locations",
  "🎫 Create support ticket",
]

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

export function ChatBot({ userId, onNotify }: ChatBotProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | undefined>(undefined)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [ticketId, setTicketId] = useState<string | null>(null)
  const [showTicketStatus, setShowTicketStatus] = useState(false)
  const [ticketFormOpen, setTicketFormOpen] = useState(false)
  // When true, the overlay shows the live thread instead of the form/success.
  // Set after the success card's Done button is clicked.
  const [ticketThreadOpen, setTicketThreadOpen] = useState(false)
  const [ticketResult, setTicketResult] = useState<{
    id: string
    tracking_number: string
    category: string
    priority: string
    status: string
    created_at: string
  } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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
    setConversationId(undefined)
    setMessages([
      {
        role: 'assistant',
        content: WELCOME_MESSAGE,
        timestamp: Date.now(),
      },
    ])
  }

  const sendMessage = async (customText?: string) => {
    const textToSend = (customText ?? input).trim()
    if (!textToSend || loading) return

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
      // Send conversation history so LLM retains context
      const chatHistory = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const { data, error } = await supabase.functions.invoke('chatbot', {
        body: {
          message: textToSend,
          messages: chatHistory,
          conversation_id: conversationId,
          user_id: userId,
        },
      })

      // The edge function returns JSON with { data: { reply, conversation_id, ... }, error: null }
      const resPayload = (data as { data?: { reply?: string; conversation_id?: string }; reply?: string; conversation_id?: string } | null)?.data ?? data

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

      // Handle ticket creation response
      if (resPayload?.ticket_created && resPayload?.ticket_id) {
        setTicketId(resPayload.ticket_id)
        setShowTicketStatus(true)
      }

      if (resPayload?.conversation_id && !conversationId) {
        setConversationId(resPayload.conversation_id)
      }

      if (!botReply) {
        const fallbackMsg = "I'm here to help with all LS Customs car rentals and mobile mechanic services! How can I assist you today?"
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: fallbackMsg, timestamp: Date.now() },
        ])
        return
      }

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: botReply, timestamp: Date.now() },
      ])
    } catch {
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
      setLoading(false)
    }
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
              <button className="chat-action-btn" onClick={() => setTicketFormOpen(true)} title="Create support ticket" aria-label="Create ticket">
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

          {ticketFormOpen ? (
            <div className="chat-ticket-overlay">
              {ticketThreadOpen && ticketResult ? (
                // Live thread: replaces the success card after the customer
                // clicks Done. Same overlay surface, same close behavior.
                <ThreadOverlay
                  ticketId={ticketResult.id}
                  trackingNumber={ticketResult.tracking_number}
                  onClose={() => {
                    setTicketThreadOpen(false)
                    setTicketResult(null)
                    setTicketFormOpen(false)
                  }}
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
                    onNotify(`Ticket ${result.tracking_number} submitted`)
                  }}
                />
              )}
            </div>
          ) : null}

          <div className="chat-messages">
            {showTicketStatus && ticketId && (
              <div className="chat-message assistant ticket-status">
                <div className="chat-bubble ticket-status-bubble">
                  <div className="ticket-status-header">
                    <TicketPlus size={16} />
                    <span className="ticket-status-title">Support Ticket Created</span>
                  </div>
                  <div className="ticket-status-id">Ticket ID: <strong>{ticketId.slice(0, 8)}...</strong></div>
                  <div className="ticket-status-note">An admin will review your request and respond. You can ask me for updates on this ticket.</div>
                  <button className="ticket-status-close" onClick={() => setShowTicketStatus(false)} aria-label="Dismiss ticket status">
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`chat-message ${msg.role === 'user' ? 'user' : 'assistant'}`}
              >
                <div className="chat-bubble">
                  <FormattedMessage text={msg.content} />
                </div>
                <div className="chat-time">
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            ))}

            {loading && (
              <div className="chat-message assistant">
                <div className="chat-bubble typing-dots">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}

            {messages.length === 1 && !loading && (
              <div className="chat-suggestions">
                <p className="chat-suggestions-title">Quick actions:</p>
                <div className="chat-chips-grid">
                  {QUICK_SUGGESTIONS.map((suggestion, idx) => (
                    <button
                      key={idx}
                      className="chat-chip"
                      onClick={() => void sendMessage(suggestion.replace(/^[^\s]+\s/, ''))}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
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
              placeholder="Ask about rentals, bookings, services..."
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
        </div>
      )}
    </div>
  )
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
  onError,
}: {
  ticketId: string
  trackingNumber: string
  onClose: () => void
  onError: (message: string) => void
}) {
  return (
    <div className="ticket-form">
      <div className="ticket-form-header">
        <div className="ticket-form-title">
          <TicketPlus size={16} />
          <span>Ticket {trackingNumber}</span>
        </div>
        <button
          type="button"
          className="chat-close"
          onClick={onClose}
          aria-label="Close ticket thread"
        >
          <X size={16} />
        </button>
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