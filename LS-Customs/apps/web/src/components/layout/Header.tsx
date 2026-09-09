/**
 * Header — top bar with mobile menu toggle, breadcrumb, notifications, and user chip.
 */
import { useState } from 'react'
import { Bell, Check, ChevronRight, Menu, CarFront, Wrench, TicketPlus, CreditCard, BellRing } from 'lucide-react'
import { navItems } from '../../data/navigation'
import type { CustomerNotification, View } from '../../types'
import { useCustomerNotifications } from '../../hooks/useCustomerNotifications'

interface HeaderProps {
  view: View
  menuOpen: boolean
  displayName: string
  initials: string
  avatarUrl?: string | null
  onToggleMenu: () => void
  onView: (view: View) => void
  onNotify: (message: string) => void
  userId: string | undefined
  /** Carries the booking id from a notification click so Bookings can
   *  auto-expand the matching card. */
  onSelectBooking?: (id: string) => void
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'pending',
  confirmed: 'confirmed',
  assigned: 'assigned',
  en_route: 'on the way',
  in_progress: 'in progress',
  completed: 'completed',
  cancelled: 'cancelled',
}

/**
 * One notification row. Picks an icon and a friendly summary based on
 * the notification's `type` and `metadata` (which the DB trigger
 * `notify_on_status_change` populates with booking_type + old/new status).
 *
 * Click → mark as read + jump to the most relevant view.
 */
function NotificationItem({
  item,
  onMarkAsRead,
  onView,
  onNotify,
  onSelectBooking,
}: {
  item: CustomerNotification
  onMarkAsRead: (id: string) => Promise<void>
  onView: (view: View) => void
  onNotify: (message: string) => void
  onSelectBooking?: (id: string) => void
}) {
  const type = item.type ?? ''
  const meta = item.metadata ?? {}

  // Icon + destination per notification type. The booking-related types
  // are the ones the backend currently emits; ticket/payment are reserved
  // for future events and fall through to a generic bell.
  let Icon: typeof Bell = Bell
  let destination: View | null = 'bookings'
  let detail = item.body ?? ' '
  // The booking_id is in metadata for booking_status_changed; the
  // Bookings view needs it to deep-link to the matching card.
  const bookingId = typeof meta.booking_id === 'string' ? meta.booking_id : null

  if (type === 'booking_status_changed') {
    if (meta.booking_type === 'vehicle') {
      Icon = CarFront
    } else if (meta.booking_type === 'service') {
      Icon = Wrench
    } else {
      Icon = BellRing
    }
    // The trigger now produces a rich body for assigned / completed /
    // cancelled. Prefer that server-side copy when present, and only
    // fall back to the bare "Service update — in progress" line for
    // transitions we haven't enriched yet (e.g. en_route, in_progress).
    const richBody = typeof item.body === 'string' ? item.body.trim() : ''
    if (richBody && !richBody.toLowerCase().startsWith('your service booking status changed')
        && !richBody.toLowerCase().startsWith('your rental booking status changed')
        && !richBody.toLowerCase().startsWith('your vehicle booking status changed')) {
      detail = richBody
    } else if (meta.new_status === 'assigned' && typeof meta.mechanic_name === 'string') {
      const kind = meta.booking_type === 'service' ? 'Service' : 'Rental'
      detail = `${kind} assigned to ${meta.mechanic_name}`
    } else {
      const newStatus = STATUS_LABELS[String(meta.new_status ?? '')] ?? String(meta.new_status ?? '')
      const kind = meta.booking_type === 'service' ? 'Service' : 'Rental'
      detail = `${kind} update — ${newStatus}`
    }
    destination = 'bookings'
  } else if (type === 'ticket_admin_reply') {
    Icon = TicketPlus
    // Backend metadata carries tracking_number + subject. Show the
    // ticket id (or tracking number) so the customer has a hook to
    // remember which conversation this is.
    const tracking = String(meta.tracking_number ?? '')
    detail = tracking ? `Reply on ticket ${tracking}` : 'New reply on your support ticket'
    destination = 'bookings' // no dedicated ticket inbox in the customer shell yet
  } else if (type === 'ticket_status_changed') {
    Icon = TicketPlus
    const tracking = String(meta.tracking_number ?? '')
    const newStatus = String(meta.new_status ?? '')
    if (newStatus === 'resolved') {
      detail = tracking ? `Ticket ${tracking} resolved` : 'Your ticket was marked resolved'
    } else if (newStatus === 'closed') {
      detail = tracking ? `Ticket ${tracking} closed` : 'Your ticket was closed'
    } else {
      detail = item.body ?? ' '
    }
    destination = 'bookings'
  } else if (type === 'payment_status_changed') {
    Icon = CreditCard
    const newStatus = String(meta.new_status ?? '')
    if (newStatus === 'succeeded') {
      detail = 'Payment confirmed — your booking is locked in'
    } else if (newStatus === 'failed') {
      detail = 'Payment did not go through — try again from Bookings'
    } else {
      detail = item.body ?? ' '
    }
    destination = 'bookings'
  } else if (type.startsWith('ticket') || type.startsWith('payment')) {
    // Future-proof slot for related notification types we haven't
    // enumerated yet (e.g. payment_refunded, ticket_reopened).
    Icon = type.startsWith('payment') ? CreditCard : TicketPlus
    detail = item.body ?? ' '
    destination = 'bookings'
  }

  const handleClick = () => {
    void onMarkAsRead(item.id)
    if (destination) onView(destination)
    // Deep-link to the matching booking card on the Bookings tab. Only
    // for booking notifications that actually carry a booking_id.
    if (bookingId && onSelectBooking) onSelectBooking(bookingId)
    onNotify(item.title)
  }

  return (
    <button
      className={`notification-item ${item.is_read ? '' : 'unread'}`}
      type="button"
      onClick={handleClick}
    >
      <span className="notification-icon" aria-hidden="true">
        <Icon size={15} />
      </span>
      <span className="notification-text">
        <strong>{item.title}</strong>
        <span>{detail}</span>
        <small>{new Date(item.created_at).toLocaleString()}</small>
      </span>
    </button>
  )
}

