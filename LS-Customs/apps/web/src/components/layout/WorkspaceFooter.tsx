import { useWebsiteText } from "../../hooks/useWebsiteText"
/**
 * WorkspaceFooter — sleek multi-column typographic footer with subtle line icons.
 * Includes newsletter signup, service navigation, and contact details.
 */

import { Mail, MapPin, Phone, Clock, Facebook, Twitter, Linkedin, Instagram } from 'lucide-react'
import { NewsletterForm } from './NewsletterForm'
import { navigateTo } from '../../utils/navigation'
import { useCustomerSiteSettings } from '../../hooks/useCustomerSiteSettings'
import type { View } from '../../types'

interface WorkspaceFooterProps {
  onNotify?: (message: string) => void
  onView?: (view: View) => void
  onEmergencyClick?: () => void
}

export function WorkspaceFooter({ onNotify, onView, onEmergencyClick }: WorkspaceFooterProps) {
  const websiteText = useWebsiteText("Footer")

  const { settings } = useCustomerSiteSettings()
  const supportEmail = websiteText("concierge@lscustoms.com", undefined, settings.supportEmail || 'concierge@lscustoms.com')
  const supportPhone = websiteText("+63 (02) 8888-5700", undefined, settings.supportPhone || '+63 (02) 8888-5700')
  const address = websiteText("100 Portola Drive, Rockford Hills, Los Santos", undefined, settings.address || '100 Portola Drive, Rockford Hills, Los Santos')
  const workingHours = websiteText("Open 24/7 for Emergency Dispatch · Showroom 8AM – 9PM", undefined, settings.workingHours || 'Open 24/7 for Emergency Dispatch · Showroom 8AM – 9PM')

  const handleNav = (targetView: View) => {
    // If user is currently on a public page (/help, /contact, /terms, etc.), return to app frame
    const path = window.location.pathname
    if (path.startsWith('/help') || path.startsWith('/contact') || path.startsWith('/terms') || path.startsWith('/privacy') || path.startsWith('/faqs') || path.startsWith('/docs')) {
      window.history.pushState({}, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    }


    if (onView) {
      onView(targetView)
      window.history.pushState({}, '', targetView === 'home' ? '/' : `/${targetView}`)
    } else {
      navigateTo(targetView === 'home' ? '/' : `/${targetView}`)
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleEmergency = () => {
    if (onEmergencyClick) {
      onEmergencyClick()
    } else if (onView) {
      onView('services')
    } else {
      navigateTo('/services')
    }
  }

  return (
    <footer
      className="workspace-footer"
      style={{
        display: 'block',
        width: '100%',
        padding: '52px 6% 32px',
        background: '#ffffff',
        color: '#64748b',
        borderTop: '1px solid #e2e8f0',
        boxSizing: 'border-box',
        fontFamily: 'inherit',
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 40,
          alignItems: 'start',
        }}
      >
        {/* ── Column 1: Brand & Tagline ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 300 }}>
          <button type="button"
            onClick={() => handleNav('home')}
            style={{
              border: 0, padding: 0, background: 'none', textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <img
              src="/logo.png"
              alt={websiteText("LS Customs", undefined, settings.companyName || 'LS Customs')}
              style={{ width: 28, height: 28, objectFit: 'contain' }}
            />
            <span
              style={{
                fontSize: 17,
                fontWeight: 800,
                letterSpacing: '0.04em',
                color: '#0f172a',
                textTransform: 'uppercase',
              }}
            >
              {websiteText("LS CUSTOMS", undefined, settings.companyName || 'LS CUSTOMS')}
            </span>
          </button>
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.65,
              color: '#64748b',
              margin: 0,
            }}
          >
            {websiteText("Elevate your automotive experience with LS Customs, your premier gateway to bespoke vehicle service, precision tuning, and elite concierge dispatch.", undefined, settings.heroSubtitle ||
              'Elevate your automotive experience with LS Customs, your premier gateway to bespoke vehicle service, precision tuning, and elite concierge dispatch.')}
          </p>
        </div>

        <NewsletterForm />

        {/* ── Column 3: Services (Functional Booking & SOS Triggers) ─── */}
        <div>
          <h4
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#0f172a',
              margin: '0 0 16px',
              letterSpacing: '0.01em',
            }}
          >{websiteText("Services")}</h4>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 11,
              fontSize: 13,
            }}
          >
            <li>
              <button type="button"
                onClick={() => handleNav('services')}
                style={{ border: 0, padding: 0, background: 'none', font: 'inherit', textAlign: 'left', cursor: 'pointer', color: '#64748b', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
              >{websiteText("Performance & ECU Tuning")}</button>
            </li>
            <li>
              <button type="button"
                onClick={() => handleNav('services')}
                style={{ border: 0, padding: 0, background: 'none', font: 'inherit', textAlign: 'left', cursor: 'pointer', color: '#64748b', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
              >{websiteText("Custom Bodywork & Paint")}</button>
            </li>
            <li>
              <button type="button"
                onClick={() => handleNav('services')}
                style={{ border: 0, padding: 0, background: 'none', font: 'inherit', textAlign: 'left', cursor: 'pointer', color: '#64748b', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
              >{websiteText("Suspension & Precision Alignment")}</button>
            </li>
            <li>
              <button type="button"
                onClick={() => handleNav('services')}
                style={{ border: 0, padding: 0, background: 'none', font: 'inherit', textAlign: 'left', cursor: 'pointer', color: '#64748b', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
              >{websiteText("Advanced Diagnostics & Electrical")}</button>
            </li>
            <li>
              <button type="button"
                onClick={handleEmergency}
                style={{ border: 0, padding: 0, background: 'none', font: 'inherit', textAlign: 'left', cursor: 'pointer', color: '#16a34a', fontWeight: 600, transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#15803d')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#16a34a')}
              >{websiteText("24/7 Roadside Concierge Dispatch (SOS)")}</button>
            </li>
          </ul>
        </div>

        {/* ── Column 4: Get in touch (with subtle line icons & clickable links) ─── */}
        <div>
          <h4
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#0f172a',
              margin: '0 0 16px',
              letterSpacing: '0.01em',
            }}
          >{websiteText("Get in touch")}</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13 }}>
            {/* Email with subtle icon */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Mail size={16} style={{ color: '#0284c7', flexShrink: 0, marginTop: 2 }} />
              <a
                href={`mailto:${supportEmail}`}
                style={{
                  color: '#475569',
                  textDecoration: 'none',
                  wordBreak: 'break-all',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
              >
                {supportEmail}
              </a>
            </div>

            {/* Phone with subtle icon */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Phone size={16} style={{ color: '#0284c7', flexShrink: 0, marginTop: 2 }} />
              <a
                href={`tel:${supportPhone}`}
                style={{
                  color: '#475569',
                  textDecoration: 'none',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
              >
                {supportPhone}
              </a>
            </div>

            {/* Address with subtle icon (Opens Google Maps) */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <MapPin size={16} style={{ color: '#0284c7', flexShrink: 0, marginTop: 2 }} />
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#475569',
                  textDecoration: 'none',
                  lineHeight: 1.5,
                  transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
              >
                {address}
              </a>
            </div>

            {/* Hours with subtle icon */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Clock size={16} style={{ color: '#0284c7', flexShrink: 0, marginTop: 2 }} />
              <button type="button"
                onClick={() => onNotify?.(workingHours)}
                style={{ color: '#475569', lineHeight: 1.5, fontSize: 12, cursor: 'pointer' }}
                title={websiteText("Click for schedule info")}
              >
                {workingHours}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Subtle Divider Line ─── */}
      <div
        style={{
          maxWidth: 1280,
          margin: '36px auto 20px',
          height: 1,
          background: '#e2e8f0',
        }}
      />

      {/* ── Bottom Row: Copyright & Social Icons ─── */}
      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
          fontSize: 12,
          color: '#94a3b8',
        }}
      >
        <span>
          © 2026 {websiteText("LS Customs", undefined, settings.companyName || 'LS Customs')}{websiteText(". All rights reserved.")}</span>

        {/* Social Icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <a
            href="https://facebook.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={websiteText("Facebook")}
            style={{
              color: '#64748b',
              transition: 'color 0.2s',
              display: 'inline-flex',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
          >
            <Facebook size={16} />
          </a>
          <a
            href="https://twitter.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={websiteText("Twitter")}
            style={{
              color: '#64748b',
              transition: 'color 0.2s',
              display: 'inline-flex',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
          >
            <Twitter size={16} />
          </a>
          <a
            href="https://linkedin.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={websiteText("LinkedIn")}
            style={{
              color: '#64748b',
              transition: 'color 0.2s',
              display: 'inline-flex',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
          >
            <Linkedin size={16} />
          </a>
          <a
            href="https://instagram.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={websiteText("Instagram")}
            style={{
              color: '#64748b',
              transition: 'color 0.2s',
              display: 'inline-flex',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
          >
            <Instagram size={16} />
          </a>
        </div>
      </div>
    </footer>
  )
}
