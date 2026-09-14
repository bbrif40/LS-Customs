/**
 * Legal document content for Terms of Service and Privacy Policy pages.
 * Placeholder text — replace with final legal copy from the legal team.
 */
import type { LegalSection } from '../types'

export const TERMS_LAST_UPDATED = 'September 14, 2026'

export const PRIVACY_LAST_UPDATED = 'September 14, 2026'

export const termsSections: LegalSection[] = [
  {
    id: 'acceptance',
    title: 'Acceptance of Terms',
    level: 2,
    content: `By accessing or using the LS Customs platform, mobile application, or any related services (collectively, the "Services"), you agree to be bound by these Terms of Service. If you do not agree with any part of these terms, you may not use the Services. These Terms constitute a legally binding agreement between you and LS Customs LLC.`,
  },
  {
    id: 'services',
    title: 'Our Services',
    level: 2,
    content: `LS Customs provides a platform connecting vehicle owners with certified mobile mechanics and rental services. We facilitate bookings, payments, and communication, but all service providers are independent contractors. We do not directly perform automotive services.`,
  },
  {
    id: 'eligibility',
    title: 'Eligibility',
    level: 3,
    content: `You must be at least 18 years old and capable of forming a binding contract to use the Services. By using the Services, you represent and warrant that you meet these requirements.`,
  },
  {
    id: 'account',
    title: 'User Account',
    level: 2,
    content: `To access certain features, you must create an account. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. Notify us immediately of any unauthorized use of your account.`,
  },
  {
    id: 'payment',
    title: 'Payment & Billing',
    level: 2,
    content: `Service bookings require valid payment information. Charges are processed through our secure payment provider. All fees are non-refundable unless otherwise stated. You authorize us to charge your payment method for any bookings you confirm.`,
  },
  {
    id: 'cancellation',
    title: 'Cancellation & Refunds',
    level: 2,
    content: `Cancellations are subject to our policy displayed at the time of booking. Refunds, if applicable, are processed within 7-10 business days. Certain premium and extended rentals may have different cancellation windows.`,
  },
  {
    id: 'prohibited',
    title: 'Prohibited Conduct',
    level: 2,
    content: `You agree not to: (a) misuse the Services; (b) attempt to gain unauthorized access; (c) scrape or harvest data; (d) interfere with the Services' functionality; (e) impersonate any person or entity; (f) post content that is defamatory, obscene, or infringing.`,
  },
  {
    id: 'ip',
    title: 'Intellectual Property',
    level: 2,
    content: `The Services and all content, trademarks, logos, and IP displayed are owned by LS Customs LLC or its licensors. You may not use, reproduce, or distribute any content without prior written permission.`,
  },
  {
    id: 'warranty',
    title: 'Warranty Disclaimer',
    level: 2,
    content: `THE SERVICES ARE PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY KIND. WE DO NOT WARRANT THAT THE SERVICES WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE. WE DO NOT ENDORSE OR GUARANTEE THE QUALITY OF INDEPENDENT SERVICE PROVIDERS.`,
  },
  {
    id: 'liability',
    title: 'Limitation of Liability',
    level: 2,
    content: `TO THE MAXIMUM EXTENT PERMITTED BY LAW, LS CUSTOMS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS OR DATA, ARISING OUT OF OR IN CONNECTION WITH THE SERVICES. OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID TO US IN THE 12 MONTHS PRECEDING THE CLAIM.`,
  },
  {
    id: 'termination',
    title: 'Termination',
    level: 2,
    content: `We may suspend or terminate your account at any time, with or without cause, with or without notice. Upon termination, your right to use the Services will cease immediately.`,
  },
  {
    id: 'governing',
    title: 'Governing Law',
    level: 2,
    content: `These Terms are governed by the laws of the State of California, without regard to conflict of law principles. Any disputes shall be resolved in the federal or state courts located in San Francisco, California.`,
  },
  {
    id: 'changes',
    title: 'Changes to Terms',
    level: 2,
    content: `We may update these Terms from time to time. The "Last Updated" date at the top reflects the most recent revision. Continued use of the Services after changes constitutes acceptance of the new terms.`,
  },
]