export function Header({ view, menuOpen, displayName, initials, avatarUrl, onToggleMenu, onView, onNotify, userId, onSelectBooking }: HeaderProps) {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useCustomerNotifications(userId, 'panel')
  const [open, setOpen] = useState(false)
  return (
    <header className="topbar">
      <button className="mobile-menu" onClick={onToggleMenu} aria-label="Open menu">
        <Menu size={21} />
      </button>
      <div className="breadcrumb">
        <span>My workspace</span>
        <ChevronRight size={15} />
        <strong>{navItems.find((item) => item.id === view)?.label}</strong>
      </div>
      <div className="top-actions">
        <button className="icon-button" onClick={() => setOpen((value) => !value)} aria-label="Notifications">
          <Bell size={19} />
          {unreadCount > 0 && <i />}
        </button>
        {open && (
          <div className="notification-panel" role="dialog" aria-label="Notifications">
            <div className="notification-head">
              <strong>Notifications</strong>
              {unreadCount > 0 && (
                <button onClick={() => void markAllAsRead()}>
                  <Check size={14} /> Mark all read
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <p className="muted">No notifications yet.</p>
            ) : (
              notifications.map((item) => (
                <NotificationItem
                  key={item.id}
                  item={item}
                  onMarkAsRead={markAsRead}
                  onView={(v) => {
                    onView(v)
                    setOpen(false)
                  }}
                  onNotify={onNotify}
                  onSelectBooking={onSelectBooking}
                />
              ))
            )}
          </div>
        )}
        <button className="user-chip" onClick={() => onView('profile')}>
          {avatarUrl && <span className="avatar"><img src={avatarUrl} alt="" /></span>}
          <span>{displayName}</span>
          <ChevronRight size={15} />
        </button>
      </div>
    </header>
  )
}
