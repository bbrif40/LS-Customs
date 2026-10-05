import { useState } from 'react'
import { Palette, X, Save, RefreshCcw } from 'lucide-react'
import { useCustomerSiteSettings } from '../../hooks/useCustomerSiteSettings'

export function CustomerSettingsEditor() {
  const { settings, saveSettings, resetSettings } = useCustomerSiteSettings()
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState(settings)

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
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
          cursor: 'pointer'
        }}
      >
        <Palette size={16} />
        Live Edit Website
      </button>
    )
  }

  const handleSave = () => {
    saveSettings(draft)
    setIsOpen(false)
  }

  const handleReset = () => {
    if (window.confirm('Reset all settings to default?')) {
      resetSettings()
      setIsOpen(false)
    }
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
        overflow: 'hidden'
      }}
    >
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #2a3441', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, color: '#fff' }}>
          <Palette size={16} />
          Live Editor
        </h3>
        <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: '#8fa09c', cursor: 'pointer', padding: 4 }}>
          <X size={16} />
        </button>
      </div>
      
      <div style={{ padding: 20, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8fa09c', marginBottom: 6 }}>Theme Color</label>
          <input 
            type="color" 
            value={draft.accentColor}
            onChange={e => setDraft({ ...draft, accentColor: e.target.value })}
            style={{ width: '100%', height: 36, padding: 0, border: 'none', borderRadius: 4, cursor: 'pointer' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8fa09c', marginBottom: 6 }}>Welcome Subtitle (Dashboard)</label>
          <input 
            type="text" 
            value={draft.welcomeSubtitle}
            onChange={e => setDraft({ ...draft, welcomeSubtitle: e.target.value })}
            style={{ width: '100%', padding: '8px 12px', background: '#0a0d14', border: '1px solid #2a3441', borderRadius: 4, color: '#fff', fontSize: 12 }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8fa09c', marginBottom: 6 }}>Hero Headline</label>
          <input 
            type="text" 
            value={draft.heroHeadline}
            onChange={e => setDraft({ ...draft, heroHeadline: e.target.value })}
            style={{ width: '100%', padding: '8px 12px', background: '#0a0d14', border: '1px solid #2a3441', borderRadius: 4, color: '#fff', fontSize: 12 }}
          />
        </div>

        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#fff', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={draft.showBanner}
              onChange={e => setDraft({ ...draft, showBanner: e.target.checked })}
            />
            Show Promo Banner
          </label>
        </div>

        {draft.showBanner && (
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8fa09c', marginBottom: 6 }}>Promo Banner Text</label>
            <textarea 
              value={draft.bannerText}
              onChange={e => setDraft({ ...draft, bannerText: e.target.value })}
              rows={3}
              style={{ width: '100%', padding: '8px 12px', background: '#0a0d14', border: '1px solid #2a3441', borderRadius: 4, color: '#fff', fontSize: 12, resize: 'vertical' }}
            />
          </div>
        )}

      </div>

      <div style={{ padding: 16, borderTop: '1px solid #2a3441', display: 'flex', gap: 12 }}>
        <button onClick={handleReset} style={{ flex: 1, padding: '8px', background: 'transparent', border: '1px solid #2a3441', color: '#8fa09c', borderRadius: 6, fontSize: 12, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
          <RefreshCcw size={14} /> Reset
        </button>
        <button onClick={handleSave} style={{ flex: 2, padding: '8px', background: '#e8a838', border: 'none', color: '#000', fontWeight: 600, borderRadius: 6, fontSize: 12, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
          <Save size={14} /> Save Live
        </button>
      </div>
    </div>
  )
}
