import { useWebsiteText } from "../../hooks/useWebsiteText"
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
import type { PublicView, ChatRecommendation } from '../../types'
import { navigateTo } from '../../utils/navigation'
import { usePageSlide } from '../../hooks/usePageSlide'

interface PublicLayoutProps {
  publicView: PublicView
  children: ReactNode
  onRecommendation?: (recommendation: ChatRecommendation) => void
}

const PUBLIC_NAV: { id: PublicView; label: string; href: string }[] = [
  { id: 'help', label: 'Help Center', href: '/help' },
  { id: 'contact', label: 'Contact Support', href: '/contact' },
  { id: 'terms', label: 'Terms of Service', href: '/terms' },
  { id: 'privacy', label: 'Privacy Policy', href: '/privacy' },
  { id: 'faqs', label: 'FAQs', href: '/faqs' },
  { id: 'docs', label: 'Documentation', href: '/docs' },
]

export function PublicLayout({ publicView, children, onRecommendation }: PublicLayoutProps) {
  const websiteText = useWebsiteText("Shared")

  const pageSlideRef = usePageSlide(PUBLIC_NAV.findIndex(item => item.id === publicView), ':scope > *')
  return (
    <div className="public-layout">
      <header className="public-header">
        <a
          href="/"
          className="brand"
          onClick={(e) => {
            e.preventDefault()
            navigateTo('/')
          }}
        >
          <img
            src="/logo.png"
            alt={websiteText("LS Customs")}
            style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }}
          />
          <span>{websiteText("LS Customs")}</span>
        </a>
        <nav className="public-nav">
          {PUBLIC_NAV.map(({ id, label, href }) => (
            <a
              key={id}
              href={href}
              className={publicView === id ? 'active' : ''}
              onClick={(e) => {
                e.preventDefault()
                navigateTo(href)
              }}
            >
              {websiteText(label)}
            </a>
          ))}
        </nav>
      </header>

      <main className="public-main" ref={pageSlideRef}>{children}</main>

      <ChatBot userId={undefined} onNotify={() => {}} onRecommendation={onRecommendation} />

      <footer className="public-footer">
        <div className="footer-brand">
          <img
            src="/logo.png"
            alt={websiteText("LS Customs")}
            style={{ width: 24, height: 24, objectFit: 'contain', flexShrink: 0 }}
          />
          <strong>{websiteText("LS Customs")}</strong>
        </div>
        <div className="footer-links">
          {PUBLIC_NAV.map(({ id, label, href }) => (
            <a
              key={id}
              href={href}
              onClick={(e) => {
                e.preventDefault()
                navigateTo(href)
              }}
            >
              {websiteText(label)}
            </a>
          ))}
        </div>
        <small className="footer-copy">{websiteText("© 2024 LS Customs. All rights reserved.")}</small>
      </footer>
    </div>
  )
}
