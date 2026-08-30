/**
 * Shared type definitions for the LS Customs frontend.
 * Extracted from App.tsx to avoid circular imports.
 */
import type { ReactNode, ComponentType } from 'react'

export type View = 'home' | 'rentals' | 'services' | 'bookings' | 'profile'

export type AuthMode = 'sign-in' | 'create-account'

export interface Vehicle {
  name: string
  detail: string
  price: string
  image: string
  tag: string
  rating: string
}

export interface Service {
  name: string
  category: string
  price: string
  duration: string
  icon: ReactNode
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
