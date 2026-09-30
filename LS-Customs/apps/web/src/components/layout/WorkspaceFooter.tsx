/**
 * WorkspaceFooter — sleek multi-column typographic footer with subtle line icons.
 * Clean, modern light-mode design matching LS Customs theme.
 */

import { Mail, MapPin, Phone, Clock, Facebook, Twitter, Linkedin, Instagram } from 'lucide-react'
import { navigateTo } from '../../utils/navigation'
import { useCustomerSiteSettings } from '../../hooks/useCustomerSiteSettings'

interface WorkspaceFooterProps {
  onNotify?: (message: string) => void
}

export function WorkspaceFooter({ onNotify: _onNotify }: WorkspaceFooterProps) {
  const { settings } = useCustomerSiteSettings()

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
            onClick={() => navigateTo('/')}
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

        {/* ── Column 2: Navigation ─── */}
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
                onClick={() => navigateTo('/')}
                style={{ cursor: 'pointer', color: '#64748b', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
              >
                Home
              </span>
            </li>
            <li>
              <span
                onClick={() => navigateTo('/services')}
                style={{ cursor: 'pointer', color: '#64748b', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
              >
                Book Service
              </span>
            </li>
            <li>
              <span
                onClick={() => navigateTo('/tracker')}
                style={{ cursor: 'pointer', color: '#64748b', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
              >
                Live Repair Tracker
              </span>
            </li>
            <li>
              <span
                onClick={() => navigateTo('/promos')}
                style={{ cursor: 'pointer', color: '#64748b', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
              >
                Vouchers & Promos
              </span>
            </li>
            <li>
              <span
                onClick={() => navigateTo('/contact')}
                style={{ cursor: 'pointer', color: '#64748b', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
              >
                Contact Us
              </span>
            </li>
          </ul>
        </div>

        {/* ── Column 3: Services / Specialties ─── */}
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
                onClick={() => navigateTo('/services')}
                style={{ cursor: 'pointer', color: '#64748b', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
              >
                Performance & ECU Tuning
              </span>
            </li>
            <li>
              <span
                onClick={() => navigateTo('/services')}
                style={{ cursor: 'pointer', color: '#64748b', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
              >
                Custom Bodywork & Paint
              </span>
            </li>
            <li>
              <span
                onClick={() => navigateTo('/services')}
                style={{ cursor: 'pointer', color: '#64748b', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
              >
                Suspension & Precision Alignment
              </span>
            </li>
            <li>
              <span
                onClick={() => navigateTo('/services')}
                style={{ cursor: 'pointer', color: '#64748b', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
              >
                Advanced Diagnostics & Electrical
              </span>
            </li>
            <li>
              <span
                onClick={() => navigateTo('/services')}
                style={{ cursor: 'pointer', color: '#64748b', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
              >
                24/7 Roadside Concierge Dispatch
              </span>
            </li>
          </ul>
        </div>

        {/* ── Column 4: Get in touch (with subtle line icons) ─── */}
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

            {/* Address with subtle icon */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <MapPin size={16} style={{ color: '#0284c7', flexShrink: 0, marginTop: 2 }} />
              <span style={{ color: '#475569', lineHeight: 1.5 }}>
                {settings.address || '100 Portola Drive, Rockford Hills, Los Santos'}
              </span>
            </div>

            {/* Hours with subtle icon */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Clock size={16} style={{ color: '#0284c7', flexShrink: 0, marginTop: 2 }} />
              <span style={{ color: '#475569', lineHeight: 1.5, fontSize: 12 }}>
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
