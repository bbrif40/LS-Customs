/**
 * PublicLayout — shell for public-facing content pages (Help Center, Contact,
 * Legal, FAQs, Documentation). Renders a lightweight header with nav links,
 * the page content, the ChatBot floating widget, and a footer with legal links.
 *
 * Unlike the customer workspace layout, this shell does NOT include the
 * sidebar, topbar notifications, or mobile nav. Designed for unauthenticated
 * users who land here via deep links (e.g. /terms, /privacy, /faqs).
 */
import type { ReactNode } from 'react'
import { ChatBot } from '../chat/ChatBot'
import type { PublicView } from '../../types'

interface PublicLayoutProps {
  publicView: PublicView
  children: ReactNode
}

const PUBLIC_NAV: { id: PublicView; label: string; href: string }[] = [
  { id: 'help', label: 'Help Center', href: '/help' },
  { id: 'contact', label: 'Contact Support', href: '/contact' },
  { id: 'terms', label: 'Terms of Service', href: '/terms' },
  { id: 'privacy', label: 'Privacy Policy', href: '/privacy' },
  { id: 'faqs', label: 'FAQs', href: '/faqs' },
  { id: 'docs', label: 'Documentation', href: '/docs' },
]

export function PublicLayout({ publicView, children }: PublicLayoutProps) {
  const navigatePublic = (href: string) => {
    window.location.href = href
  }

  return (
    <div className="public-layout">
      <header className="public-header">
        <a href="/" className="brand" onClick={() => navigatePublic('/')}>
          <span className="brand-spark">✳</span>
          <span>LS Customs</span>
        </a>
        <nav className="public-nav">
          {PUBLIC_NAV.map(({ id, label, href }) => (
            <a
              key={id}
              href={href}
              className={publicView === id ? 'active' : ''}
              onClick={(e) => {
                e.preventDefault()
                navigatePublic(href)
              }}
            >
              {label}
            </a>
          ))}
        </nav>
      </header>

      <main className="public-main">{children}</main>

      <ChatBot userId={undefined} onNotify={() => {}} />

      <footer className="public-footer">
        <div className="footer-brand">
          <span className="brand-spark">✳</span>
          <strong>LS Customs</strong>
        </div>
        <div className="footer-links">
          <a href="/help">Help Center</a>
          <a href="/contact">Contact Support</a>
          <a href="/docs">Documentation</a>
          <a href="/terms">Terms of Service</a>
          <a href="/privacy">Privacy Policy</a>
          <a href="/faqs">FAQs</a>
        </div>
        <small className="footer-copy">
          © 2024 LS Customs. All rights reserved.
        </small>
      </footer>
    </div>
  )
}
