/**
 * WorkspaceFooter — sleek multi-column typographic footer with subtle line icons.
 * Fully interactive and connected to customer-side navigation, active booking tracker,
 * vouchers drawer, emergency roadside dispatch, and contact support.
 */

import { Mail, MapPin, Phone, Clock, Facebook, Twitter, Linkedin, Instagram } from 'lucide-react'
import { navigateTo } from '../../utils/navigation'
import { useCustomerSiteSettings } from '../../hooks/useCustomerSiteSettings'
import type { View } from '../../types'

interface WorkspaceFooterProps {
  onNotify?: (message: string) => void
  onView?: (view: View) => void
  onEmergencyClick?: () => void
}

export function WorkspaceFooter({ onNotify, onView, onEmergencyClick }: WorkspaceFooterProps) {
  const { settings } = useCustomerSiteSettings()

  const handleNav = (targetView: View, action?: 'promos') => {
    // If user is currently on a public page (/help, /contact, /terms, etc.), return to app frame
    const path = window.location.pathname
    if (path.startsWith('/help') || path.startsWith('/contact') || path.startsWith('/terms') || path.startsWith('/privacy') || path.startsWith('/faqs') || path.startsWith('/docs')) {
      window.history.pushState({}, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    }

    if (action === 'promos') {
      if (onView) {
        onView('home')
      } else {
        navigateTo('/')
      }
      setTimeout(() => {
        const promoEl = document.getElementById('available-vouchers-promos-section')
        if (promoEl) {
          promoEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
        window.dispatchEvent(new CustomEvent('ls-open-promos'))
      }, 150)
      return
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
          <div
            onClick={() => handleNav('home')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <img
              src="/logo.png"
              alt={settings.companyName || 'LS Customs'}
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
              {settings.companyName || 'LS CUSTOMS'}
            </span>
          </div>
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.65,
              color: '#64748b',
              margin: 0,
            }}
          >
            {settings.heroSubtitle ||
              'Elevate your automotive experience with LS Customs, your premier gateway to bespoke vehicle service, precision tuning, and elite concierge dispatch.'}
          </p>
        </div>

        {/* ── Column 2: Navigation (100% Functional Customer Actions) ─── */}
        <div>
          <h4
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#0f172a',
              margin: '0 0 16px',
              letterSpacing: '0.01em',
            }}
          >
            Navigation
          </h4>
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
              <span
                onClick={() => handleNav('home')}
                style={{ cursor: 'pointer', color: '#64748b', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
              >
                Home
              </span>
            </li>
            <li>
              <span
                onClick={() => handleNav('services')}
                style={{ cursor: 'pointer', color: '#64748b', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
              >
                Book Service
              </span>
            </li>
            <li>
              <span
                onClick={() => handleNav('rentals')}
                style={{ cursor: 'pointer', color: '#64748b', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
              >
                Vehicle Rentals
              </span>
            </li>
            <li>
              <span
                onClick={() => handleNav('bookings')}
                style={{ cursor: 'pointer', color: '#64748b', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
              >
                Live Repair Tracker
              </span>
            </li>
            <li>
              <span
                onClick={() => handleNav('home', 'promos')}
                style={{ cursor: 'pointer', color: '#64748b', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
              >
                Vouchers & Promos
              </span>
            </li>
            <li>
              <span
                onClick={() => {
                  navigateTo('/contact')
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                style={{ cursor: 'pointer', color: '#64748b', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
              >
                Contact Us
              </span>
            </li>
          </ul>
        </div>

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
          >
            Services
          </h4>
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
              <span
                onClick={() => handleNav('services')}
                style={{ cursor: 'pointer', color: '#64748b', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
              >
                Performance & ECU Tuning
              </span>
            </li>
            <li>
              <span
                onClick={() => handleNav('services')}
                style={{ cursor: 'pointer', color: '#64748b', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
              >
                Custom Bodywork & Paint
              </span>
            </li>
            <li>
              <span
                onClick={() => handleNav('services')}
                style={{ cursor: 'pointer', color: '#64748b', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
              >
                Suspension & Precision Alignment
              </span>
            </li>
            <li>
              <span
                onClick={() => handleNav('services')}
                style={{ cursor: 'pointer', color: '#64748b', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
              >
                Advanced Diagnostics & Electrical
              </span>
            </li>
            <li>
              <span
                onClick={handleEmergency}
                style={{ cursor: 'pointer', color: '#16a34a', fontWeight: 600, transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#15803d')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#16a34a')}
              >
                24/7 Roadside Concierge Dispatch (SOS)
              </span>
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
          >
            Get in touch
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13 }}>
            {/* Email with subtle icon */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Mail size={16} style={{ color: '#0284c7', flexShrink: 0, marginTop: 2 }} />
              <a
                href={`mailto:${settings.supportEmail || 'concierge@lscustoms.com'}`}
                style={{
                  color: '#475569',
                  textDecoration: 'none',
                  wordBreak: 'break-all',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
              >
                {settings.supportEmail || 'concierge@lscustoms.com'}
              </a>
            </div>

            {/* Phone with subtle icon */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Phone size={16} style={{ color: '#0284c7', flexShrink: 0, marginTop: 2 }} />
              <a
                href={`tel:${settings.supportPhone || '+63 (02) 8888-5700'}`}
                style={{
                  color: '#475569',
                  textDecoration: 'none',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
              >
                {settings.supportPhone || '+63 (02) 8888-5700'}
              </a>
            </div>

            {/* Address with subtle icon (Opens Google Maps) */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <MapPin size={16} style={{ color: '#0284c7', flexShrink: 0, marginTop: 2 }} />
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(settings.address || '100 Portola Drive, Rockford Hills, Los Santos')}`}
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
                {settings.address || '100 Portola Drive, Rockford Hills, Los Santos'}
              </a>
            </div>

            {/* Hours with subtle icon */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Clock size={16} style={{ color: '#0284c7', flexShrink: 0, marginTop: 2 }} />
              <span
                onClick={() => onNotify?.(settings.workingHours || 'Showroom 8AM – 9PM · Roadside dispatch is available 24/7.')}
                style={{ color: '#475569', lineHeight: 1.5, fontSize: 12, cursor: 'pointer' }}
                title="Click for schedule info"
              >
                {settings.workingHours || 'Open 24/7 for Emergency Dispatch · Showroom 8AM – 9PM'}
              </span>
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
          © 2026 {settings.companyName || 'LS Customs'}. All rights reserved.
        </span>

        {/* Social Icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <a
            href="https://facebook.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Facebook"
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
            aria-label="Twitter"
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
            aria-label="LinkedIn"
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
            aria-label="Instagram"
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
