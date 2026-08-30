/**
 * AdminUsers — All Users View.
 * - Read-only by default.
 * - Clicking a row opens the user's transaction logbook (rentals + mechanic
 *   services, paginated 10/page, newest first).
 * - Per-row "Flag user" button. Clicking it opens a confirmation modal;
 *   confirming calls the `flag-user` Edge Function which bans the auth user
 *   (sets banned_until ~100 years out) and deletes the profiles row
 *   (CASCADE cleans dependent rows). The only way to unban is to manually
 *   clear `banned_until` in the Supabase Studio auth dashboard.
 * - Phone and address are still read-only on this screen (per the saved
 *   edits from earlier). City is read-only; the customer owns that field.
 */
import { useState } from 'react'
import { Search, User, Shield, Wrench, Loader2, Flag, AlertTriangle, X } from 'lucide-react'
import {
  useAdminUsers,
  useAdminUserAddresses,
  flagUser,
} from '../../hooks/useAdminData'
import type { Profile } from '@ls-customs/shared-types'
import { UserLogbookModal } from './UserLogbookModal'

const roleIcons = {
  admin: Shield,
  mechanic: Wrench,
  customer: User,
}

const roleLabels = {
  admin: 'Administrator',
  mechanic: 'Mechanic',
  customer: 'Customer',
}

