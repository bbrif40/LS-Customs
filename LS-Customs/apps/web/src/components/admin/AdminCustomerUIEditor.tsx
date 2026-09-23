/**
 * AdminCustomerUIEditor — allows administrators to customize customer-facing UI
 * including announcement banners, hero headlines, contact details, and accent theme colors.
 * Features live interactive preview and instant reactivity.
 */
import { useState } from 'react'
import {
  useCustomerSiteSettings,
  DEFAULT_SITE_SETTINGS,
  type CustomerSiteSettings,
} from '../../hooks/useCustomerSiteSettings'
import {
  Save,
  RotateCcw,
  Sparkles,
  Megaphone,
  LayoutTemplate,
  Building2,
  Palette,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  Eye,
} from 'lucide-react'

const COLOR_PRESETS = [
  { name: 'LS Gold', value: '#e8a838' },
  { name: 'Cyber Cyan', value: '#06b6d4' },
  { name: 'Racing Crimson', value: '#ef4444' },
  { name: 'Hyper Emerald', value: '#10b981' },
  { name: 'Royal Purple', value: '#8b5cf6' },
  { name: 'Sunset Amber', value: '#f59e0b' },
  { name: 'Stealth Slate', value: '#1e293b' },
]

export function AdminCustomerUIEditor() {
  const { settings, saveSettings, resetSettings } = useCustomerSiteSettings()
  const [form, setForm] = useState<CustomerSiteSettings>(settings)
  const [activeTab, setActiveTab] = useState<'banner' | 'hero' | 'business' | 'theme'>('banner')
  const [savedSuccess, setSavedSuccess] = useState(false)

  const handleChange = <K extends keyof CustomerSiteSettings>(key: K, value: CustomerSiteSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    saveSettings(form)
    setSavedSuccess(true)
    setTimeout(() => setSavedSuccess(false), 2500)
  }

  const handleReset = () => {
    if (window.confirm('Reset all customer UI text and branding back to default settings?')) {
      resetSettings()
      setForm(DEFAULT_SITE_SETTINGS)
      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 2500)
    }
  }

  return (
    <div className="admin-main">
      {/* ── Page Header ─────────────────────────────────────── */}
      <div className="admin-revenue-header" style={{ marginBottom: 24 }}>
        <div>
          <span className="admin-revenue-header-sub">Customization Studio</span>
          <h1>Customer UI Editor</h1>
          <p>Tailor the customer experience, broadcast promotional banners, and edit storefront copy.</p>
        </div>
        <div className="admin-revenue-actions">
          <button
            type="button"
            className="admin-date-range"
            onClick={handleReset}
            title="Reset to factory defaults"
          >
            <RotateCcw size={14} />
            Reset Defaults
          </button>
          <button
            type="button"
            className="admin-export-btn"
            onClick={handleSave}
            style={{
              background: savedSuccess ? '#10b981' : 'var(--admin-accent, #e8a838)',
              color: savedSuccess ? '#ffffff' : '#000000',
              fontWeight: 600,
            }}
          >
            {savedSuccess ? (
              <>
                <CheckCircle2 size={15} />
                Saved & Published!
              </>
            ) : (
              <>
                <Save size={15} />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Studio Navigation Tabs ───────────────────────────── */}
      <div className="admin-filters-bar" style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          type="button"
          className={`admin-filter-btn ${activeTab === 'banner' ? 'active' : ''}`}
          onClick={() => setActiveTab('banner')}
        >
          <Megaphone size={14} style={{ marginRight: 6 }} />
          Announcement Banner
        </button>
        <button
          type="button"
          className={`admin-filter-btn ${activeTab === 'hero' ? 'active' : ''}`}
          onClick={() => setActiveTab('hero')}
        >
          <LayoutTemplate size={14} style={{ marginRight: 6 }} />
          Hero & Greeting
        </button>
        <button
          type="button"
          className={`admin-filter-btn ${activeTab === 'business' ? 'active' : ''}`}
          onClick={() => setActiveTab('business')}
        >
          <Building2 size={14} style={{ marginRight: 6 }} />
          Business & Concierge
        </button>
        <button
          type="button"
          className={`admin-filter-btn ${activeTab === 'theme' ? 'active' : ''}`}
          onClick={() => setActiveTab('theme')}
        >
          <Palette size={14} style={{ marginRight: 6 }} />
          Theme & Accent
        </button>
      </div>

      {/* ── Main Studio Grid: Controls + Live Preview ────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(380px, 1.2fr) minmax(360px, 1.3fr)', gap: 24, alignItems: 'start' }}>
        
        {/* Left Column: Form Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* TAB 1: Announcement Banner */}
          {activeTab === 'banner' && (
            <div className="admin-card" style={{ padding: 24, background: 'var(--admin-card-bg, #1a1f2e)', border: '1px solid var(--admin-border, #2d3748)', borderRadius: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#fff' }}>Announcement Banner</h3>
                  <p style={{ fontSize: 13, color: 'var(--admin-muted, #94a3b8)', margin: '4px 0 0' }}>
                    Displays a prominent notification bar at the top of customer pages.
                  </p>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.showBanner}
                    onChange={(e) => handleChange('showBanner', e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: 'var(--admin-accent, #e8a838)', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600, color: form.showBanner ? '#10b981' : 'var(--admin-muted)' }}>
                    {form.showBanner ? 'Visible' : 'Hidden'}
                  </span>
                </label>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--admin-muted)', marginBottom: 6 }}>
                    Banner Announcement Text
                  </label>
                  <textarea
                    rows={3}
                    value={form.bannerText}
                    onChange={(e) => handleChange('bannerText', e.target.value)}
                    placeholder="e.g. Special Holiday Promo: 20% off all vehicle rentals!"
                    style={{
                      width: '100%',
                      background: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid var(--admin-border, #2d3748)',
                      borderRadius: 8,
                      padding: '10px 12px',
                      color: '#fff',
                      fontSize: 13,
                      resize: 'vertical',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--admin-muted)', marginBottom: 6 }}>
                      Button Action Text
                    </label>
                    <input
                      type="text"
                      value={form.bannerLinkText}
                      onChange={(e) => handleChange('bannerLinkText', e.target.value)}
                      placeholder="e.g. Claim Offer"
                      style={{
                        width: '100%',
                        background: 'rgba(0, 0, 0, 0.25)',
                        border: '1px solid var(--admin-border, #2d3748)',
                        borderRadius: 8,
                        padding: '8px 12px',
                        color: '#fff',
                        fontSize: 13,
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--admin-muted)', marginBottom: 6 }}>
                      Action Destination
                    </label>
                    <select
                      value={form.bannerLinkView}
                      onChange={(e) => handleChange('bannerLinkView', e.target.value as CustomerSiteSettings['bannerLinkView'])}
                      style={{
                        width: '100%',
                        background: 'rgba(0, 0, 0, 0.25)',
                        border: '1px solid var(--admin-border, #2d3748)',
                        borderRadius: 8,
                        padding: '8px 12px',
                        color: '#fff',
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      <option value="rentals">Rentals Showroom</option>
                      <option value="services">Mechanic Services</option>
                      <option value="bookings">My Bookings</option>
                      <option value="none">No Action Button</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--admin-muted)', marginBottom: 8 }}>
                    Banner Background Color
                  </label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                    {COLOR_PRESETS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => handleChange('bannerBg', p.value)}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          background: p.value,
                          border: form.bannerBg === p.value ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)',
                          cursor: 'pointer',
                          boxShadow: form.bannerBg === p.value ? '0 0 8px ' + p.value : 'none',
                        }}
                        title={p.name}
                      />
                    ))}
                    <input
                      type="color"
                      value={form.bannerBg}
                      onChange={(e) => handleChange('bannerBg', e.target.value)}
                      style={{ width: 34, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'transparent' }}
                      title="Custom color"
                    />
                    <span style={{ fontSize: 12, color: 'var(--admin-muted)', fontFamily: 'monospace' }}>{form.bannerBg}</span>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--admin-muted)', marginBottom: 6 }}>
                    Text Color
                  </label>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: '#fff' }}>
                      <input
                        type="radio"
                        name="bannerTextColor"
                        checked={form.bannerTextColor === '#000000'}
                        onChange={() => handleChange('bannerTextColor', '#000000')}
                      />
                      Dark text (#000000)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: '#fff' }}>
                      <input
                        type="radio"
                        name="bannerTextColor"
                        checked={form.bannerTextColor === '#ffffff'}
                        onChange={() => handleChange('bannerTextColor', '#ffffff')}
                      />
                      Light text (#ffffff)
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Hero & Greeting */}
          {activeTab === 'hero' && (
            <div className="admin-card" style={{ padding: 24, background: 'var(--admin-card-bg, #1a1f2e)', border: '1px solid var(--admin-border, #2d3748)', borderRadius: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px', color: '#fff' }}>Dashboard Hero & Welcoming</h3>
              <p style={{ fontSize: 13, color: 'var(--admin-muted, #94a3b8)', marginBottom: 20 }}>
                Controls the main headline, subtitle, and action buttons shown on the customer dashboard.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--admin-muted)', marginBottom: 6 }}>
                    Dashboard Greeting Subtitle
                  </label>
                  <input
                    type="text"
                    value={form.welcomeSubtitle}
                    onChange={(e) => handleChange('welcomeSubtitle', e.target.value)}
                    placeholder="Your garage is in good hands. What do you need today?"
                    style={{
                      width: '100%',
                      background: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid var(--admin-border, #2d3748)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      color: '#fff',
                      fontSize: 13,
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--admin-muted)', marginBottom: 6 }}>
                    Hero Eyebrow Tag
                  </label>
                  <input
                    type="text"
                    value={form.heroEyebrow}
                    onChange={(e) => handleChange('heroEyebrow', e.target.value)}
                    placeholder="LS CUSTOMS CONCIERGE"
                    style={{
                      width: '100%',
                      background: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid var(--admin-border, #2d3748)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      color: '#fff',
                      fontSize: 13,
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--admin-muted)', marginBottom: 6 }}>
                      Main Headline
                    </label>
                    <input
                      type="text"
                      value={form.heroHeadline}
                      onChange={(e) => handleChange('heroHeadline', e.target.value)}
                      placeholder="Premium vehicles."
                      style={{
                        width: '100%',
                        background: 'rgba(0, 0, 0, 0.25)',
                        border: '1px solid var(--admin-border, #2d3748)',
                        borderRadius: 8,
                        padding: '8px 12px',
                        color: '#fff',
                        fontSize: 13,
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--admin-muted)', marginBottom: 6 }}>
                      Headline Emphasized
                    </label>
                    <input
                      type="text"
                      value={form.heroHeadlineEm}
                      onChange={(e) => handleChange('heroHeadlineEm', e.target.value)}
                      placeholder="Precision service."
                      style={{
                        width: '100%',
                        background: 'rgba(0, 0, 0, 0.25)',
                        border: '1px solid var(--admin-border, #2d3748)',
                        borderRadius: 8,
                        padding: '8px 12px',
                        color: '#fff',
                        fontSize: 13,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--admin-muted)', marginBottom: 6 }}>
                    Hero Description Paragraph
                  </label>
                  <textarea
                    rows={3}
                    value={form.heroSubtitle}
                    onChange={(e) => handleChange('heroSubtitle', e.target.value)}
                    placeholder="Experience the perfect blend of high-end car rentals and on-demand, expert mobile mechanics."
                    style={{
                      width: '100%',
                      background: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid var(--admin-border, #2d3748)',
                      borderRadius: 8,
                      padding: '10px 12px',
                      color: '#fff',
                      fontSize: 13,
                      resize: 'vertical',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--admin-muted)', marginBottom: 6 }}>
                      Primary CTA Text
                    </label>
                    <input
                      type="text"
                      value={form.heroCtaRentalText}
                      onChange={(e) => handleChange('heroCtaRentalText', e.target.value)}
                      placeholder="Rent a vehicle"
                      style={{
                        width: '100%',
                        background: 'rgba(0, 0, 0, 0.25)',
                        border: '1px solid var(--admin-border, #2d3748)',
                        borderRadius: 8,
                        padding: '8px 12px',
                        color: '#fff',
                        fontSize: 13,
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--admin-muted)', marginBottom: 6 }}>
                      Secondary CTA Text
                    </label>
                    <input
                      type="text"
                      value={form.heroCtaServiceText}
                      onChange={(e) => handleChange('heroCtaServiceText', e.target.value)}
                      placeholder="Book a mechanic"
                      style={{
                        width: '100%',
                        background: 'rgba(0, 0, 0, 0.25)',
                        border: '1px solid var(--admin-border, #2d3748)',
                        borderRadius: 8,
                        padding: '8px 12px',
                        color: '#fff',
                        fontSize: 13,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Business Information */}
          {activeTab === 'business' && (
            <div className="admin-card" style={{ padding: 24, background: 'var(--admin-card-bg, #1a1f2e)', border: '1px solid var(--admin-border, #2d3748)', borderRadius: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px', color: '#fff' }}>Business & Concierge Details</h3>
              <p style={{ fontSize: 13, color: 'var(--admin-muted, #94a3b8)', marginBottom: 20 }}>
                Configure company contact information and operating hours presented to customers.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--admin-muted)', marginBottom: 6 }}>
                    Business / Brand Name
                  </label>
                  <input
                    type="text"
                    value={form.companyName}
                    onChange={(e) => handleChange('companyName', e.target.value)}
                    placeholder="LS Customs"
                    style={{
                      width: '100%',
                      background: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid var(--admin-border, #2d3748)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      color: '#fff',
                      fontSize: 13,
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--admin-muted)', marginBottom: 6 }}>
                      Concierge Support Phone
                    </label>
                    <input
                      type="text"
                      value={form.supportPhone}
                      onChange={(e) => handleChange('supportPhone', e.target.value)}
                      placeholder="+63 (02) 8888-5700"
                      style={{
                        width: '100%',
                        background: 'rgba(0, 0, 0, 0.25)',
                        border: '1px solid var(--admin-border, #2d3748)',
                        borderRadius: 8,
                        padding: '8px 12px',
                        color: '#fff',
                        fontSize: 13,
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--admin-muted)', marginBottom: 6 }}>
                      Support Email
                    </label>
                    <input
                      type="text"
                      value={form.supportEmail}
                      onChange={(e) => handleChange('supportEmail', e.target.value)}
                      placeholder="concierge@lscustoms.com"
                      style={{
                        width: '100%',
                        background: 'rgba(0, 0, 0, 0.25)',
                        border: '1px solid var(--admin-border, #2d3748)',
                        borderRadius: 8,
                        padding: '8px 12px',
                        color: '#fff',
                        fontSize: 13,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--admin-muted)', marginBottom: 6 }}>
                    Garage / Showroom Address
                  </label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => handleChange('address', e.target.value)}
                    placeholder="100 Portola Drive, Rockford Hills"
                    style={{
                      width: '100%',
                      background: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid var(--admin-border, #2d3748)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      color: '#fff',
                      fontSize: 13,
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--admin-muted)', marginBottom: 6 }}>
                    Working Hours / Availability Note
                  </label>
                  <input
                    type="text"
                    value={form.workingHours}
                    onChange={(e) => handleChange('workingHours', e.target.value)}
                    placeholder="Open 24/7 for Emergency Dispatch · Showroom 8AM - 9PM"
                    style={{
                      width: '100%',
                      background: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid var(--admin-border, #2d3748)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      color: '#fff',
                      fontSize: 13,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Theme & Accent */}
          {activeTab === 'theme' && (
            <div className="admin-card" style={{ padding: 24, background: 'var(--admin-card-bg, #1a1f2e)', border: '1px solid var(--admin-border, #2d3748)', borderRadius: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px', color: '#fff' }}>Theme & Brand Accent</h3>
              <p style={{ fontSize: 13, color: 'var(--admin-muted, #94a3b8)', marginBottom: 20 }}>
                Adjust the primary luxury accent color that powers badges, highlights, and primary buttons.
              </p>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--admin-muted)', marginBottom: 12 }}>
                  Selected Accent Color
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
                  {COLOR_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => handleChange('accentColor', p.value)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        background: form.accentColor === p.value ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.2)',
                        border: form.accentColor === p.value ? '2px solid ' + p.value : '1px solid var(--admin-border)',
                        borderRadius: 8,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ width: 18, height: 18, borderRadius: '50%', background: p.value, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Right Column: Live Mockup Preview */}
        <div style={{ position: 'sticky', top: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Eye size={16} color="var(--admin-accent, #e8a838)" />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Customer Live Preview
              </span>
            </div>
            <span style={{ fontSize: 11, background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '3px 8px', borderRadius: 12, fontWeight: 600 }}>
              ● Synchronized
            </span>
          </div>

          {/* Browser / Device Shell Mockup */}
          <div
            style={{
              background: '#0d1117',
              border: '1px solid #30363d',
              borderRadius: 14,
              overflow: 'hidden',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
            }}
          >
            {/* Mockup Header Bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: '#161b22', borderBottom: '1px solid #30363d' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }} />
              <div style={{ flex: 1, textAlign: 'center', margin: '0 16px' }}>
                <div style={{ background: '#0d1117', borderRadius: 6, padding: '2px 10px', fontSize: 11, color: '#8b949e', display: 'inline-block' }}>
                  https://ls-customs-web.vercel.app
                </div>
              </div>
            </div>

            {/* Mockup Content Body */}
            <div style={{ padding: 16, background: '#090d14', minHeight: 460 }}>
              
              {/* 1. Live Announcement Banner */}
              {form.showBanner && (
                <div
                  style={{
                    background: form.bannerBg,
                    color: form.bannerTextColor,
                    borderRadius: 8,
                    padding: '8px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    marginBottom: 16,
                    fontSize: 12,
                    fontWeight: 600,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, lineHeight: 1.3 }}>
                    <Sparkles size={14} style={{ flexShrink: 0 }} />
                    <span>{form.bannerText || 'Add your announcement text here'}</span>
                  </div>
                  {form.bannerLinkView !== 'none' && form.bannerLinkText && (
                    <span
                      style={{
                        background: form.bannerTextColor === '#000000' ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)',
                        padding: '4px 10px',
                        borderRadius: 6,
                        fontSize: 11,
                        whiteSpace: 'nowrap',
                        fontWeight: 700,
                      }}
                    >
                      {form.bannerLinkText} →
                    </span>
                  )}
                </div>
              )}

              {/* 2. Customer Navigation Header Bar Mockup */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: form.accentColor, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 900, color: '#000' }}>
                    LS
                  </div>
                  <strong style={{ fontSize: 13, color: '#fff' }}>{form.companyName}</strong>
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#94a3b8' }}>
                  <span>Rentals</span>
                  <span>Mechanics</span>
                  <span>Bookings</span>
                </div>
              </div>

              {/* 3. Welcome Section */}
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 10, textTransform: 'uppercase', color: form.accentColor, letterSpacing: '0.08em', margin: '0 0 4px', fontWeight: 700 }}>
                  SATURDAY, 23 SEPTEMBER 2026
                </p>
                <h4 style={{ fontSize: 17, margin: '0 0 4px', color: '#fff', fontWeight: 800 }}>
                  Good afternoon, Alex ✦
                </h4>
                <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>
                  {form.welcomeSubtitle}
                </p>
              </div>

              {/* 4. Hero Card Preview */}
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(26, 32, 44, 0.9) 0%, rgba(15, 23, 42, 0.9) 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 12,
                  padding: 18,
                  position: 'relative',
                  overflow: 'hidden',
                  marginBottom: 16,
                }}
              >
                {/* Glow accent */}
                <div
                  style={{
                    position: 'absolute',
                    top: -20,
                    right: -20,
                    width: 100,
                    height: 100,
                    borderRadius: '50%',
                    background: form.accentColor,
                    filter: 'blur(40px)',
                    opacity: 0.25,
                  }}
                />

                <p style={{ fontSize: 9, letterSpacing: '0.1em', color: form.accentColor, textTransform: 'uppercase', margin: '0 0 6px', fontWeight: 800 }}>
                  {form.heroEyebrow}
                </p>
                <h3 style={{ fontSize: 16, margin: '0 0 6px', color: '#fff', fontWeight: 800, lineHeight: 1.2 }}>
                  {form.heroHeadline}{' '}
                  <em style={{ color: form.accentColor, fontStyle: 'italic' }}>{form.heroHeadlineEm}</em>
                </h3>
                <p style={{ fontSize: 11, color: '#cbd5e1', margin: '0 0 14px', lineHeight: 1.4 }}>
                  {form.heroSubtitle}
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div
                    style={{
                      background: form.accentColor,
                      color: '#000',
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {form.heroCtaRentalText}
                    <ChevronRight size={12} />
                  </div>
                  <div
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      color: '#fff',
                      border: '1px solid rgba(255,255,255,0.15)',
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {form.heroCtaServiceText}
                  </div>
                </div>
              </div>

              {/* 5. Business Contact Snippet Mockup */}
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--admin-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Showroom & Support</div>
                  <div style={{ fontSize: 11, color: '#fff', fontWeight: 600 }}>{form.supportPhone}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>{form.address}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9, color: '#10b981', fontWeight: 700 }}>● AVAILABLE NOW</div>
                  <div style={{ fontSize: 10, color: 'var(--admin-muted)' }}>{form.workingHours}</div>
                </div>
              </div>

            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
