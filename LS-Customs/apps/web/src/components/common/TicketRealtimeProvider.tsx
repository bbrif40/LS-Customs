/**
 * TicketRealtimeProvider — one Supabase Realtime channel per signed-in
 * session, scoped to support_ticket_messages.
 *
 * The provider keeps a single postgres_changes subscription open for the
 * lifetime of the user's session ("always on while signed in"). Per-ticket
 * hooks register a handler with the provider via useTicketRealtime();
 * the provider dispatches incoming INSERT events to the handler(s) for
 * the matching ticket_id.
 *
 * Customer vs admin: the channel filter is different.
 *   - customer: filter by `customer_id=eq.<userId>` so the customer only
 *     gets events for their own tickets (and RLS further restricts the
 *     actual rows the realtime gateway exposes).
 *   - admin: no filter; admins see all tickets.
 *
 * RLS is honored by the Realtime gateway — a customer cannot receive
 * events for tickets they cannot SELECT.
 */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react'
import { supabase } from '../../supabaseClient'
import type { TicketMessageAuthor } from '../../hooks/useAdminData'

type InsertHandler = (row: TicketMessageRow) => void

interface TicketMessageRow {
  id: string
  ticket_id: string
  author_id: string
  author_role: TicketMessageAuthor
  body: string
  created_at: string
}

interface ProviderState {
  // Register a handler for a ticket. The returned function unregisters it.
  // Multiple handlers per ticket are allowed (e.g., if two components
  // happen to mount the same ticket thread).
  register: (ticketId: string, handler: InsertHandler) => () => void
  // Whether the provider is currently subscribed (false when the user
  // isn't signed in or the channel hasn't connected yet).
  isConnected: boolean
}

const Ctx = createContext<ProviderState | null>(null)

interface ProviderProps {
  userId: string | null
  userRole: TicketMessageAuthor | 'admin'
  children: ReactNode
}

export function TicketRealtimeProvider({ userId, userRole, children }: ProviderProps) {
  // handlersRef: ticket_id -> Set of handler functions. We use a ref so
  // registering/unregistering doesn't cause re-renders; the channel
  // effect below only depends on userId/userRole.
  const handlersRef = useRef<Map<string, Set<InsertHandler>>>(new Map())
  const isConnectedRef = useRef(false)
  // Mirror the latest connection state into a ref we can read from the
  // context value without triggering effect deps.
  const connectedTickRef = useRef(0)

  useEffect(() => {
    if (!userId) return

    const filter =
      userRole === 'admin' ? undefined : `customer_id=eq.${userId}`

    const channel = supabase
      .channel(`ticket-messages:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_ticket_messages',
          ...(filter ? { filter } : {}),
        },
        (payload) => {
          const row = payload.new as TicketMessageRow
          if (!row || !row.ticket_id) return
          const handlers = handlersRef.current.get(row.ticket_id)
          if (!handlers) return
          for (const h of handlers) {
            try {
              h(row)
            } catch {
              // handler errors should not break the channel
            }
          }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          isConnectedRef.current = true
          connectedTickRef.current++
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          isConnectedRef.current = false
          connectedTickRef.current++
        }
      })

    return () => {
      void supabase.removeChannel(channel)
      isConnectedRef.current = false
    }
  }, [userId, userRole])

  const register = (ticketId: string, handler: InsertHandler) => {
    let set = handlersRef.current.get(ticketId)
    if (!set) {
      set = new Set()
      handlersRef.current.set(ticketId, set)
    }
    set.add(handler)
    return () => {
      const s = handlersRef.current.get(ticketId)
      if (!s) return
      s.delete(handler)
      if (s.size === 0) handlersRef.current.delete(ticketId)
    }
  }

  // Note: we read the latest isConnected via a tick ref so the context
  // value's identity changes on subscribe/unsubscribe but the value is
  // always current.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value: ProviderState = { register, isConnected: isConnectedRef.current }
  // Re-derive value when the connected state changes
  void connectedTickRef.current

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTicketRealtimeContext(): ProviderState {
  const ctx = useContext(Ctx)
  if (!ctx) {
    throw new Error('useTicketRealtimeContext must be used inside <TicketRealtimeProvider>')
  }
  return ctx
}

/**
 * useTicketRealtime — register a handler for a single ticket's INSERTs.
 * Used internally by useTicketMessages to receive new rows in real time.
 */
export function useTicketRealtime(
  ticketId: string | null,
  handler: InsertHandler | null,
) {
  const ctx = useTicketRealtimeContext()
  useEffect(() => {
    if (!ticketId || !handler) return
    return ctx.register(ticketId, handler)
  }, [ctx, ticketId, handler])
}
