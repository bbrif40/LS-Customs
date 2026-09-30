/**
 * AdminCustomerUIEditor — Interactive Canvas Studio for customizing customer UI.
 * Redesigned as a full-screen living canvas simulation of the customer experience
 * where admins can directly paint themes, edit copy in-place, and preview responsive layouts
 * with instant real-time synchronization.
 */
import { useState, useRef, useEffect } from 'react'
import {
  useCustomerSiteSettings,
  DEFAULT_SITE_SETTINGS,
  type CustomerSiteSettings,
} from '../../hooks/useCustomerSiteSettings'
import { AvailableVouchersPromos } from '../common/AvailableVouchersPromos'
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
  Zap,
  Monitor,
  Laptop,
  Smartphone,
  Paintbrush,
  Sliders,
  Edit3,
  X,
  Car,
  Wrench,
  CalendarDays,
  Star,
  Check,
  ShieldCheck,
  MapPin,
  Clock,
  Phone,
  Mail,
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

const BANNER_BG_PRESETS = [
  '#e8a838',
  '#06b6d4',
  '#ef4444',
  '#10b981',
  '#8b5cf6',
  '#f59e0b',
  '#1e293b',
]

// Mock vehicles for authentic customer fleet rendering on the canvas
const PREVIEW_FLEET = [
  {
    name: 'Pfister Comet S2 Cabrio',
    category: 'EXOTIC FLEET',
    price: '₱14,500',
    rating: '5.0',
    image: 'https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?w=800&auto=format&fit=crop&q=80',
    features: ['Twin-Turbo Flat-6', 'Convertible Soft Top', 'Sport Exhaust'],
  },
  {
    name: 'Pegassi Zorrusso Spyder',
    category: 'HYPERCAR',
    price: '₱28,000',
    rating: '4.9',
    image: 'https://images.unsplash.com/photo-1544829099-b9a0c07fad1a?w=800&auto=format&fit=crop&q=80',
    features: ['V12 Naturally Aspirated', 'Carbon Fiber Aero', 'Track Suspension'],
  },
  {
    name: 'Bravado Buffalo STX Widebody',
    category: 'MUSCLE & EXECUTIVE',
    price: '₱9,500',
    rating: '4.8',
    image: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&auto=format&fit=crop&q=80',
    features: ['Supercharged HEMI V8', 'Widebody Stance', 'Heads-Up Display'],
  },
]

