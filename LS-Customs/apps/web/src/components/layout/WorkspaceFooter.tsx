/**
 * WorkspaceFooter — persistent footer with brand, help, support, and legal links.
 */

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
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        padding: '32px 5.5% 36px',
        background: '#ffffff',
        borderTop: '1px solid var(--line, #e2e8f0)',
      }}
    >
      {/* ── Concierge Showroom & Support Card Inside Footer ─── */}
      <div
        style={{
          width: '100%',
          padding: '18px 22px',
          borderRadius: 14,
          background: '#f8faf8',
          border: '1px solid #e2ebe4',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              background: settings.accentColor || 'var(--brand-accent, #e8a838)',
              display: 'grid',
              placeItems: 'center',
              color: '#000000',
              fontWeight: 800,
              fontSize: 15,
              flexShrink: 0,
            }}
          >
            LS
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#64748b', textTransform: 'uppercase' }}>
              Showroom & Concierge Support
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: '2px 0' }}>
              {settings.supportPhone || '+63 (02) 8888-5700'}
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {settings.address || '100 Portola Drive, Rockford Hills'} · {settings.supportEmail || 'concierge@lscustoms.com'}
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 10,
              fontWeight: 700,
              color: '#16a34a',
              background: '#dcfce7',
              padding: '3px 9px',
              borderRadius: 999,
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#16a34a' }} />
            AVAILABLE NOW
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
            {settings.workingHours || 'Open 24/7 for Emergency Dispatch · Showroom 8AM - 9PM'}
          </div>
        </div>
      </div>

      {/* ── Brand, Links & Copyright Row ─────────────────────── */}
      <div style={{ width: '100%', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 18, paddingTop: 6 }}>
        <div className="workspace-footer-brand" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img
            src="/logo.png"
            alt={settings.companyName || 'LS Customs'}
            style={{ width: 22, height: 22, objectFit: 'contain', flexShrink: 0 }}
          />
          <strong style={{ fontSize: 12, color: '#0f172a', fontWeight: 800 }}>{settings.companyName || 'LS Customs'}</strong>
          <small style={{ fontSize: 11, color: '#64748b' }}>Professional automotive solutions.</small>
        </div>

        <div className="workspace-footer-links" style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <button onClick={() => navigateTo('/help')}>Help Center</button>
          <button onClick={() => navigateTo('/contact')}>Contact Support</button>
          <button onClick={() => navigateTo('/terms')}>Terms of Service</button>
          <button onClick={() => navigateTo('/privacy')}>Privacy Policy</button>
        </div>

        <small className="workspace-copyright" style={{ fontSize: 11, color: '#94a3b8' }}>
          © 2026 {settings.companyName || 'LS Customs'}. All rights reserved.
        </small>
      </div>
    </footer>
  )
}
