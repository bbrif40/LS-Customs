import { useState } from 'react'
import { Shield, ShieldAlert, Palette, Image as ImageIcon, CheckCircle2, Save, Trash2, Plus, Loader2, ShieldCheck } from 'lucide-react'
import { useAdminUsers } from '../../hooks/useAdminData'
import type { Profile } from '@ls-customs/shared-types'

export function AdminSettings() {
  const { data: users, loading, refetch } = useAdminUsers()
  const [accentColor, setAccentColor] = useState('#e8a838')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  
  const admins = users?.filter(u => u.role === 'admin') || []

  const handleSaveTheme = () => {
    setSaving(true)
    setTimeout(() => {
      setSaving(false)
      alert('Theme settings saved successfully (UI only for now).')
    }, 800)
  }

  const handleAddAdmin = () => {
    const email = window.prompt('Enter the email address of the user to promote to Admin:')
    if (email) {
      alert(`Backend logic to promote ${email} to admin is not yet implemented.`)
    }
  }

  const handleRemoveAdmin = (admin: Profile) => {
    if (window.confirm(`Are you sure you want to remove admin privileges from ${admin.full_name}?`)) {
      alert(`Backend logic to demote ${admin.full_name} is not yet implemented.`)
    }
  }

  if (loading) {
    return (
      <div className="admin-main" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <Loader2 size={32} className="spin" style={{ color: '#e8a838' }} />
        <p style={{ marginTop: 12, color: 'var(--admin-muted)' }}>Loading settings...</p>
      </div>
    )
  }

  return (
    <div className="admin-main" style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div className="admin-fleet-header">
        <div>
          <h1>Settings</h1>
          <p>Manage system administrators and customize brand UI.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 32 }}>
        
        {/* -- User Management (Admins) -- */}
        <section className="admin-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: 18, display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 4px' }}>
                <Shield size={20} style={{ color: 'var(--admin-accent)' }} />
                Administrator Management
              </h2>
              <p style={{ fontSize: 13, color: 'var(--admin-muted)', margin: 0 }}>
                Users with admin privileges have full access to this dashboard.
              </p>
            </div>
            <button 
              className="admin-add-btn" 
              onClick={handleAddAdmin}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={14} /> Add Admin
            </button>
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid var(--admin-border)', borderRadius: 8 }}>
            <table className="admin-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>ID / Email</th>
                  <th>Role</th>
                  <th style={{ width: 80, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.map(admin => (
                  <tr key={admin.id}>
                    <td style={{ fontWeight: 600 }}>{admin.full_name || 'Unnamed Admin'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--admin-muted)' }}>{admin.id}</td>
                    <td>
                      <span className="admin-status-badge active" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <ShieldCheck size={12} /> Admin
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        title="Remove Admin"
                        onClick={() => handleRemoveAdmin(admin)}
                        style={{
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          color: '#ef4444',
                          cursor: 'pointer',
                          padding: 6,
                          borderRadius: 6,
                          display: 'inline-flex'
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {admins.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: 24, color: 'var(--admin-muted)' }}>
                      No administrators found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* -- UI Customization -- */}
        <section className="admin-card" style={{ padding: 24 }}>
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 18, display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 4px' }}>
              <Palette size={20} style={{ color: 'var(--admin-accent)' }} />
              UI Customization
            </h2>
            <p style={{ fontSize: 13, color: 'var(--admin-muted)', margin: 0 }}>
              Customize the look and feel of the customer-facing website.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
            
            {/* Brand Color */}
            <div style={{ background: 'var(--admin-bg)', border: '1px solid var(--admin-border)', borderRadius: 8, padding: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                Primary Brand Color
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input 
                  type="color" 
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  style={{ width: 48, height: 48, padding: 0, border: 'none', borderRadius: 8, cursor: 'pointer', background: 'transparent' }}
                />
                <input 
                  type="text" 
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  style={{ 
                    background: 'var(--admin-card)', 
                    border: '1px solid var(--admin-border)', 
                    color: 'var(--admin-text)', 
                    padding: '8px 12px', 
                    borderRadius: 6,
                    fontFamily: 'monospace',
                    fontSize: 13,
                    flex: 1
                  }}
                />
              </div>
            </div>

            {/* Logo Upload */}
            <div style={{ background: 'var(--admin-bg)', border: '1px solid var(--admin-border)', borderRadius: 8, padding: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                Brand Logo
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ 
                  width: 64, height: 64, 
                  background: 'var(--admin-card)', 
                  border: '1px dashed var(--admin-muted)', 
                  borderRadius: 8,
                  display: 'grid', placeItems: 'center',
                  color: 'var(--admin-muted)',
                  overflow: 'hidden'
                }}>
                  {logoFile ? (
                    <img src={URL.createObjectURL(logoFile)} alt="Logo Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <ImageIcon size={24} />
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <label 
                    style={{ 
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      background: 'rgba(255,255,255,0.05)', border: '1px solid var(--admin-border)',
                      padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                      color: 'var(--admin-text)'
                    }}
                  >
                    Upload New Logo
                    <input 
                      type="file" 
                      accept="image/*" 
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        if (e.target.files?.[0]) setLogoFile(e.target.files[0])
                      }}
                    />
                  </label>
                  <p style={{ fontSize: 11, color: 'var(--admin-muted)', margin: '6px 0 0' }}>
                    Recommended: SVG or PNG, transparent background.
                  </p>
                </div>
              </div>
            </div>

          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
            <button 
              className="admin-add-btn" 
              onClick={handleSaveTheme}
              disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
              {saving ? 'Saving...' : 'Save Appearance'}
            </button>
          </div>

        </section>
      </div>
    </div>
  )
}