export function AdminCustomerUIEditor() {
  const { settings, saveSettings, resetSettings } = useCustomerSiteSettings()
  const [form, setForm] = useState<CustomerSiteSettings>(settings)
  const [studioMode, setStudioMode] = useState<'paint' | 'simulation'>('paint')
  const [viewport, setViewport] = useState<'desktop' | 'laptop' | 'mobile'>('desktop')
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [activeInspectorTab, setActiveInspectorTab] = useState<'banner' | 'hero' | 'business' | 'theme'>('banner')
  const [editingField, setEditingField] = useState<string | null>(null)
  const [savedSuccess, setSavedSuccess] = useState(false)
  const [instantSync, setInstantSync] = useState(true)

  // Sync state if settings change externally
  useEffect(() => {
    setForm(settings)
  }, [settings])

  const handleChange = <K extends keyof CustomerSiteSettings>(key: K, value: CustomerSiteSettings[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      if (instantSync) {
        saveSettings(next)
      }
      return next
    })
  }

  const handleSave = () => {
    saveSettings(form)
    setSavedSuccess(true)
    setTimeout(() => setSavedSuccess(false), 2500)
  }

  const handleReset = () => {
    if (window.confirm('Reset all customer UI text, branding, and theme colors back to factory defaults?')) {
      resetSettings()
      setForm(DEFAULT_SITE_SETTINGS)
      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 2500)
    }
  }

  const openInspectorTo = (tab: 'banner' | 'hero' | 'business' | 'theme') => {
    setActiveInspectorTab(tab)
    setInspectorOpen(true)
  }

  // Get viewport container width
  const getViewportMaxWidth = () => {
    if (viewport === 'mobile') return '390px'
    if (viewport === 'laptop') return '1024px'
    return '100%'
  }

  return (
    <div className="admin-main" style={{ paddingBottom: 60, maxWidth: 1600, margin: '0 auto' }}>
      
      {/* ── TOP STUDIO COMMAND BAR ──────────────────────────────── */}
      <div
        style={{
          background: 'var(--admin-card-bg, #1a1f2e)',
          border: '1px solid var(--admin-border, #2d3748)',
          borderRadius: 14,
          padding: '14px 20px',
          marginBottom: 16,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
        }}
      >
        {/* Title & Live Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: form.accentColor,
              display: 'grid',
              placeItems: 'center',
              color: '#000000',
              fontWeight: 900,
              fontSize: 16,
              boxShadow: `0 0 16px ${form.accentColor}44`,
            }}
          >
            🎨
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#ffffff', margin: 0 }}>
                Storefront Canvas Studio
              </h2>
              <span
                style={{
                  fontSize: 11,
                  background: instantSync ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.06)',
                  color: instantSync ? '#10b981' : '#94a3b8',
                  padding: '2px 8px',
                  borderRadius: 10,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Zap size={11} fill={instantSync ? '#10b981' : 'none'} />
                {instantSync ? 'Live Synchronized' : 'Sync Paused'}
              </span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--admin-muted, #94a3b8)', margin: '2px 0 0' }}>
              Interactive customer simulation. Click any element to paint themes, edit copy, or adjust layout.
            </p>
          </div>
        </div>

        {/* Studio Controls: Mode Switcher + Viewport Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          
          {/* Studio Mode (Paint vs Simulation) */}
          <div
            style={{
              display: 'flex',
              background: 'rgba(0,0,0,0.3)',
              padding: 3,
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <button
              type="button"
              onClick={() => setStudioMode('paint')}
              style={{
                background: studioMode === 'paint' ? 'var(--admin-accent, #e8a838)' : 'transparent',
                color: studioMode === 'paint' ? '#000000' : '#cbd5e1',
                border: 'none',
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s ease',
              }}
              title="Interactive editing mode with click-to-edit overlays"
            >
              <Paintbrush size={14} />
              Paint & Edit
            </button>
            <button
              type="button"
              onClick={() => setStudioMode('simulation')}
              style={{
                background: studioMode === 'simulation' ? 'var(--admin-accent, #e8a838)' : 'transparent',
                color: studioMode === 'simulation' ? '#000000' : '#cbd5e1',
                border: 'none',
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s ease',
              }}
              title="Test the customer experience interactively"
            >
              <Eye size={14} />
              Test Simulation
            </button>
          </div>

          {/* Viewport Switcher */}
          <div
            style={{
              display: 'flex',
              background: 'rgba(0,0,0,0.3)',
              padding: 3,
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <button
              type="button"
              onClick={() => setViewport('desktop')}
              style={{
                background: viewport === 'desktop' ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: viewport === 'desktop' ? '#ffffff' : '#94a3b8',
                border: 'none',
                borderRadius: 6,
                padding: '6px 10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                fontWeight: 600,
              }}
              title="Desktop View (Full Width)"
            >
              <Monitor size={13} />
            </button>
            <button
              type="button"
              onClick={() => setViewport('laptop')}
              style={{
                background: viewport === 'laptop' ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: viewport === 'laptop' ? '#ffffff' : '#94a3b8',
                border: 'none',
                borderRadius: 6,
                padding: '6px 10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                fontWeight: 600,
              }}
              title="Laptop / Tablet View (1024px)"
            >
              <Laptop size={13} />
            </button>
            <button
              type="button"
              onClick={() => setViewport('mobile')}
              style={{
                background: viewport === 'mobile' ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: viewport === 'mobile' ? '#ffffff' : '#94a3b8',
                border: 'none',
                borderRadius: 6,
                padding: '6px 10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                fontWeight: 600,
              }}
              title="Mobile Device (390px)"
            >
              <Smartphone size={13} />
            </button>
          </div>

          {/* Inspector Toggle */}
          <button
            type="button"
            onClick={() => setInspectorOpen(!inspectorOpen)}
            style={{
              background: inspectorOpen ? 'rgba(232, 168, 56, 0.2)' : 'rgba(255,255,255,0.06)',
              color: inspectorOpen ? 'var(--admin-accent, #e8a838)' : '#cbd5e1',
              border: `1px solid ${inspectorOpen ? 'var(--admin-accent, #e8a838)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 8,
              padding: '7px 12px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Sliders size={14} />
            <span>Inspector {inspectorOpen ? 'Open' : 'Controls'}</span>
          </button>

          {/* External Customer View */}
          <button
            type="button"
            className="admin-date-range"
            onClick={() => window.open('/', '_blank')}
            title="Open customer portal in a new tab to see changes live"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px' }}
          >
            <ExternalLink size={13} />
            <span>Customer Portal</span>
          </button>

          {/* Save Button */}
          <button
            type="button"
            className="admin-export-btn"
            onClick={handleSave}
            style={{
              background: savedSuccess ? '#10b981' : 'var(--admin-accent, #e8a838)',
              color: savedSuccess ? '#ffffff' : '#000000',
              fontWeight: 700,
              padding: '7px 16px',
            }}
          >
            {savedSuccess ? (
              <>
                <CheckCircle2 size={14} />
                Saved & Published!
              </>
            ) : (
              <>
                <Save size={14} />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── PAINTER QUICK-PALETTE RIBBON ──────────────────────── */}
      <div
        style={{
          background: 'rgba(26, 31, 46, 0.85)',
          backdropFilter: 'blur(10px)',
          border: '1px solid var(--admin-border, #2d3748)',
          borderRadius: 12,
          padding: '10px 18px',
          marginBottom: 16,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        {/* Brand Theme Paint Swatches */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Palette size={14} color={form.accentColor} />
            Paint Brand Theme:
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {COLOR_PRESETS.map((p) => {
              const isSelected = form.accentColor.toLowerCase() === p.value.toLowerCase()
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => handleChange('accentColor', p.value)}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: p.value,
                    border: isSelected ? '3px solid #ffffff' : '2px solid rgba(0,0,0,0.3)',
                    boxShadow: isSelected ? `0 0 10px ${p.value}` : 'none',
                    cursor: 'pointer',
                    transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                    transition: 'all 0.15s ease',
                  }}
                  title={`Paint theme: ${p.name} (${p.value})`}
                />
              )
            })}
            <input
              type="color"
              value={form.accentColor}
              onChange={(e) => handleChange('accentColor', e.target.value)}
              title="Custom Brand Accent Color"
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                border: 'none',
                cursor: 'pointer',
                background: 'transparent',
              }}
            />
          </div>
        </div>

        {/* Banner Quick Painter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#cbd5e1', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={form.showBanner}
              onChange={(e) => handleChange('showBanner', e.target.checked)}
              style={{ accentColor: form.accentColor, cursor: 'pointer' }}
            />
            <span>Banner Visible</span>
          </label>

          {form.showBanner && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>Banner Color:</span>
              {BANNER_BG_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => handleChange('bannerBg', color)}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    background: color,
                    border: form.bannerBg === color ? '2px solid #ffffff' : '1px solid rgba(0,0,0,0.3)',
                    cursor: 'pointer',
                  }}
                  title={`Set banner background: ${color}`}
                />
              ))}
            </div>
          )}

          {/* Quick Section Jumpers */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => openInspectorTo('banner')}
              style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#94a3b8', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}
            >
              Banner ↗
            </button>
            <button
              type="button"
              onClick={() => openInspectorTo('hero')}
              style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#94a3b8', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}
            >
              Hero ↗
            </button>
            <button
              type="button"
              onClick={() => openInspectorTo('business')}
              style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#94a3b8', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}
            >
              Concierge ↗
            </button>
          </div>
        </div>
      </div>

      {/* ── MAIN STUDIO WORKSPACE (CANVAS + SLIDE-OUT INSPECTOR) ─ */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', position: 'relative' }}>
        
        {/* ── THE CANVAS: LIVE CUSTOMER SIMULATION ──────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center' }}>
          
          <div
            style={{
              width: '100%',
              maxWidth: getViewportMaxWidth(),
              background: '#ffffff',
              border: '1px solid #30363d',
              borderRadius: 16,
              overflow: 'hidden',
              boxShadow: '0 25px 60px rgba(0,0,0,0.45)',
              transition: 'max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {/* Browser Device Top Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                background: '#161b22',
                borderBottom: '1px solid #30363d',
                color: '#8b949e',
              }}
            >
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ef4444' }} />
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#f59e0b' }} />
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#10b981' }} />
              </div>
              <div style={{ flex: 1, textAlign: 'center', margin: '0 16px' }}>
                <div
                  style={{
                    background: '#0d1117',
                    borderRadius: 6,
                    padding: '3px 14px',
                    fontSize: 11,
                    color: '#c9d1d9',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    border: '1px solid #21262d',
                  }}
                >
                  <span style={{ color: '#10b981' }}>🔒</span>
                  <span>https://ls-customs-web.vercel.app</span>
                </div>
              </div>
              <span style={{ fontSize: 11, color: '#8b949e', fontWeight: 600 }}>
                {studioMode === 'paint' ? '🎨 Canvas Paint Mode' : '👁️ Customer Simulation'}
              </span>
            </div>

            {/* ── CUSTOMER STOREFRONT SIMULATION VIEW ───────────── */}
            <div
              style={{
                background: '#f8faf8',
                color: '#0f172a',
                padding: viewport === 'mobile' ? '14px 12px' : '20px 24px',
                minHeight: 800,
                fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              }}
            >
              {/* 1. ANNOUNCEMENT BANNER & AVAILABLE VOUCHERS */}
              {form.showBanner && (
                <div
                  style={{
                    position: 'relative',
                    marginBottom: 16,
                    borderRadius: 10,
                    outline: studioMode === 'paint' ? '2px dashed rgba(232, 168, 56, 0.4)' : 'none',
                    outlineOffset: 3,
                    transition: 'all 0.15s ease',
                  }}
                >
                  {/* Paint Overlay Button */}
                  {studioMode === 'paint' && (
                    <div
                      style={{
                        position: 'absolute',
                        top: -10,
                        right: 12,
                        zIndex: 20,
                        background: '#000000',
                        color: form.accentColor,
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontSize: 10,
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                      }}
                      onClick={() => openInspectorTo('banner')}
                    >
                      <Edit3 size={10} /> Edit Banner & Promos
                    </div>
                  )}

                  <AvailableVouchersPromos
                    onView={() => {}}
                    onNotify={() => {}}
                    bannerText={form.bannerText}
                    bannerBg={form.bannerBg}
                    bannerTextColor={form.bannerTextColor}
                    bannerLinkText={form.bannerLinkText}
                    bannerLinkView={form.bannerLinkView}
                  />
                </div>
              )}

              {/* 2. CUSTOMER NAVIGATION BAR */}
              <header
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 0 18px',
                  borderBottom: '1px solid #e2ebe4',
                  marginBottom: 20,
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: form.accentColor,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 13,
                      fontWeight: 900,
                      color: '#000000',
                    }}
                  >
                    LS
                  </div>
                  <div>
                    {studioMode === 'paint' && editingField === 'companyName' ? (
                      <input
                        type="text"
                        value={form.companyName}
                        onChange={(e) => handleChange('companyName', e.target.value)}
                        onBlur={() => setEditingField(null)}
                        autoFocus
                        style={{
                          fontSize: 15,
                          fontWeight: 800,
                          border: `1.5px solid ${form.accentColor}`,
                          borderRadius: 4,
                          padding: '2px 6px',
                          color: '#0f172a',
                        }}
                      />
                    ) : (
                      <strong
                        onClick={() => studioMode === 'paint' && setEditingField('companyName')}
                        style={{
                          fontSize: 15,
                          color: '#0f172a',
                          fontWeight: 800,
                          cursor: studioMode === 'paint' ? 'pointer' : 'default',
                          borderBottom: studioMode === 'paint' ? '1px dashed #cbd5e1' : 'none',
                        }}
                        title={studioMode === 'paint' ? 'Click to edit company name' : undefined}
                      >
                        {form.companyName}
                      </strong>
                    )}
                    <span style={{ fontSize: 10, display: 'block', color: '#64748b', letterSpacing: '0.06em', fontWeight: 600 }}>
                      AUTOMOTIVE & FLEET
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#64748b', fontWeight: 600, alignItems: 'center' }}>
                  <span>Rentals</span>
                  <span>Mechanics</span>
                  <span>Bookings</span>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: '#e2ebe4',
                      display: 'grid',
                      placeItems: 'center',
                      color: '#1e293b',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    AL
                  </div>
                </div>
              </header>

              {/* 3. WELCOME & GREETING ROW */}
              <section
                style={{
                  marginBottom: 20,
                  position: 'relative',
                  outline: studioMode === 'paint' ? '1px dashed rgba(232, 168, 56, 0.3)' : 'none',
                  borderRadius: 8,
                  padding: 8,
                }}
              >
                {studioMode === 'paint' && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 8,
                      fontSize: 10,
                      color: form.accentColor,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                    onClick={() => openInspectorTo('hero')}
                  >
                    ✏️ Edit Greeting
                  </div>
                )}
                <p style={{ fontSize: 11, textTransform: 'uppercase', color: form.accentColor, letterSpacing: '0.08em', margin: '0 0 4px', fontWeight: 800 }}>
                  SATURDAY, 23 SEPTEMBER 2026
                </p>
                <h1 style={{ fontSize: viewport === 'mobile' ? 20 : 24, margin: '0 0 6px', color: '#0f172a', fontWeight: 800 }}>
                  Good afternoon, Alex <span style={{ color: form.accentColor }}>✦</span>
                </h1>
                {studioMode === 'paint' && editingField === 'welcomeSubtitle' ? (
                  <input
                    type="text"
                    value={form.welcomeSubtitle}
                    onChange={(e) => handleChange('welcomeSubtitle', e.target.value)}
                    onBlur={() => setEditingField(null)}
                    autoFocus
                    style={{
                      width: '100%',
                      fontSize: 13,
                      border: `1.5px solid ${form.accentColor}`,
                      borderRadius: 6,
                      padding: '4px 8px',
                      color: '#0f172a',
                    }}
                  />
                ) : (
                  <p
                    onClick={() => studioMode === 'paint' && setEditingField('welcomeSubtitle')}
                    style={{
                      fontSize: 13,
                      color: '#64748b',
                      margin: 0,
                      cursor: studioMode === 'paint' ? 'pointer' : 'default',
                      borderBottom: studioMode === 'paint' ? '1px dashed #cbd5e1' : 'none',
                    }}
                    title={studioMode === 'paint' ? 'Click to edit subtitle' : undefined}
                  >
                    {form.welcomeSubtitle}
                  </p>
                )}
              </section>

              {/* 4. QUICK ACTIONS ROW */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: viewport === 'mobile' ? '1fr' : 'repeat(3, 1fr)',
                  gap: 12,
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2ebe4',
                    borderRadius: 10,
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: '#f1f5f3', display: 'grid', placeItems: 'center', color: '#244d3b' }}>
                    <Car size={18} />
                  </div>
                  <div>
                    <strong style={{ fontSize: 13, display: 'block', color: '#0f172a' }}>Rent a Vehicle</strong>
                    <span style={{ fontSize: 11, color: '#64748b' }}>Browse our premium fleet</span>
                  </div>
                </div>

                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2ebe4',
                    borderRadius: 10,
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: '#f1f5f3', display: 'grid', placeItems: 'center', color: '#244d3b' }}>
                    <Wrench size={18} />
                  </div>
                  <div>
                    <strong style={{ fontSize: 13, display: 'block', color: '#0f172a' }}>Book a Mechanic</strong>
                    <span style={{ fontSize: 11, color: '#64748b' }}>On-demand mobile dispatch</span>
                  </div>
                </div>

                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2ebe4',
                    borderRadius: 10,
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: '#f1f5f3', display: 'grid', placeItems: 'center', color: '#244d3b' }}>
                    <CalendarDays size={18} />
                  </div>
                  <div>
                    <strong style={{ fontSize: 13, display: 'block', color: '#0f172a' }}>My Bookings</strong>
                    <span style={{ fontSize: 11, color: '#64748b' }}>Track active reservations</span>
                  </div>
                </div>
              </div>

              {/* 5. HERO SHOWCASE CARD (WITH REAL VIDEO BACKGROUND) */}
              <div
                style={{
                  position: 'relative',
                  borderRadius: 14,
                  overflow: 'hidden',
                  marginBottom: 24,
                  minHeight: viewport === 'mobile' ? 260 : 310,
                  outline: studioMode === 'paint' ? '2px dashed rgba(232, 168, 56, 0.4)' : 'none',
                  outlineOffset: 3,
                }}
              >
                {/* Paint Tag */}
                {studioMode === 'paint' && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 10,
                      right: 12,
                      zIndex: 30,
                      background: 'rgba(0,0,0,0.85)',
                      color: form.accentColor,
                      padding: '3px 10px',
                      borderRadius: 12,
                      fontSize: 10,
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      cursor: 'pointer',
                    }}
                    onClick={() => openInspectorTo('hero')}
                  >
                    <Edit3 size={11} /> Paint Hero Copy & Buttons
                  </div>
                )}

                {/* Video Background */}
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                >
                  <source src="/customer-videos/dashboardvidep.mp4" type="video/mp4" />
                </video>

                {/* Dark Gradient Overlay for contrast */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    background: 'linear-gradient(135deg, rgba(10, 16, 13, 0.88) 0%, rgba(10, 16, 13, 0.75) 50%, rgba(10, 16, 13, 0.85) 100%)',
                  }}
                />

                {/* Ambient Glow */}
                <div
                  style={{
                    position: 'absolute',
                    top: -40,
                    right: -40,
                    width: 200,
                    height: 200,
                    borderRadius: '50%',
                    background: form.accentColor,
                    filter: 'blur(70px)',
                    opacity: 0.35,
                  }}
                />

                {/* Hero Copy Overlay */}
                <div
                  style={{
                    position: 'relative',
                    zIndex: 10,
                    padding: viewport === 'mobile' ? '20px 16px' : '36px 32px',
                    color: '#ffffff',
                    maxWidth: 580,
                  }}
                >
                  <p
                    onClick={() => studioMode === 'paint' && setEditingField('heroEyebrow')}
                    style={{
                      fontSize: 10,
                      letterSpacing: '0.12em',
                      color: form.accentColor,
                      textTransform: 'uppercase',
                      fontWeight: 800,
                      margin: '0 0 8px',
                      cursor: studioMode === 'paint' ? 'pointer' : 'default',
                    }}
                  >
                    {form.heroEyebrow}
                  </p>

                  <h2
                    style={{
                      fontSize: viewport === 'mobile' ? 22 : 28,
                      fontWeight: 800,
                      lineHeight: 1.2,
                      margin: '0 0 10px',
                      color: '#ffffff',
                    }}
                  >
                    <span
                      onClick={() => studioMode === 'paint' && setEditingField('heroHeadline')}
                      style={{ cursor: studioMode === 'paint' ? 'pointer' : 'default' }}
                    >
                      {form.heroHeadline}
                    </span>
                    <br />
                    <em
                      onClick={() => studioMode === 'paint' && setEditingField('heroHeadlineEm')}
                      style={{
                        color: form.accentColor,
                        fontStyle: 'italic',
                        cursor: studioMode === 'paint' ? 'pointer' : 'default',
                      }}
                    >
                      {form.heroHeadlineEm}
                    </em>
                  </h2>

                  <p
                    onClick={() => studioMode === 'paint' && setEditingField('heroSubtitle')}
                    style={{
                      fontSize: 12,
                      color: '#cbd5e1',
                      margin: '0 0 20px',
                      lineHeight: 1.5,
                      cursor: studioMode === 'paint' ? 'pointer' : 'default',
                    }}
                  >
                    {form.heroSubtitle}
                  </p>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => studioMode === 'paint' && setEditingField('heroCtaRentalText')}
                      style={{
                        background: form.accentColor,
                        color: '#000000',
                        border: 'none',
                        borderRadius: 8,
                        padding: '10px 18px',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        boxShadow: `0 4px 14px ${form.accentColor}44`,
                      }}
                    >
                      {form.heroCtaRentalText}
                      <ChevronRight size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => studioMode === 'paint' && setEditingField('heroCtaServiceText')}
                      style={{
                        background: 'rgba(255,255,255,0.08)',
                        color: '#ffffff',
                        border: '1px solid rgba(255,255,255,0.25)',
                        borderRadius: 8,
                        padding: '10px 18px',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {form.heroCtaServiceText}
                    </button>
                  </div>
                </div>
              </div>

              {/* 6. SAMPLE CUSTOMER FAVORITE FLEET SECTION */}
              <section style={{ marginBottom: 26 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800 }}>
                      YOUR GARAGE
                    </span>
                    <h3 style={{ fontSize: 16, fontWeight: 800, margin: '2px 0 0', color: '#0f172a' }}>
                      Featured Luxury Fleet
                    </h3>
                  </div>
                  <span style={{ fontSize: 12, color: form.accentColor, fontWeight: 700, cursor: 'pointer' }}>
                    View all fleet →
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: viewport === 'mobile' ? '1fr' : 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: 14,
                  }}
                >
                  {PREVIEW_FLEET.slice(0, viewport === 'mobile' ? 2 : 3).map((v) => (
                    <div
                      key={v.name}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e2ebe4',
                        borderRadius: 12,
                        overflow: 'hidden',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      <div style={{ position: 'relative', height: 130, background: '#1e293b' }}>
                        <img
                          src={v.image}
                          alt={v.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        <span
                          style={{
                            position: 'absolute',
                            top: 8,
                            left: 8,
                            background: 'rgba(0,0,0,0.7)',
                            color: form.accentColor,
                            fontSize: 9,
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: 6,
                            backdropFilter: 'blur(4px)',
                          }}
                        >
                          {v.category}
                        </span>
                        <span
                          style={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            background: '#ffffff',
                            color: '#0f172a',
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 6,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                          }}
                        >
                          <Star size={11} fill="#eab308" color="#eab308" /> {v.rating}
                        </span>
                      </div>
                      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1 }}>
                        <div>
                          <strong style={{ fontSize: 13, color: '#0f172a', display: 'block', marginBottom: 4 }}>
                            {v.name}
                          </strong>
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            {v.features.join(' · ')}
                          </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTop: '1px solid #f1f5f3' }}>
                          <div>
                            <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{v.price}</span>
                            <small style={{ fontSize: 10, color: '#64748b' }}> / day</small>
                          </div>
                          <span
                            style={{
                              background: form.accentColor,
                              color: '#000000',
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '4px 10px',
                              borderRadius: 6,
                            }}
                          >
                            Rent
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 7. SHOWROOM & CONCIERGE SUPPORT BAR */}
              <section
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2ebe4',
                  borderRadius: 14,
                  padding: '16px 20px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  marginBottom: 20,
                  position: 'relative',
                  outline: studioMode === 'paint' ? '1px dashed rgba(232, 168, 56, 0.4)' : 'none',
                }}
              >
                {studioMode === 'paint' && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 12,
                      fontSize: 10,
                      color: form.accentColor,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                    onClick={() => openInspectorTo('business')}
                  >
                    ✏️ Edit Concierge & Support Details
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: form.accentColor,
                      display: 'grid',
                      placeItems: 'center',
                      color: '#000000',
                      fontWeight: 800,
                      fontSize: 14,
                    }}
                  >
                    LS
                  </div>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#64748b', textTransform: 'uppercase' }}>
                      Showroom & Concierge Support
                    </span>
                    <div
                      onClick={() => studioMode === 'paint' && setEditingField('supportPhone')}
                      style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: '2px 0', cursor: studioMode === 'paint' ? 'pointer' : 'default' }}
                    >
                      {form.supportPhone}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      <span onClick={() => studioMode === 'paint' && setEditingField('address')} style={{ cursor: studioMode === 'paint' ? 'pointer' : 'default' }}>
                        {form.address}
                      </span>
                      {' · '}
                      <span onClick={() => studioMode === 'paint' && setEditingField('supportEmail')} style={{ cursor: studioMode === 'paint' ? 'pointer' : 'default' }}>
                        {form.supportEmail}
                      </span>
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
                      padding: '3px 8px',
                      borderRadius: 999,
                    }}
                  >
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#16a34a' }} />
                    AVAILABLE NOW
                  </div>
                  <div
                    onClick={() => studioMode === 'paint' && setEditingField('workingHours')}
                    style={{ fontSize: 11, color: '#64748b', marginTop: 4, cursor: studioMode === 'paint' ? 'pointer' : 'default' }}
                  >
                    {form.workingHours}
                  </div>
                </div>
              </section>

              {/* 8. CUSTOMER FOOTER */}
              <footer style={{ padding: '16px 0 6px', borderTop: '1px solid #e2ebe4', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#94a3b8' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <strong style={{ color: '#0f172a' }}>{form.companyName}</strong>
                  <span>· Premier automotive solutions</span>
                </div>
                <span>© 2026 {form.companyName}. All rights reserved.</span>
              </footer>

            </div>
          </div>
        </div>

        {/* ── SLIDE-OUT CANVAS INSPECTOR DRAWER ─────────────────── */}
        {inspectorOpen && (
          <div
            style={{
              width: 380,
              flexShrink: 0,
              background: 'var(--admin-card-bg, #1a1f2e)',
              border: '1px solid var(--admin-border, #2d3748)',
              borderRadius: 14,
              padding: 20,
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
              position: 'sticky',
              top: 20,
              maxHeight: 'calc(100vh - 40px)',
              overflowY: 'auto',
            }}
          >
            {/* Inspector Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid var(--admin-border, #2d3748)', paddingBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sliders size={16} color="var(--admin-accent, #e8a838)" />
                <h3 style={{ fontSize: 15, fontWeight: 800, color: '#ffffff', margin: 0 }}>
                  Canvas Inspector
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectorOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Inspector Navigation Tabs */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              <button
                type="button"
                onClick={() => setActiveInspectorTab('banner')}
                style={{
                  flex: 1,
                  background: activeInspectorTab === 'banner' ? 'var(--admin-accent, #e8a838)' : 'rgba(255,255,255,0.06)',
                  color: activeInspectorTab === 'banner' ? '#000000' : '#cbd5e1',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 4px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Banner
              </button>
              <button
                type="button"
                onClick={() => setActiveInspectorTab('hero')}
                style={{
                  flex: 1,
                  background: activeInspectorTab === 'hero' ? 'var(--admin-accent, #e8a838)' : 'rgba(255,255,255,0.06)',
                  color: activeInspectorTab === 'hero' ? '#000000' : '#cbd5e1',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 4px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Hero
              </button>
              <button
                type="button"
                onClick={() => setActiveInspectorTab('business')}
                style={{
                  flex: 1,
                  background: activeInspectorTab === 'business' ? 'var(--admin-accent, #e8a838)' : 'rgba(255,255,255,0.06)',
                  color: activeInspectorTab === 'business' ? '#000000' : '#cbd5e1',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 4px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Business
              </button>
              <button
                type="button"
                onClick={() => setActiveInspectorTab('theme')}
                style={{
                  flex: 1,
                  background: activeInspectorTab === 'theme' ? 'var(--admin-accent, #e8a838)' : 'rgba(255,255,255,0.06)',
                  color: activeInspectorTab === 'theme' ? '#000000' : '#cbd5e1',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 4px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Theme
              </button>
            </div>

            {/* TAB 1: BANNER */}
            {activeInspectorTab === 'banner' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#ffffff' }}>Banner Visibility</label>
                  <input
                    type="checkbox"
                    checked={form.showBanner}
                    onChange={(e) => handleChange('showBanner', e.target.checked)}
                    style={{ accentColor: form.accentColor, cursor: 'pointer' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                    Banner Text (with Promo Code)
                  </label>
                  <textarea
                    rows={3}
                    value={form.bannerText}
                    onChange={(e) => handleChange('bannerText', e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--admin-border, #2d3748)',
                      borderRadius: 8,
                      padding: '8px 10px',
                      color: '#ffffff',
                      fontSize: 12,
                    }}
                  />
                  <small style={{ fontSize: 10, color: '#94a3b8' }}>Include `Code: XYZ` to dynamically update default voucher.</small>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Button Text</label>
                    <input
                      type="text"
                      value={form.bannerLinkText}
                      onChange={(e) => handleChange('bannerLinkText', e.target.value)}
                      style={{
                        width: '100%',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid var(--admin-border, #2d3748)',
                        borderRadius: 8,
                        padding: '6px 8px',
                        color: '#ffffff',
                        fontSize: 12,
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Destination</label>
                    <select
                      value={form.bannerLinkView}
                      onChange={(e) => handleChange('bannerLinkView', e.target.value as any)}
                      style={{
                        width: '100%',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid var(--admin-border, #2d3748)',
                        borderRadius: 8,
                        padding: '6px 8px',
                        color: '#ffffff',
                        fontSize: 12,
                      }}
                    >
                      <option value="rentals">Rentals</option>
                      <option value="services">Services</option>
                      <option value="bookings">Bookings</option>
                      <option value="none">None</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 6 }}>Background Color</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {BANNER_BG_PRESETS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => handleChange('bannerBg', color)}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 4,
                          background: color,
                          border: form.bannerBg === color ? '2px solid #ffffff' : '1px solid rgba(0,0,0,0.3)',
                          cursor: 'pointer',
                        }}
                      />
                    ))}
                    <input
                      type="color"
                      value={form.bannerBg}
                      onChange={(e) => handleChange('bannerBg', e.target.value)}
                      style={{ width: 24, height: 24, border: 'none', background: 'transparent', cursor: 'pointer' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 6 }}>Text Color</label>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <label style={{ fontSize: 12, color: '#cbd5e1', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="textColor"
                        checked={form.bannerTextColor === '#000000'}
                        onChange={() => handleChange('bannerTextColor', '#000000')}
                      /> Dark
                    </label>
                    <label style={{ fontSize: 12, color: '#cbd5e1', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="textColor"
                        checked={form.bannerTextColor === '#ffffff'}
                        onChange={() => handleChange('bannerTextColor', '#ffffff')}
                      /> Light
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: HERO & GREETING */}
            {activeInspectorTab === 'hero' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Welcome Subtitle</label>
                  <input
                    type="text"
                    value={form.welcomeSubtitle}
                    onChange={(e) => handleChange('welcomeSubtitle', e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--admin-border, #2d3748)',
                      borderRadius: 8,
                      padding: '6px 8px',
                      color: '#ffffff',
                      fontSize: 12,
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Hero Eyebrow</label>
                  <input
                    type="text"
                    value={form.heroEyebrow}
                    onChange={(e) => handleChange('heroEyebrow', e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--admin-border, #2d3748)',
                      borderRadius: 8,
                      padding: '6px 8px',
                      color: '#ffffff',
                      fontSize: 12,
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Main Headline</label>
                    <input
                      type="text"
                      value={form.heroHeadline}
                      onChange={(e) => handleChange('heroHeadline', e.target.value)}
                      style={{
                        width: '100%',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid var(--admin-border, #2d3748)',
                        borderRadius: 8,
                        padding: '6px 8px',
                        color: '#ffffff',
                        fontSize: 12,
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Italic Highlight</label>
                    <input
                      type="text"
                      value={form.heroHeadlineEm}
                      onChange={(e) => handleChange('heroHeadlineEm', e.target.value)}
                      style={{
                        width: '100%',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid var(--admin-border, #2d3748)',
                        borderRadius: 8,
                        padding: '6px 8px',
                        color: '#ffffff',
                        fontSize: 12,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Hero Description</label>
                  <textarea
                    rows={2}
                    value={form.heroSubtitle}
                    onChange={(e) => handleChange('heroSubtitle', e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--admin-border, #2d3748)',
                      borderRadius: 8,
                      padding: '6px 8px',
                      color: '#ffffff',
                      fontSize: 12,
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Button 1 (Rentals)</label>
                    <input
                      type="text"
                      value={form.heroCtaRentalText}
                      onChange={(e) => handleChange('heroCtaRentalText', e.target.value)}
                      style={{
                        width: '100%',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid var(--admin-border, #2d3748)',
                        borderRadius: 8,
                        padding: '6px 8px',
                        color: '#ffffff',
                        fontSize: 12,
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Button 2 (Mechanic)</label>
                    <input
                      type="text"
                      value={form.heroCtaServiceText}
                      onChange={(e) => handleChange('heroCtaServiceText', e.target.value)}
                      style={{
                        width: '100%',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid var(--admin-border, #2d3748)',
                        borderRadius: 8,
                        padding: '6px 8px',
                        color: '#ffffff',
                        fontSize: 12,
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: BUSINESS & CONCIERGE */}
            {activeInspectorTab === 'business' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Brand / Company Name</label>
                  <input
                    type="text"
                    value={form.companyName}
                    onChange={(e) => handleChange('companyName', e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--admin-border, #2d3748)',
                      borderRadius: 8,
                      padding: '6px 8px',
                      color: '#ffffff',
                      fontSize: 12,
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Support Phone Number</label>
                  <input
                    type="text"
                    value={form.supportPhone}
                    onChange={(e) => handleChange('supportPhone', e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--admin-border, #2d3748)',
                      borderRadius: 8,
                      padding: '6px 8px',
                      color: '#ffffff',
                      fontSize: 12,
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Concierge Support Email</label>
                  <input
                    type="text"
                    value={form.supportEmail}
                    onChange={(e) => handleChange('supportEmail', e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--admin-border, #2d3748)',
                      borderRadius: 8,
                      padding: '6px 8px',
                      color: '#ffffff',
                      fontSize: 12,
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Showroom Address</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => handleChange('address', e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--admin-border, #2d3748)',
                      borderRadius: 8,
                      padding: '6px 8px',
                      color: '#ffffff',
                      fontSize: 12,
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Operating Hours</label>
                  <input
                    type="text"
                    value={form.workingHours}
                    onChange={(e) => handleChange('workingHours', e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--admin-border, #2d3748)',
                      borderRadius: 8,
                      padding: '6px 8px',
                      color: '#ffffff',
                      fontSize: 12,
                    }}
                  />
                </div>
              </div>
            )}

            {/* TAB 4: THEME */}
            {activeInspectorTab === 'theme' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 700, display: 'block', marginBottom: 8 }}>
                    Brand Accent Palette
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {COLOR_PRESETS.map((p) => {
                      const isSelected = form.accentColor.toLowerCase() === p.value.toLowerCase()
                      return (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => handleChange('accentColor', p.value)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 10px',
                            background: isSelected ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.2)',
                            border: isSelected ? `2px solid ${p.value}` : '1px solid var(--admin-border, #2d3748)',
                            borderRadius: 8,
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          <span style={{ width: 14, height: 14, borderRadius: '50%', background: p.value }} />
                          <span style={{ fontSize: 11, color: '#ffffff', fontWeight: 600 }}>{p.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Custom Hex Value</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      value={form.accentColor}
                      onChange={(e) => handleChange('accentColor', e.target.value)}
                      style={{
                        flex: 1,
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid var(--admin-border, #2d3748)',
                        borderRadius: 8,
                        padding: '6px 8px',
                        color: '#ffffff',
                        fontSize: 12,
                      }}
                    />
                    <input
                      type="color"
                      value={form.accentColor}
                      onChange={(e) => handleChange('accentColor', e.target.value)}
                      style={{ width: 34, height: 32, border: 'none', background: 'transparent', cursor: 'pointer' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Inspector Footer Actions */}
            <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--admin-border, #2d3748)', display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={handleReset}
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  padding: '8px',
                  color: '#94a3b8',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Reset
              </button>
              <button
                type="button"
                onClick={handleSave}
                style={{
                  flex: 1,
                  background: form.accentColor,
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px',
                  color: '#000000',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Save
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  )
}
