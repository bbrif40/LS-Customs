/**
 * Documentation content — sections and articles for the
 * /docs landing page.
 */
import type { DocArticle } from '../types'

export const DOC_CATEGORIES: { id: string; label: string; description: string }[] = [
  {
    id: 'getting-started',
    label: 'Getting Started',
    description: 'Set up your account, profile, and first booking.',
  },
  {
    id: 'rentals',
    label: 'Rentals',
    description: 'Browse, book, extend, and return vehicles.',
  },
  {
    id: 'mechanic',
    label: 'Mobile Mechanic',
    description: 'Book, track, and manage mobile service appointments.',
  },
  {
    id: 'bookings',
    label: 'Bookings & History',
    description: 'View past services, receipts, and booking status.',
  },
  {
    id: 'account',
    label: 'Account',
    description: 'Profile settings, vehicles, passwords, and data.',
  },
  {
    id: 'billing',
    label: 'Billing',
    description: 'Payments, refunds, invoices, and pricing.',
  },
]

export const DOC_ARTICLES: Record<string, DocArticle[]> = {
  'getting-started': [
    {
      id: 'create-account',
      title: 'Creating Your Account',
      description: 'Sign up with email, Google, or Apple in under a minute.',
      category: 'Getting Started',
      href: '/docs/getting-started/create-account',
    },
    {
      id: 'first-rental',
      title: 'Your First Rental Booking',
      description: 'Step-by-step guide to browsing, selecting, and confirming your first vehicle.',
      category: 'Getting Started',
      href: '/docs/getting-started/first-rental',
    },
    {
      id: 'first-service',
      title: 'Your First Mobile Service',
      description: 'How to schedule a mechanic, set your location, and prepare for arrival.',
      category: 'Getting Started',
      href: '/docs/getting-started/first-service',
    },
  ],
  rentals: [
    {
      id: 'browse-vehicles',
      title: 'Browsing and Filtering Vehicles',
      description: 'Use categories, price ranges, and features to find the right car.',
      category: 'Rentals',
      href: '/docs/rentals/browse-vehicles',
    },
    {
      id: 'pickup-dropoff',
      title: 'Pickup and Drop-off Process',
      description: 'What to bring, where to go, and how to inspect your vehicle.',
      category: 'Rentals',
      href: '/docs/rentals/pickup-dropoff',
    },
    {
      id: 'extend-rental',
      title: 'Extending a Rental Booking',
      description: 'How to extend your rental and what pricing applies.',
      category: 'Rentals',
      href: '/docs/rentals/extend-rental',
    },
  ],
  mechanic: [
    {
      id: 'service-categories',
      title: 'Service Categories & Pricing',
      description: 'Oil changes, brake service, diagnostics, and more — with typical prices.',
      category: 'Mobile Mechanic',
      href: '/docs/mechanic/service-categories',
    },
    {
      id: 'scheduling',
      title: 'Scheduling Your Appointment',
      description: 'Choose a date, time slot, and service address on the interactive calendar.',
      category: 'Mobile Mechanic',
      href: '/docs/mechanic/scheduling',
    },
    {
      id: 'live-tracking',
      title: 'Using Live Tracking',
      description: 'Follow your mechanic\'s real-time location on the map.',
      category: 'Mobile Mechanic',
      href: '/docs/mechanic/live-tracking',
    },
  ],
  bookings: [
    {
      id: 'view-bookings',
      title: 'Viewing Your Bookings',
      description: 'Find, filter, and search past and upcoming bookings.',
      category: 'Bookings & History',
      href: '/docs/bookings/view-bookings',
    },
    {
      id: 'download-receipt',
      title: 'Downloading Receipts',
      description: 'Access and print your booking receipts as PDF.',
      category: 'Bookings & History',
      href: '/docs/bookings/download-receipt',
    },
  ],
  account: [
    {
      id: 'manage-vehicles',
      title: 'Managing Your Vehicles',
      description: 'Add, edit, or remove vehicles from your account.',
      category: 'Account',
      href: '/docs/account/manage-vehicles',
    },
    {
      id: 'update-profile',
      title: 'Updating Your Profile',
      description: 'Change your name, email, phone, and address.',
      category: 'Account',
      href: '/docs/account/update-profile',
    },
  ],
  billing: [
    {
      id: 'payment-methods',
      title: 'Payment Methods',
      description: 'Adding, removing, and managing saved payment cards.',
      category: 'Billing',
      href: '/docs/billing/payment-methods',
    },
    {
      id: 'invoice-export',
      title: 'Exporting Invoices',
      description: 'Generate and export invoices for business or tax records.',
      category: 'Billing',
      href: '/docs/billing/invoice-export',
    },
  ],
}
