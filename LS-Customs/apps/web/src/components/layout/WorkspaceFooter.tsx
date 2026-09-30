/**
 * WorkspaceFooter — sleek multi-column typographic footer with subtle line icons.
 * Replaces heavy graphics/cards with clean text columns matching reference aesthetics.
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
        padding: '54px 6% 36px',
        background: '#0b0f14',
        color: '#94a3b8',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
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
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: '0.06em',
                color: '#ffffff',
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
              color: '#94a3b8',
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
              fontSize: 15,
              fontWeight: 700,
              color: '#ffffff',
              margin: '0 0 16px',
              letterSpacing: '0.02em',
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
                style={{ cursor: 'pointer', color: '#94a3b8', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
              >
                Home
              </span>
            </li>
            <li>
              <span
                onClick={() => navigateTo('/services')}
                style={{ cursor: 'pointer', color: '#94a3b8', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
              >
                Book Service
              </span>
            </li>
            <li>
              <span
                onClick={() => navigateTo('/tracker')}
                style={{ cursor: 'pointer', color: '#94a3b8', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
              >
                Live Repair Tracker
              </span>
            </li>
            <li>
              <span
                onClick={() => navigateTo('/promos')}
                style={{ cursor: 'pointer', color: '#94a3b8', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
              >
                Vouchers & Promos
              </span>
            </li>
            <li>
              <span
                onClick={() => navigateTo('/contact')}
                style={{ cursor: 'pointer', color: '#94a3b8', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
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
              fontSize: 15,
              fontWeight: 700,
              color: '#ffffff',
              margin: '0 0 16px',
              letterSpacing: '0.02em',
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
                style={{ cursor: 'pointer', color: '#94a3b8', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
              >
                Performance & ECU Tuning
              </span>
            </li>
            <li>
              <span
                onClick={() => navigateTo('/services')}
                style={{ cursor: 'pointer', color: '#94a3b8', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
              >
                Custom Bodywork & Paint
              </span>
            </li>
            <li>
              <span
                onClick={() => navigateTo('/services')}
                style={{ cursor: 'pointer', color: '#94a3b8', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
              >
                Suspension & Precision Alignment
              </span>
            </li>
            <li>
              <span
                onClick={() => navigateTo('/services')}
                style={{ cursor: 'pointer', color: '#94a3b8', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
              >
                Advanced Diagnostics & Electrical
              </span>
            </li>
            <li>
              <span
                onClick={() => navigateTo('/services')}
                style={{ cursor: 'pointer', color: '#94a3b8', transition: 'color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
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
              fontSize: 15,
              fontWeight: 700,
              color: '#ffffff',
              margin: '0 0 16px',
              letterSpacing: '0.02em',
            }}
          >
            Get in touch
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13 }}>
            {/* Email with subtle icon */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Mail size={16} style={{ color: '#38bdf8', flexShrink: 0, marginTop: 2 }} />
              <a
                href={`mailto:${settings.supportEmail || 'concierge@lscustoms.com'}`}
                style={{
                  color: '#94a3b8',
                  textDecoration: 'none',
                  wordBreak: 'break-all',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
              >
                {settings.supportEmail || 'concierge@lscustoms.com'}
              </a>
            </div>

            {/* Phone with subtle icon */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Phone size={16} style={{ color: '#38bdf8', flexShrink: 0, marginTop: 2 }} />
              <a
                href={`tel:${settings.supportPhone || '+63 (02) 8888-5700'}`}
                style={{
                  color: '#94a3b8',
                  textDecoration: 'none',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
              >
                {settings.supportPhone || '+63 (02) 8888-5700'}
              </a>
            </div>

            {/* Address with subtle icon */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <MapPin size={16} style={{ color: '#38bdf8', flexShrink: 0, marginTop: 2 }} />
              <span style={{ color: '#94a3b8', lineHeight: 1.5 }}>
                {settings.address || '100 Portola Drive, Rockford Hills, Los Santos'}
              </span>
            </div>

            {/* Hours with subtle icon */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Clock size={16} style={{ color: '#38bdf8', flexShrink: 0, marginTop: 2 }} />
              <span style={{ color: '#94a3b8', lineHeight: 1.5, fontSize: 12 }}>
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
          background: 'rgba(255, 255, 255, 0.08)',
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
          color: '#64748b',
        }}
      >
        <span>
          © 2026 {settings.companyName || 'LS Customs'}. All rights reserved.
        </span>

        {/* Social Icons matching Polywick bottom right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <a
            href="https://facebook.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Facebook"
            style={{
              color: '#94a3b8',
              transition: 'color 0.2s',
              display: 'inline-flex',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            <Facebook size={16} />
          </a>
          <a
            href="https://twitter.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Twitter"
            style={{
              color: '#94a3b8',
              transition: 'color 0.2s',
              display: 'inline-flex',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            <Twitter size={16} />
          </a>
          <a
            href="https://linkedin.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
            style={{
              color: '#94a3b8',
              transition: 'color 0.2s',
              display: 'inline-flex',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            <Linkedin size={16} />
          </a>
          <a
            href="https://instagram.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
            style={{
              color: '#94a3b8',
              transition: 'color 0.2s',
              display: 'inline-flex',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            <Instagram size={16} />
          </a>
        </div>
      </div>
    </footer>
  )
}

