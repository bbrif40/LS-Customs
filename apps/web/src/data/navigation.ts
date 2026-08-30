/**
 * Navigation items for the sidebar.
 * Shared between the authenticated workspace and guest views.
 */
import { Home, CarFront, Wrench, ClipboardList, UserRound } from 'lucide-react'
import type { NavItem } from '../types'

export const navItems: NavItem[] = [
  { id: 'home', label: 'Workspace', icon: Home },
  { id: 'rentals', label: 'Rentals', icon: CarFront },
  { id: 'services', label: 'Mechanic', icon: Wrench },
  { id: 'bookings', label: 'Bookings', icon: ClipboardList },
  { id: 'profile', label: 'Profile', icon: UserRound },
]
