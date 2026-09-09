/**
 * Shared type definitions for the LS Customs frontend.
 * Extracted from App.tsx to avoid circular imports.
 */
import type { ReactNode, ComponentType } from 'react'

export type View = 'home' | 'rentals' | 'services' | 'bookings' | 'profile'

export type AuthMode = 'sign-in' | 'create-account'

export interface Vehicle {
  id: string
  category: 'short_term' | 'extended' | 'premium'
  name: string
  detail: string
  price: string
  pricePerDay: number
  image: string
  tag: string
  rating: string
  galleryImages?: string[]
  location?: string
  description?: string
  hostName?: string
  hostRating?: string
  features?: string[]
  rentalRules?: string[]
  mileagePolicy?: string
  maxTrip?: string
  deliveryMethods?: string[]
}

export interface Service {
  name: string
  category: string
  price: string
  duration: string
  icon: ReactNode
  /** Optional DB id, populated when the row came from Supabase. */
  id?: string
  /** Price stored as integer cents to avoid float math. */
  priceCents?: number
  /** Duration stored as integer minutes for scheduling. */
  durationMinutes?: number
}

/** A single booking created by the MechanicBookingFlow. */
export interface ServiceBooking {
  id: string
  serviceName: string
  servicePrice: string
  scheduledAt: string
  addressLine1: string
  addressCity: string
  status: 'pending' | 'confirmed' | 'assigned' | 'en_route' | 'in_progress' | 'completed' | 'cancelled'
}

export interface CustomerNotification {
  id: string
  type: string | null
  title: string
  body: string | null
  metadata: NotificationMetadata
  is_read: boolean
  created_at: string
}

/**
 * Notification metadata shapes produced by backend triggers and edge
 * functions. The customer-app renderer uses these to pick the right icon
 * and route the click to the matching view.
 *
 *   booking_status_changed   — notify_on_status_change on vehicle/service
 *                                booking status updates.
 *   ticket_admin_reply       — admin posts a message on the customer's
 *                                ticket (notify_on_ticket_admin_reply).
 *   ticket_status_changed    — ticket moved to resolved/closed
 *                                (notify_on_ticket_status_change).
 *   payment_status_changed   — payment moved to succeeded/failed
 *                                (notify_on_payment_status_change).
 */
export interface NotificationMetadata {
  booking_id?: string
  booking_type?: 'vehicle' | 'service'
  old_status?: string
  new_status?: string
  customer_id?: string
  scheduled_at?: string
  /** Populated on the customer's "mechanic assigned" notification (see
   *  notify_on_status_change in 20260902160000_assignment_notification_metadata.sql). */
  mechanic_id?: string
  mechanic_name?: string
  mechanic_phone?: string
  ticket_id?: string
  tracking_number?: string
  subject?: string
  message_id?: string
  author_id?: string
  payment_id?: string
  amount?: number
  currency?: string
  provider?: string
  [key: string]: unknown
}

export interface NavItem {
  id: View
  label: string
  icon: ComponentType<Record<string, unknown>>
}

export interface UserIdentity {
  displayName: string
  displayEmail: string
  initials: string
  avatarUrl: string | null
}

export interface PageHeadingProps {
  eyebrow: string
  title: string
  detail: string
  action?: ReactNode
}

/**
 * A single chat message exchanged with the LS Customs AI assistant.
 * Used by the ChatBot floating widget to render message history.
 */
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface ChatBotProps {
  userId: string | undefined
  onNotify: (message: string) => void
}