export const privacySections: LegalSection[] = [
  {
    id: 'info-collected',
    title: 'Information We Collect',
    level: 2,
    content: `We collect information you provide directly to us (name, email, phone, address, payment info), information collected automatically through your device and usage (IP address, browser type, pages visited), and information from third parties (such as when you link your account to a service provider). We use this data to provide, improve, and secure the Services.`,
  },
  {
    id: 'how-we-use',
    title: 'How We Use Your Information',
    level: 2,
    content: `We use your information to: provide and maintain the Services; process and manage your bookings; communicate with you (including booking confirmations, updates, and support replies); personalize your experience; perform analytics; send you marketing communications (you may opt out at any time); and comply with legal obligations.`,
  },
  {
    id: 'sharing',
    title: 'Data Sharing & Disclosure',
    level: 2,
    content: `We do not sell your personal data. We may share information with: trusted service providers who assist us (payment processors, cloud hosting, analytics); independent mechanics and rental hosts (only the minimum needed to fulfill your booking); law enforcement or regulatory bodies when required by law; and in connection with a merger or acquisition. All parties are contractually bound to protect your data.`,
  },
  {
    id: 'rights',
    title: 'Your Rights & Choices',
    level: 2,
    content: `You have the right to: access, correct, or delete your personal data; opt out of marketing communications; and object to or restrict certain processing. To exercise these rights, contact us via the Help Center or email privacy@lscustoms.com. You may also export a copy of your data through your account settings.`,
  },
  {
    id: 'cookies',
    title: 'Cookies & Tracking',
    level: 2,
    content: `We use cookies and similar tracking technologies to operate the Services, remember your preferences, and analyze usage. This includes essential cookies (required for login and security) and analytics cookies (Google Analytics, Plausible). You can control cookies via your browser settings, though this may limit functionality.`,
  },
  {
    id: 'retention',
    title: 'Data Retention',
    level: 2,
    content: `We retain your personal data for as long as necessary to provide the Services and fulfill the purposes outlined in this policy. Business booking records are retained for 7 years for tax purposes. If you request deletion, we will remove your data within 30 days, subject to legal retention requirements.`,
  },
  {
    id: 'security',
    title: 'Security',
    level: 2,
    content: `We implement industry-standard technical and organizational measures to protect your data, including encryption in transit and at rest, secure infrastructure, and regular security audits. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.`,
  },
  {
    id: 'international',
    title: 'International Transfers',
    level: 2,
    content: `Your information may be transferred to and processed in countries outside your residence, including the United States. By using the Services, you consent to such transfers. We rely on appropriate safeguards (such as standard contractual clauses) where required by law.`,
  },
  {
    id: 'third-party',
    title: 'Third-Party Services',
    level: 2,
    content: `The Services may contain links to third-party websites, apps, or services (such as Google Maps, payment providers, or social media plugins). This policy does not apply to those services. We recommend reviewing the privacy policies of any third-party services you interact with.`,
  },
  {
    id: 'children',
    title: "Children's Privacy",
    level: 2,
    content: `The Services are not intended for individuals under 16 years of age. We do not knowingly collect personal data from children. If we discover that we have collected data from a child, we will promptly delete it.`,
  },
  {
    id: 'changes-privacy',
    title: 'Changes to This Policy',
    level: 2,
    content: `We may update this Privacy Policy from time to time. The "Last Updated" date at the top will reflect any changes. For material changes, we will notify you via email or through the Services. Your continued use after changes constitutes acceptance.`,
  },
  {
    id: 'contact-privacy',
    title: 'Contact Us',
    level: 2,
    content: `For questions about this Privacy Policy or your data, please contact our Data Protection Officer at privacy@lscustoms.com or via our Help Center.`,
  },
]
