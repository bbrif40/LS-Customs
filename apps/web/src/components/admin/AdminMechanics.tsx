/**
 * AdminMechanics — Mechanics Management with admin-level access.
 * Uses real Supabase data via useAdminMechanics hook (mechanic_profiles joined with profiles).
 * Admins can view all mechanics with full details and deactivate them.
 */
import { useState } from 'react'
import { Search, MapPin, Star, UserX, X, Loader2, Shield } from 'lucide-react'
import { useAdminMechanics } from '../../hooks/useAdminData'
import type { MechanicProfile, Profile } from '@ls-customs/shared-types'

type MechanicWithProfile = MechanicProfile & {
  profiles: Profile[] | null
}

export function AdminMechanics() {
  const { data: mechanics, loading, error, refetch, deactivateMechanic } = useAdminMechanics()
  const [searchQuery, setSearchQuery] = useState('')
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'available' | 'unavailable'>('all')

  const filteredMechanics = mechanics?.filter((m) => {
    const profile = m.profiles?.[0]
    if (!profile) return false
    if (availabilityFilter === 'available' && !m.is_available) return false
    if (availabilityFilter === 'unavailable' && m.is_available) return false
    const searchTerm = searchQuery.toLowerCase()
    if (searchTerm) {
      const nameMatch = profile.full_name?.toLowerCase().includes(searchTerm)
      const specialtyMatch = m.specialties?.some(s => s.toLowerCase().includes(searchTerm))
      if (!nameMatch && !specialtyMatch) return false
    }
    return true
  }) || []

  const totalMechanics = mechanics?.length || 0
  const availableMechanics = mechanics?.filter(m => m.is_available).length || 0
  const unavailableMechanics = totalMechanics - availableMechanics

  const handleDeactivate = async (mechanic: MechanicWithProfile) => {
    const profile = mechanic.profiles?.[0]
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

  const formatSpecialties = (specialties: string[] | null) => {
    if (!specialties || specialties.length === 0) return '—'
    return specialties.join(', ')
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
            placeholder="Search by name or specialty..."
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
            <table className="admin-table" style={{ minWidth: 900 }}>
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
                  const profile = mechanic.profiles?.[0]
                  const initials = profile?.full_name
                    ?.split(' ')
                    .map(n => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase() || '??'

                  return (
                    <tr key={mechanic.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div className="admin-tech-avatar" style={{ width: 40, height: 40, fontSize: 14 }}>
                            {initials}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600 }}>{profile?.full_name || 'Unknown'}</div>
                            <div style={{ fontSize: 12, color: 'var(--admin-muted)' }}>
                              ID: {mechanic.id.slice(0, 8)}...
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: 13 }}>
                          {profile?.phone && (
                            <div>📞 {profile.phone}</div>
                          )}
                          {profile?.avatar_url && (
                            <div style={{ marginTop: 4 }}>
                              <img src={profile.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ maxWidth: 200 }}>
                        <div style={{ fontSize: 13, color: 'var(--admin-text)' }}>
                          {formatSpecialties(mechanic.specialties)}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {mechanic.years_experience != null ? `${mechanic.years_experience} yrs` : '—'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          <Star size={14} className="admin-tech-rating-star" fill="currentColor" style={{ color: '#e8a838' }} />
                          {mechanic.rating_avg > 0 ? mechanic.rating_avg.toFixed(1) : '—'}
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