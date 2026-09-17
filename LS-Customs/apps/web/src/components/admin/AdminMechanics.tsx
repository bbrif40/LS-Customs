/**
 * AdminMechanics — Mechanics Management with admin-level access.
 * Uses real Supabase data via useAdminMechanics hook (mechanic_profiles joined with profiles).
 * Admins can view all mechanics with full details and deactivate them.
 */
import { useState } from 'react'
import {
  Search,
  MapPin,
  Star,
  UserX,
  Loader2,
  Shield,
  Phone,
  Wrench,
  Droplets,
  Disc,
  Activity,
  Zap,
  Lightbulb,
  Cog,
  ShieldAlert,
} from 'lucide-react'
import { useAdminMechanics, type MechanicWithProfile } from '../../hooks/useAdminData'
import type { Profile } from '@ls-customs/shared-types'

const SPECIALTY_CONFIG: Record<
  string,
  { label: string; icon: typeof Wrench; color: string; bg: string; border: string }
> = {
  routine_fluid_service: {
    label: 'Routine & Fluid Service',
    icon: Droplets,
    color: '#60a5fa',
    bg: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.3)',
  },
  tire_wheel_care: {
    label: 'Tire & Wheel Care',
    icon: Disc,
    color: '#34d399',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.3)',
  },
  diagnostic_repair: {
    label: 'Diagnostic & Repair',
    icon: Activity,
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.3)',
  },
  engine_diagnostics: {
    label: 'Engine Diagnostics',
    icon: Cog,
    color: '#fb923c',
    bg: 'rgba(251, 146, 60, 0.12)',
    border: 'rgba(251, 146, 60, 0.3)',
  },
  brake_services: {
    label: 'Brake Services',
    icon: ShieldAlert,
    color: '#f87171',
    bg: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.3)',
  },
  electrical_battery_care: {
    label: 'Electrical & Battery Care',
    icon: Zap,
    color: '#fbbf24',
    bg: 'rgba(251, 191, 36, 0.12)',
    border: 'rgba(251, 191, 36, 0.3)',
  },
  lighting_visibility: {
    label: 'Lighting & Visibility',
    icon: Lightbulb,
    color: '#c084fc',
    bg: 'rgba(192, 132, 252, 0.12)',
    border: 'rgba(192, 132, 252, 0.3)',
  },
  quick_fixes: {
    label: 'Quick Fixes',
    icon: Wrench,
    color: '#2dd4bf',
    bg: 'rgba(45, 212, 191, 0.12)',
    border: 'rgba(45, 212, 191, 0.3)',
  },
}

function getSpecialtyDetails(key: string) {
  const cfg = SPECIALTY_CONFIG[key]
  if (cfg) return cfg
  const label = key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
  return {
    label,
    icon: Wrench,
    color: '#94a3b8',
    bg: 'rgba(148, 163, 184, 0.12)',
    border: 'rgba(148, 163, 184, 0.3)',
  }
}

function getMechanicProfile(mechanic: MechanicWithProfile): Profile | null {
  if (!mechanic) return null
  const p = mechanic.profiles
  if (!p) return null
  if (Array.isArray(p)) return p[0] ?? null
  if (typeof p === 'object') return p as Profile
  return null
}

