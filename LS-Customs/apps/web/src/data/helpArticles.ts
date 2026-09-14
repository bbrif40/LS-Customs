/**
 * Help Center articles and category data.
 * Each article has a placeholder href — real articles would route to
 * /help/<category>/<article-slug>.
 */
import type { HelpArticle } from '../types'

export const HELP_CATEGORIES: { id: string; label: string; description: string; icon: string; href: string }[] = [
  {
    id: 'rentals',
    label: 'Rentals',
    description: 'Booking, extending, and returning vehicle rentals.',
    icon: 'car',
    href: '/help#rentals',
  },
  {
    id: 'mechanic',
    label: 'Mobile Mechanic',
    description: 'Scheduling, tracking, and service guarantees.',
    icon: 'wrench',
    href: '/help#mechanic',
  },
  {
    id: 'bookings',
    label: 'Bookings',
    description: 'Checking status, rescheduling, and receipts.',
    icon: 'clipboard',
    href: '/help#bookings',
  },
  {
    id: 'account',
    label: 'Account',
    description: 'Profile, passwords, vehicles, and privacy.',
    icon: 'user',
    href: '/help#account',
  },
  {
    id: 'billing',
    label: 'Billing',
    description: 'Payments, refunds, and pricing questions.',
    icon: 'credit',
    href: '/help#billing',
  },
  {
    id: 'troubleshooting',
    label: 'Troubleshooting',
    description: 'App issues, login problems, and error messages.',
    icon: 'bug',
    href: '/help#troubleshooting',
  },
]

export const POPULAR_ARTICLES: HelpArticle[] = [
  {
    id: 'tracking-mechanic',
    title: 'Tracking your mobile mechanic in real time',
    description: 'Use the live map and status notifications to follow your mechanic from arrival.',
    category: 'Mobile Mechanic',
    href: '/help/articles/mechanic-tracking',
  },
  {
    id: 'cancel-rental',
    title: 'How to cancel a rental booking',
    description: 'Free cancellation up to 24 hours before pickup. See extended rental policies.',
    category: 'Rentals',
    href: '/help/articles/cancel-rental',
  },
  {
    id: 'reschedule-service',
    title: 'Rescheduling your service appointment',
    description: 'Move your booking up to 12 hours ahead. Emergency reschedule fees apply.',
    category: 'Mobile Mechanic',
    href: '/help/articles/reschedule-service',
  },
  {
    id: 'payment-failed',
    title: 'Fixing a failed or declined payment',
    description: 'Common reasons payments don\'t go through and how to retry.',
    category: 'Billing',
    href: '/help/articles/payment-failed',
  },
]
