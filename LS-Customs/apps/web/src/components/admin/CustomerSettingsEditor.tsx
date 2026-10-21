import { useState } from 'react'
import { Palette, X, Save } from 'lucide-react'
import { useCustomerSiteSettings } from '../../hooks/useCustomerSiteSettings'

export function CustomerSettingsEditor() {
  const { rawSettings, saveSettings, error, saving } = useCustomerSiteSettings()
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState(rawSettings)

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => { setDraft(rawSettings); setIsOpen(true) }}
        style={{
          position: 'fixed',
          bottom: 24,
          left: 24,
          zIndex: 9999,
          background: '#151b2b',
          color: 'white',
          border: '1px solid #2a3441',
          borderRadius: 24,
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          fontWeight: 600,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          cursor: 'pointer',
        }}
      >
        <Palette size={16} aria-hidden="true" />
        Website appearance
      </button>
    )
  }

  const handleSave = async () => {
    const appearanceSettings = {
      ...rawSettings,
      accentColor: draft.accentColor,
      showBanner: draft.showBanner,
      bannerBg: draft.bannerBg,
      bannerTextColor: draft.bannerTextColor,
    }
    if (await saveSettings(appearanceSettings)) setIsOpen(false)
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 24,
        left: 24,
        width: 320,
        maxHeight: 'calc(100vh - 48px)',
        background: '#151b2b',
        border: '1px solid #2a3441',
        borderRadius: 12,
        zIndex: 9999,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {error && <p role="alert" style={{ color: '#ff9d9d', padding: 12, margin: 0 }}>{error}</p>}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #2a3441', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, color: '#fff' }}>
          <Palette size={16} aria-hidden="true" />
          Website appearance
        </h3>
        <button type="button" aria-label="Close website appearance" onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: '#8fa09c', cursor: 'pointer', padding: 4 }}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div style={{ padding: 20, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ color: '#aab8b7', fontSize: 11, lineHeight: 1.5, margin: 0 }}>
          Adjust the theme accent and promo banner appearance. Edit website wording in the text panel.
        </p>

        <div>
          <label htmlFor="site-accent-color" style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8fa09c', marginBottom: 6 }}>Theme accent color</label>
          <input
            id="site-accent-color"
            type="color"
            value={draft.accentColor}
            onChange={event => setDraft(current => ({ ...current, accentColor: event.target.value }))}
            style={{ width: '100%', height: 36, padding: 0, border: 'none', borderRadius: 4, cursor: 'pointer' }}
          />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#fff', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={draft.showBanner}
            onChange={event => setDraft(current => ({ ...current, showBanner: event.target.checked }))}
          />
          Show promo banner
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label htmlFor="site-banner-background" style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8fa09c', marginBottom: 6 }}>Banner background</label>
            <input
              id="site-banner-background"
              type="color"
              value={draft.bannerBg}
              onChange={event => setDraft(current => ({ ...current, bannerBg: event.target.value }))}
              style={{ width: '100%', height: 36, padding: 0, border: 'none', borderRadius: 4, cursor: 'pointer' }}
            />
          </div>
          <div>
            <label htmlFor="site-banner-text-color" style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8fa09c', marginBottom: 6 }}>Banner text color</label>
            <input
              id="site-banner-text-color"
              type="color"
              value={draft.bannerTextColor}
              onChange={event => setDraft(current => ({ ...current, bannerTextColor: event.target.value }))}
              style={{ width: '100%', height: 36, padding: 0, border: 'none', borderRadius: 4, cursor: 'pointer' }}
            />
          </div>
        </div>

        <a
          href="/admin?view=website-text"
          style={{ color: '#e1b75e', fontSize: 12, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}
        >
          Edit website wording
        </a>
      </div>

      <div style={{ padding: 16, borderTop: '1px solid #2a3441', display: 'flex', gap: 12 }}>
        <button type="button" disabled={saving} onClick={handleSave} style={{ flex: 1, padding: '9px', background: '#e8a838', border: 'none', color: '#000', fontWeight: 600, borderRadius: 6, fontSize: 12, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
          <Save size={14} aria-hidden="true" /> Save appearance
        </button>
      </div>
    </div>
  )
}