export function AdminMechanics() {
  const { data: mechanics, loading, error, refetch, deactivateMechanic } = useAdminMechanics()
  const [searchQuery, setSearchQuery] = useState('')
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'available' | 'unavailable'>('all')

  const filteredMechanics = mechanics?.filter((m) => {
    const profile = getMechanicProfile(m)
    if (availabilityFilter === 'available' && !m.is_available) return false
    if (availabilityFilter === 'unavailable' && m.is_available) return false
    const searchTerm = searchQuery.toLowerCase().trim()
    if (searchTerm) {
      const name = (profile?.full_name ?? '').toLowerCase()
      const phone = (profile?.phone ?? '').toLowerCase()
      const nameMatch = name.includes(searchTerm)
      const phoneMatch = phone.includes(searchTerm)
      const specialtyMatch = m.specialties?.some((s) => {
        const label = getSpecialtyDetails(s).label.toLowerCase()
        return s.toLowerCase().includes(searchTerm) || label.includes(searchTerm)
      })
      if (!nameMatch && !phoneMatch && !specialtyMatch) return false
    }
    return true
  }) || []

  const totalMechanics = mechanics?.length || 0
  const availableMechanics = mechanics?.filter((m) => m.is_available).length || 0
  const unavailableMechanics = totalMechanics - availableMechanics

  const handleDeactivate = async (mechanic: MechanicWithProfile) => {
    const profile = getMechanicProfile(mechanic)
    const name = profile?.full_name || 'Unknown Mechanic'
    if (!window.confirm(`Deactivate "${name}"? They will no longer receive job assignments.`)) {
      return
    }
    try {
      await deactivateMechanic(mechanic.id)
      await refetch()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to deactivate mechanic')
    }
  }

  const formatLocation = (lat: number | null, lng: number | null) => {
    if (lat == null || lng == null) return 'Location not set'
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
  }

  if (loading) {
    return (
      <div className="admin-main" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <Loader2 size={32} className="spin" style={{ color: '#e8a838' }} />
        <p style={{ marginTop: 12, color: 'var(--admin-muted)' }}>Loading mechanics...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="admin-main" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', textAlign: 'center' }}>
        <div style={{ color: '#ef4444' }}>Failed to load mechanics</div>
        <p style={{ color: 'var(--admin-muted)', marginTop: 8 }}>{error}</p>
        <button onClick={refetch} className="admin-add-btn" style={{ marginTop: 16 }}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="admin-main">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="admin-fleet-header">
        <div>
          <h1>Mechanics Management</h1>
          <p>View and manage all registered mechanics.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="admin-status-badge active" style={{ fontSize: 12 }}>
            <Shield size={12} style={{ marginRight: 4 }} /> Admin Access
          </span>
        </div>
      </div>

      {/* ── Stats ────────────────────────────────────────────── */}
      <div className="admin-stats-row three">
        {[
          { label: 'Total Mechanics', value: totalMechanics, icon: 'total' },
          { label: 'Available', value: availableMechanics, icon: 'active' },
          { label: 'Unavailable', value: unavailableMechanics, icon: 'inactive' },
        ].map((stat) => (
          <div className="admin-stat-card" key={stat.label}>
            <div className="admin-stat-header">
              <span className="admin-stat-label">{stat.label}</span>
              <div className={`admin-stat-icon ${stat.icon}`}>
                {stat.icon === 'total' && '🔧'}
                {stat.icon === 'active' && '✅'}
                {stat.icon === 'inactive' && '⚠'}
              </div>
            </div>
            <div className="admin-stat-value">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* ── Filter Row ───────────────────────────────────────── */}
      <div className="admin-filter-row" style={{ flexWrap: 'wrap', gap: 12 }}>
        {['all', 'available', 'unavailable'].map((f) => (
          <button
            key={f}
            className={`admin-filter-btn ${availabilityFilter === f ? 'active' : ''}`}
            onClick={() => setAvailabilityFilter(f as 'all' | 'available' | 'unavailable')}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <div className="admin-fleet-search" style={{ flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ color: '#9ca3af' }} />
          <input
            type="text"
            placeholder="Search by name, phone, or specialty..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* ── Mechanics Table ──────────────────────────────────── */}
      <div className="admin-vehicle-grid" style={{ gridTemplateColumns: '1fr' }}>
        {filteredMechanics.length === 0 ? (
          <div className="admin-empty-state" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: 'var(--admin-muted)' }}>
            No mechanics found.
          </div>
        ) : (
          <div style={{ gridColumn: '1 / -1', overflowX: 'auto' }}>
            <table className="admin-table" style={{ minWidth: 920 }}>
              <thead>
                <tr>
                  <th>Mechanic</th>
                  <th>Contact</th>
                  <th>Specialties</th>
                  <th>Experience</th>
                  <th>Rating</th>
                  <th>Availability</th>
                  <th>Location</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMechanics.map((mechanic) => {
                  const profile = getMechanicProfile(mechanic)
                  const fullName = profile?.full_name?.trim() || 'Mechanic'
                  const initials = fullName
                    .split(/\s+/)
                    .map((n) => n[0])
                    .filter(Boolean)
                    .join('')
                    .slice(0, 2)
                    .toUpperCase() || 'M'

                  return (
                    <tr key={mechanic.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div
                            className="admin-tech-avatar"
                            style={{
                              width: 42,
                              height: 42,
                              fontSize: 14,
                              fontWeight: 700,
                              position: 'relative',
                              display: 'grid',
                              placeItems: 'center',
                              borderRadius: '50%',
                              background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
                              border: '1px solid rgba(232, 168, 56, 0.4)',
                              color: '#e8a838',
                              flexShrink: 0,
                              overflow: 'hidden',
                            }}
                          >
                            {profile?.avatar_url ? (
                              <img
                                src={profile.avatar_url}
                                alt={fullName}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            ) : (
                              <span>{initials}</span>
                            )}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14, color: '#f1f5f9' }}>{fullName}</div>
                            <div style={{ fontSize: 11, color: 'var(--admin-muted)', fontFamily: 'monospace', marginTop: 2 }}>
                              ID: {mechanic.id.slice(0, 8)}...
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {profile?.phone ? (
                            <a
                              href={`tel:${profile.phone}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                color: '#38bdf8',
                                textDecoration: 'none',
                                fontWeight: 500,
                              }}
                            >
                              <Phone size={13} />
                              {profile.phone}
                            </a>
                          ) : (
                            <span style={{ color: 'var(--admin-muted)', fontSize: 12 }}>No phone listed</span>
                          )}
                        </div>
                      </td>
                      <td style={{ minWidth: 240, maxWidth: 360 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {mechanic.specialties && mechanic.specialties.length > 0 ? (
                            mechanic.specialties.map((spec) => {
                              const item = getSpecialtyDetails(spec)
                              const SpecIcon = item.icon
                              return (
                                <span
                                  key={spec}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 5,
                                    padding: '4px 9px',
                                    borderRadius: 6,
                                    fontSize: 11,
                                    fontWeight: 500,
                                    background: item.bg,
                                    color: item.color,
                                    border: `1px solid ${item.border}`,
                                    lineHeight: 1.25,
                                  }}
                                >
                                  <SpecIcon size={11} style={{ opacity: 0.9 }} />
                                  {item.label}
                                </span>
                              )
                            })
                          ) : (
                            <span style={{ color: 'var(--admin-muted)', fontSize: 12 }}>None assigned</span>
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {mechanic.years_experience != null ? `${mechanic.years_experience} yrs` : '—'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          <Star size={14} className="admin-tech-rating-star" fill="currentColor" style={{ color: '#e8a838' }} />
                          {mechanic.rating_avg > 0 ? Number(mechanic.rating_avg).toFixed(1) : '—'}
                          <span style={{ fontSize: 11, color: 'var(--admin-muted)' }}>({mechanic.rating_count})</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`admin-status-badge ${mechanic.is_available ? 'active' : 'pending'}`}>
                          {mechanic.is_available ? 'Available' : 'Unavailable'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--admin-muted)' }}>
                          <MapPin size={12} />
                          {formatLocation(mechanic.current_lat, mechanic.current_lng)}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="admin-vehicle-btn secondary"
                            onClick={() => handleDeactivate(mechanic)}
                            disabled={!mechanic.is_available}
                            style={{ padding: '6px 10px', fontSize: 11, opacity: mechanic.is_available ? 1 : 0.5 }}
                          >
                            <UserX size={12} /> Deactivate
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}