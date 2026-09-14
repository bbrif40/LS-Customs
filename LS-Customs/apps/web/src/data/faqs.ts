/**
 * FAQ data for the Frequently Asked Questions page.
 * Each question is tagged by category for filtering.
 */
import type { FaqItem } from '../types'

export const faqItems: FaqItem[] = [
  // ── Rentals ──
  {
    id: 'rental-1',
    question: 'How do I book a rental vehicle?',
    answer: 'Browse vehicles on the Rentals page, select your preferred car, choose pickup and drop-off dates, and confirm with a valid payment method. You’ll receive an instant confirmation with pickup instructions.',
    category: 'rentals',
  },
  {
    id: 'rental-2',
    question: 'What is the cancellation policy for rentals?',
    answer: 'Free cancellation is available up to 24 hours before pickup for short-term rentals. Extended and premium rentals may have different windows shown at checkout. Refunds are processed within 7–10 business days.',
    category: 'rentals',
  },
  {
    id: 'rental-3',
    question: 'Can I extend my rental after pickup?',
    answer: 'Yes — use the "Extend Booking" button in the Bookings section. If your vehicle is available, you can extend in 24-hour increments up to 14 days. Pricing is prorated.',
    category: 'rentals',
  },
  {
    id: 'rental-4',
    question: 'What mileage is included with rentals?',
    answer: 'All rentals include unlimited kilometers. Fuel is not included — you return the vehicle with the same fuel level as pickup, or we charge a refueling fee.',
    category: 'rentals',
  },
  {
    id: 'rental-5',
    question: 'Where do I pick up my rental vehicle?',
    answer: 'Pick-up is at your selected LS Customs location or our partner facilities. You’ll receive the exact address and meeting instructions in your confirmation email.',
    category: 'rentals',
  },

  // ── Mechanic ──
  {
    id: 'mechanic-1',
    question: 'How does the mobile mechanic service work?',
    answer: 'Book a service on the Mechanic page, select your location on the map, choose a time slot, and a certified mechanic will arrive at your address. You can track their arrival in real time through the app.',
    category: 'mechanic',
  },
  {
    id: 'mechanic-2',
    question: 'How far in advance should I book a mechanic?',
    answer: 'We recommend booking at least 24 hours ahead for standard services. Same-day appointments are available for emergency repairs, subject to technician availability in your area.',
    category: 'mechanic',
  },
  {
    id: 'mechanic-3',
    question: 'What if the mechanic can’t fix my issue?',
    answer: 'All our mechanics come with a 30-day workmanship guarantee. If there’s a problem with the service, contact us within 30 days and we’ll make it right or provide a full refund.',
    category: 'mechanic',
  },
  {
    id: 'mechanic-4',
    question: 'Do I need to provide tools or parts?',
    answer: 'No — the mechanic brings all necessary tools and supplies. If a part is needed, they’ll let you know its cost before ordering. You only pay for parts used plus the service fee.',
    category: 'mechanic',
  },
  {
    id: 'mechanic-5',
    question: 'Can I track my mechanic\'s arrival?',
    answer: 'Yes — once a mechanic is assigned, you’ll see them on the live map in the app. You’ll get status updates: dispatched, en route, and arrived.',
    category: 'mechanic',
  },

  // ── Billing ──
  {
    id: 'billing-1',
    question: 'What payment methods do you accept?',
    answer: 'We accept Visa, Mastercard, American Express, Discover, Apple Pay, and Google Pay. All payments are processed securely through PCI-compliant partners.',
    category: 'billing',
  },
  {
    id: 'billing-2',
    question: 'When will I be charged for my booking?',
    answer: 'Your payment method is charged at the time of booking confirmation. For rentals, a temporary hold for the estimated total is placed until completion. Final charges reflect any adjustments.',
    category: 'billing',
  },
  {
    id: 'billing-3',
    question: 'Why was I charged more than expected?',
    answer: 'Additional charges may apply for late returns, fuel top-ups, tolls, or cleaning fees. You’ll receive an itemized receipt via email after completion. If you have questions, contact our billing team.',
    category: 'billing',
  },
  {
    id: 'billing-4',
    question: 'How do I get a refund?',
    answer: 'Refunds are processed automatically to the original payment method within 7–10 business days of approval. You’ll receive an email confirmation when the refund is initiated.',
    category: 'billing',
  },
  {
    id: 'billing-5',
    question: 'Can I update my payment method?',
    answer: 'Yes — go to Profile → Payment Methods to add, remove, or set a new primary payment method. Changes apply to future bookings only.',
    category: 'billing',
  },

  // ── Account ──
  {
    id: 'account-1',
    question: 'How do I update my profile?',
    answer: 'Go to Profile in your workspace. Click "Edit" to update your name, phone number, address, or profile photo. Changes save automatically.',
    category: 'account',
  },
  {
    id: 'account-2',
    question: 'How do I reset my password?',
    answer: 'Click "Forgot password" on the sign-in screen. We’ll email a reset link that expires in 24 hours. If you use Google Sign-In, manage your password through your Google account.',
    category: 'account',
  },
  {
    id: 'account-3',
    question: 'Can I have multiple vehicles on my account?',
    answer: 'Yes — add vehicles in Profile → My Vehicles. Each vehicle can have its own service history, and you can set a default for new bookings.',
    category: 'account',
  },
  {
    id: 'account-4',
    question: 'How do I close my account?',
    answer: 'Contact our support team through the Help Center or live chat. We’ll verify your identity and process the closure within 30 days. Some data may be retained for legal or accounting purposes.',
    category: 'account',
  },

  // ── Bookings ──
  {
    id: 'bookings-1',
    question: 'How do I check my booking status?',
    answer: 'Your bookings appear in the Bookings section of your workspace. Each card shows the current status: confirmed, assigned, en route, in progress, or completed.',
    category: 'bookings',
  },
  {
    id: 'bookings-2',
    question: 'Can I message my mechanic directly?',
    answer: 'Yes — once a mechanic is assigned to your service booking, a chat thread opens on the booking card. You’ll also get real-time status notifications.',
    category: 'bookings',
  },
  {
    id: 'bookings-3',
    question: 'What if I need to reschedule my mechanic?',
    answer: 'Use the "Reschedule" button on your booking card up to 12 hours before the scheduled time. Availability may vary. Emergency changes within 12 hours incur a $25 fee.',
    category: 'bookings',
  },
  {
    id: 'bookings-4',
    question: 'Do I receive a receipt for my booking?',
    answer: 'Yes — an itemized receipt is emailed to you upon completion. You can also download receipts from the Bookings section at any time.',
    category: 'bookings',
  },

  // ── General ──
  {
    id: 'general-1',
    question: 'What areas do you serve?',
    answer: 'We currently serve the San Francisco Bay Area, Los Angeles, San Diego, and Seattle. Check our coverage map on the website — enter your ZIP code to see if service is available in your neighborhood.',
    category: 'general',
  },
  {
    id: 'general-2',
    question: 'How do I contact support?',
    answer: 'Visit the Contact Support page for our hours and channels. You can also use the live chat widget (bottom-right corner) for fastest response. Emergency roadside assistance is available 24/7 for signed-in users.',
    category: 'general',
  },
  {
    id: 'general-3',
    question: 'Is there a mobile app?',
    answer: 'Yes — LS Customs is available as a Progressive Web App (install from your browser) and on iOS and Android. Search "LS Customs" in your app store or add to Home Screen for the full experience.',
    category: 'general',
  },
]
