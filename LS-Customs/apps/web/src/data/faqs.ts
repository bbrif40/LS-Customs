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
    answer: 'Choose a vehicle, pickup and return times, and online or cash payment. Upload your driver’s license in the payment section for admin review. Approval opens online payment for three hours or confirms a cash reservation, payable before handover.',
    category: 'rentals',
  },
  {
    id: 'rental-2',
    question: 'What is the cancellation policy for rentals?',
    answer: 'Prepaid rentals cancelled before handover receive a full refund after admin approval. Confirmed cash rentals cannot be cancelled by customers; contact support. Early returns have no automatic refund.',
    category: 'rentals',
  },
  {
    id: 'rental-3',
    question: 'Can I extend my rental after pickup?',
    answer: 'Request an extension from your booking before the original return deadline. Availability, license validity, admin approval and payment must be secured before that deadline. Each started extra 24 hours costs the current daily rate.',
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
    answer: 'Open booking-linked support. If approved extra work is declined and the original service cannot proceed, the mechanic escalates the issue for admin review. Refunds depend on the booking stage and reviewed outcome.',
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
    answer: 'During travel, the map shows actual mechanic GPS. A location older than 60 seconds is marked last seen and has no ETA. GPS availability depends on device permissions and connectivity.',
    category: 'mechanic',
  },

  // ── Billing ──
  {
    id: 'billing-1',
    question: 'What payment methods do you accept?',
    answer: 'Choose online payment through the methods available at checkout or cash. Rental cash is collected before handover; mechanic cash is due after service. Admins can also record cash payments toward account balances.',
    category: 'billing',
  },
  {
    id: 'billing-2',
    question: 'When will I be charged for my booking?',
    answer: 'Online mechanic checkout opens immediately after a mechanic accepts, with a ten-minute hold. Online rental payment is due within three hours of license approval. A processing payment cannot be switched to cash.',
    category: 'billing',
  },
  {
    id: 'billing-3',
    question: 'Why was I charged more than expected?',
    answer: 'Late rental return costs PHP250 per completed late hour. Unpaid late fees block new rentals immediately, flag the account after 24 hours, and add PHP1000 at 48 hours and each full day thereafter until fully settled or waived. Approved extras and finalized damage charges appear in your account balance.',
    category: 'billing',
  },
  {
    id: 'billing-4',
    question: 'How do I get a refund?',
    answer: 'Submit a cancellation request from the booking. Paid mechanic refunds are 100% before travel, 45% during travel before work, and support-reviewed after work starts. Prepaid rental cancellation before handover is fully refunded. Provider cancellation or a declined provider time change is fully refunded. Provider confirmation and settlement timing appear separately from approval.',
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
    answer: 'Request a new time from your booking before travel. Your original appointment stays active until a mechanic accepts the replacement and any price difference is secured. You can decline a provider-proposed time change for a full refund.',
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
    answer: 'Coverage initially follows a 100 km radius centered on Manila, reaching north into Bulacan and south through Cavite. Your map pin must be within the current service radius; operating hours and mechanic availability also apply.',
    category: 'general',
  },
  {
    id: 'general-2',
    question: 'How do I contact support?',
    answer: 'Open support from the relevant booking to include its context. Scheduled and roadside services initially operate 8 AM–6 PM Philippine time, subject to current configured hours.',
    category: 'general',
  },
  {
    id: 'general-3',
    question: 'Is there a mobile app?',
    answer: 'Yes — LS Customs is available as a Progressive Web App (install from your browser) and on iOS and Android. Search "LS Customs" in your app store or add to Home Screen for the full experience.',
    category: 'general',
  },
]
