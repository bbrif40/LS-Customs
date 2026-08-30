/**
 * ChatBot — floating AI assistant widget for LS Customs.
 * Calls the `chatbot` Edge Function (OpenRouter-backed) for customer
 * support via the Supabase `functions.invoke` API.
 *
 * Only rendered for signed-in users (see App.tsx). Guest users never
 * see or mount this component.
 */
import { useState, useRef, useEffect } from 'react'
import { MessageCircle, Send, X } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import type { ChatMessage, ChatBotProps } from '../../types'

const WELCOME_MESSAGE =
  "Hi! I'm the LS Customs assistant. How can I help you with rentals, bookings, or mobile mechanic services today?"

export function ChatBot({ userId, onNotify }: ChatBotProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | undefined>(undefined)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

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

  const sendMessage = async () => {
    const trimmed = input.trim()
    if (!trimmed || loading) return

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: trimmed, timestamp: Date.now() },
    ])
    setInput('')
    setLoading(true)

    try {
      const { data, error } = await supabase.functions.invoke('chatbot', {
        body: {
          message: trimmed,
          conversation_id: conversationId,
          user_id: userId,
        },
      })

      if (error || !data) {
        onNotify(error?.message || 'Something went wrong')
        return
      }

      if (data.conversation_id && !conversationId) {
        setConversationId(data.conversation_id)
      }

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.reply, timestamp: Date.now() },
      ])
    } catch {
      onNotify('Failed to send message')
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
        <button className="chat-toggle" onClick={toggleOpen} aria-label="Open chat">
          <MessageCircle size={24} />
        </button>
      )}

      {open && (
        <div className="chat-window">
          <div className="chat-header">
            <h3>LS Customs Assistant</h3>
            <button className="chat-close" onClick={closeChat} aria-label="Close chat">
              <X size={16} />
            </button>
          </div>

          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`chat-message ${msg.role === 'user' ? 'user' : 'assistant'}`}
              >
                <div className="chat-bubble">
                  {msg.content}
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
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-row">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about rentals, bookings, services..."
              disabled={loading}
              aria-label="Chat message"
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