export function AdminUsers() {
  const { data: users, loading, error, refetch } = useAdminUsers()
  const { addressesByCustomerId } = useAdminUserAddresses()

  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'mechanic' | 'customer'>('all')

  // Flag-user confirmation state
  const [flaggingUser, setFlaggingUser] = useState<Profile | null>(null)
  const [flagSubmitting, setFlagSubmitting] = useState(false)
  const [flagError, setFlagError] = useState<string | null>(null)

  // Logbook modal state (opens on row click)
  const [logbookUser, setLogbookUser] = useState<Profile | null>(null)

  const filteredUsers = users?.filter((u) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false
    const searchTerm = searchQuery.toLowerCase()
    if (searchTerm) {
      const nameMatch = u.full_name?.toLowerCase().includes(searchTerm)
      const emailMatch = u.id?.toLowerCase().includes(searchTerm)
      if (!nameMatch && !emailMatch) return false
    }
    return true
  }) || []

  const roleCounts = {
    admin: users?.filter(u => u.role === 'admin').length || 0,
    mechanic: users?.filter(u => u.role === 'mechanic').length || 0,
    customer: users?.filter(u => u.role === 'customer').length || 0,
    total: users?.length || 0,
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    } catch {
      return dateString
    }
  }

  const getInitials = (name: string | null) => {
    if (!name) return '??'
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
  }

  const openFlagModal = (user: Profile) => {
    setFlaggingUser(user)
    setFlagError(null)
  }

  const closeFlagModal = () => {
    if (flagSubmitting) return
    setFlaggingUser(null)
    setFlagError(null)
  }

  const confirmFlag = async () => {
    if (!flaggingUser) return
    setFlagSubmitting(true)
    setFlagError(null)
    try {
      await flagUser(flaggingUser.id)
      setFlaggingUser(null)
      await refetch()
    } catch (err) {
      setFlagError(err instanceof Error ? err.message : 'Failed to flag user')
    } finally {
      setFlagSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="admin-main" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <Loader2 size={32} className="spin" style={{ color: '#e8a838' }} />
        <p style={{ marginTop: 12, color: 'var(--admin-muted)' }}>Loading users...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="admin-main" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', textAlign: 'center' }}>
        <div style={{ color: '#ef4444' }}>Failed to load users</div>
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
          <h1>All Users</h1>
          <p>Complete user directory — enabled by admin RLS policy.</p>
        </div>
        <span className="admin-status-badge active" style={{ fontSize: 12 }}>
          Read-Only View
        </span>
      </div>

      {/* ── Stats ────────────────────────────────────────────── */}
      <div className="admin-stats-row three">
        {[
          { label: 'Total Users', value: roleCounts.total, icon: 'total' },
          { label: 'Administrators', value: roleCounts.admin, icon: 'admin' },
          { label: 'Mechanics', value: roleCounts.mechanic, icon: 'mechanic' },
          { label: 'Customers', value: roleCounts.customer, icon: 'customer' },
        ].map((stat) => (
          <div className="admin-stat-card" key={stat.label}>
            <div className="admin-stat-header">
              <span className="admin-stat-label">{stat.label}</span>
              <div className={`admin-stat-icon ${stat.icon}`}>
                {stat.icon === 'total' && '👥'}
                {stat.icon === 'admin' && '🛡️'}
                {stat.icon === 'mechanic' && '🔧'}
                {stat.icon === 'customer' && '👤'}
              </div>
            </div>
            <div className="admin-stat-value">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* ── Filter Row ───────────────────────────────────────── */}
      <div className="admin-filter-row" style={{ flexWrap: 'wrap', gap: 12 }}>
        {['all', 'admin', 'mechanic', 'customer'].map((f) => (
          <button
            key={f}
            className={`admin-filter-btn ${roleFilter === f ? 'active' : ''}`}
            onClick={() => setRoleFilter(f as 'all' | 'admin' | 'mechanic' | 'customer')}
          >
            {f === 'all' ? 'All Users' : roleLabels[f as keyof typeof roleLabels]}
            {f !== 'all' && <span style={{ marginLeft: 6, background: '#374151', padding: '2px 6px', borderRadius: 10, fontSize: 11 }}>{roleCounts[f as keyof typeof roleCounts]}</span>}
          </button>
        ))}
        <div className="admin-fleet-search" style={{ flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ color: '#9ca3af' }} />
          <input
            type="text"
            placeholder="Search by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* ── Users Table ──────────────────────────────────────── */}
      <div className="admin-vehicle-grid" style={{ gridTemplateColumns: '1fr' }}>
        {filteredUsers.length === 0 ? (
          <div className="admin-empty-state" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: 'var(--admin-muted)' }}>
            No users found.
          </div>
        ) : (
          <div style={{ gridColumn: '1 / -1', overflowX: 'auto' }}>
            <table className="admin-table" style={{ minWidth: 800 }}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Contact</th>
                  <th>Avatar</th>
                  <th>Account Created</th>
                  <th>Last Updated</th>
                  <th style={{ width: 120 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const RoleIcon = roleIcons[user.role] || User
                  const addr = addressesByCustomerId[user.id]

                  return (
                    <tr
                      key={user.id}
                      onClick={() => setLogbookUser(user)}
                      style={{ cursor: 'pointer' }}
                      title="Click to view transaction logbook"
                    >
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div className="admin-tech-avatar" style={{ width: 40, height: 40, fontSize: 14 }}>
                            {getInitials(user.full_name)}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600 }}>{user.full_name || 'Unnamed'}</div>
                            <div style={{ fontSize: 11, color: 'var(--admin-muted)', fontFamily: 'monospace' }}>
                              {user.id}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`admin-status-badge ${user.role === 'admin' ? 'active' : user.role === 'mechanic' ? 'pending' : 'inactive'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <RoleIcon size={12} />
                          {roleLabels[user.role]}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: 13 }}>
                          {user.phone ? (
                            <div>📞 {user.phone}</div>
                          ) : (
                            <div style={{ color: 'var(--admin-muted)' }}>—</div>
                          )}
                          {addr ? (
                            <div style={{ color: 'var(--admin-muted)', marginTop: 2 }}>
                              📍 {addr.line1}{addr.city ? `, ${addr.city}` : ''}
                            </div>
                          ) : (
                            <div style={{ color: 'var(--admin-muted)', marginTop: 2, fontStyle: 'italic' }}>
                              No address on file
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', color: '#9ca3af', fontSize: 14 }}>
                            {getInitials(user.full_name)}
                          </div>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--admin-muted)' }}>
                        {formatDate(user.created_at)}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--admin-muted)' }}>
                        {formatDate(user.updated_at)}
                      </td>
                      <td>
                        {user.role === 'admin' ? (
                          <span style={{ fontSize: 11, color: 'var(--admin-muted)', fontStyle: 'italic' }}>
                            protected
                          </span>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              openFlagModal(user)
                            }}
                            className="admin-vehicle-btn secondary"
                            style={{
                              minWidth: 90,
                              color: 'var(--admin-danger)',
                              borderColor: 'rgba(239, 68, 68, 0.3)',
                            }}
                            aria-label={`Flag ${user.full_name || 'user'}`}
                          >
                            <Flag size={12} /> Flag user
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Transaction Logbook Modal ───────────────────────── */}
      {logbookUser && (
        <UserLogbookModal
          user={logbookUser}
          onClose={() => setLogbookUser(null)}
        />
      )}

      {/* ── Flag User Confirmation Modal ──────────────────────── */}
      {flaggingUser && (
        <div className="admin-modal-overlay" onClick={closeFlagModal}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="admin-modal-header">
              <h2 style={{ color: 'var(--admin-danger)' }}>Flag this user?</h2>
              <button className="admin-modal-close" onClick={closeFlagModal} aria-label="Close">
                <X size={20} />
              </button>
            </div>

            <div className="admin-modal-body">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  borderRadius: 8,
                  padding: '12px 14px',
                }}
              >
                <AlertTriangle size={20} style={{ color: 'var(--admin-danger)', flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: 13, color: 'var(--admin-ink)' }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>
                    This action is permanent and cannot be undone from the app.
                  </p>
                  <p style={{ margin: '6px 0 0', color: 'var(--admin-muted)' }}>
                    <strong style={{ color: 'var(--admin-ink)' }}>{flaggingUser.full_name || 'This user'}</strong> will be banned from signing in and their profile data (addresses, bookings, support tickets) will be deleted.
                  </p>
                </div>
              </div>

              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--admin-muted)', lineHeight: 1.7 }}>
                <li>Auth sign-in is blocked immediately (banned_until ≈ 100 years).</li>
                <li>The email cannot be re-used to create a new account.</li>
                <li>Restoration requires manually clearing <code>banned_until</code> in Supabase Studio.</li>
              </ul>

              {flagError && (
                <div className="admin-modal-error" style={{ margin: 0 }}>
                  {flagError}
                </div>
              )}
            </div>

            <div className="admin-modal-footer">
              <button
                type="button"
                className="admin-modal-btn secondary"
                onClick={closeFlagModal}
                disabled={flagSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-modal-btn primary"
                onClick={() => void confirmFlag()}
                disabled={flagSubmitting}
                style={{
                  background: 'var(--admin-danger)',
                  borderColor: 'var(--admin-danger)',
                }}
              >
                {flagSubmitting ? (
                  <Loader2 size={14} className="spin" />
                ) : (
                  <Flag size={14} />
                )}
                {flagSubmitting ? ' Flagging…' : ' Yes, flag user'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
