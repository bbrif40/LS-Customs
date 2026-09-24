/**
 * AdminAuditLogs — Full-page audit log viewer for the admin panel.
 * Shows who checked records and who made changes, with filters for
 * admin, action type, record type, and time range.
 */
import { useState, useEffect } from 'react'
import {
  ShieldCheck,
  Eye,
  Activity,
  UserCheck,
  Edit3,
  Search,
  RefreshCw,
  Clock,
  Users,
  Layers,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useAdminAuditLogs } from '../../hooks/useAdminAuditLogs'
import type { AuditActionType } from '../../services/auditLogger'

function formatRelativeTime(dateString?: string): string {
  if (!dateString) return 'Recently'
  const date = new Date(dateString)
  const now = new Date()
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000)
  if (diffSec < 45) return 'Just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  if (diffSec < 172800) return 'Yesterday'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getActionBadge(action: AuditActionType | string) {
  const map: Record<string, { color: string; bg: string; label: string; icon: JSX.Element }> = {
    view:          { color: '#60a5fa', bg: 'rgba(96,165,250,.12)', label: 'View',          icon: <Eye size={11} /> },
    status_change: { color: '#fbbf24', bg: 'rgba(251,191,36,.12)', label: 'Status Change', icon: <Activity size={11} /> },
    assign:        { color: '#34d399', bg: 'rgba(52,211,153,.12)', label: 'Assign',        icon: <UserCheck size={11} /> },
    update:        { color: '#a78bfa', bg: 'rgba(167,139,250,.12)', label: 'Update',       icon: <Edit3 size={11} /> },
    create:        { color: '#6ee7b7', bg: 'rgba(110,231,183,.12)', label: 'Create',       icon: <Activity size={11} /> },
    delete:        { color: '#f87171', bg: 'rgba(248,113,113,.12)', label: 'Delete',       icon: <Activity size={11} /> },
  }

  const def = map[action] || { color: '#9ca3af', bg: 'rgba(156,163,175,.12)', label: action, icon: <Activity size={11} /> }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 9px',
        borderRadius: 12,
        fontSize: 10.5,
        fontWeight: 700,
        color: def.color,
        background: def.bg,
        letterSpacing: 0.2,
        whiteSpace: 'nowrap',
        border: `1px solid ${def.color}33`,
        textTransform: 'uppercase',
      }}
    >
      {def.icon}
      {def.label}
    </span>
  )
}

function getRecordTypePill(recordType: string) {
  const labels: Record<string, string> = {
    service_booking: 'Service',
    vehicle_booking: 'Rental',
    ticket:          'Ticket',
    vehicle:         'Vehicle',
    mechanic:        'Mechanic',
    user:            'User',
    service:         'Service',
    payment:         'Payment',
    system:          'System',
  }
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: '2px 7px',
        borderRadius: 4,
        background: '#1c2f3b',
        color: '#94a3b8',
        letterSpacing: 0.3,
      }}
    >
      {labels[recordType] || recordType}
    </span>
  )
}

// Stat card component
function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string
  value: number | string
  icon: JSX.Element
  color: string
}) {
  return (
    <div
      style={{
        background: 'var(--admin-card)',
        border: '1px solid var(--admin-border)',
        borderRadius: 12,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flex: 1,
        minWidth: 130,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: `${color}18`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div
          style={{
            fontSize: 24,
            fontWeight: 800,
            color: 'var(--admin-ink)',
            lineHeight: 1,
            letterSpacing: -0.5,
          }}
        >
          {value}
        </div>
        <div style={{ fontSize: 11, color: 'var(--admin-muted)', marginTop: 3 }}>{label}</div>
      </div>
    </div>
  )
}

const RECORD_TYPES = [
  'all', 'service_booking', 'vehicle_booking', 'ticket', 'vehicle', 'mechanic', 'user', 'payment',
]

const ACTION_TYPES: Array<AuditActionType | 'all'> = [
  'all', 'view', 'status_change', 'assign', 'update', 'create', 'delete',
]

export function AdminAuditLogs() {
  const {
    logs,
    rawLogsCount,
    loading,
    error,
    filters,
    setFilters,
    uniqueAdmins,
    stats,
    refetch,
  } = useAdminAuditLogs()

  const [isRefreshing, setIsRefreshing] = useState(false)
  const PAGE_SIZE = 10
  const [currentPage, setCurrentPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(logs.length / PAGE_SIZE))
  const safePage = Math.min(Math.max(1, currentPage), totalPages)
  const paginatedLogs = logs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  useEffect(() => {
    setCurrentPage(1)
  }, [filters])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await refetch()
    setTimeout(() => setIsRefreshing(false), 500)
  }

  return (
    <div className="admin-main">
      {/* ── Top Bar ─────────────────────────────────────────── */}
      <div className="admin-topbar">
        <div className="admin-topbar-left">
          <h1>Audit Logs</h1>
          <p>Track who inspected records and what actions were taken by each admin.</p>
        </div>
        <div className="admin-topbar-right">
          <div className="admin-live-badge">
            <span className="admin-live-dot" />
            REAL-TIME TRACKING
          </div>
          <button
            className="admin-add-btn"
            onClick={() => void handleRefresh()}
            disabled={isRefreshing}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} className={isRefreshing ? 'spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Error Banner ─────────────────────────────────────── */}
      {error && (
        <div
          style={{
            marginBottom: 20,
            padding: '12px 16px',
            background: 'rgba(239,68,68,.1)',
            border: '1px solid rgba(239,68,68,.3)',
            borderRadius: 10,
            color: '#f87171',
            fontSize: 13,
          }}
        >
          <strong>Error loading audit logs:</strong> {error}
          {error.includes('does not exist') && (
            <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: '#9ca3af' }}>
              The audit_logs table may not be migrated yet. Run the Supabase migrations.
            </span>
          )}
        </div>
      )}

      {/* ── KPI Stats ─────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 14,
          marginBottom: 24,
          flexWrap: 'wrap',
        }}
      >
        <StatCard
          label="Total Events"
          value={stats.totalEntries}
          icon={<ShieldCheck size={18} />}
          color="#e5b842"
        />
        <StatCard
          label="Record Views"
          value={stats.viewCount}
          icon={<Eye size={18} />}
          color="#60a5fa"
        />
        <StatCard
          label="Admin Actions"
          value={stats.actionCount}
          icon={<Activity size={18} />}
          color="#fbbf24"
        />
        <StatCard
          label="Active Admins"
          value={stats.activeAdminsCount}
          icon={<Users size={18} />}
          color="#34d399"
        />
      </div>

      {/* ── Filters ──────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 20,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--admin-muted)',
            }}
          />
          <input
            type="text"
            placeholder="Search admin, record, or action…"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="admin-search-input"
            style={{ paddingLeft: 34 }}
          />
        </div>

        {/* Admin filter */}
        <select
          value={filters.adminEmail}
          onChange={(e) => setFilters({ ...filters, adminEmail: e.target.value })}
          className="admin-filter-select"
          style={{ flex: '0 0 auto' }}
          aria-label="Filter by admin"
        >
          <option value="all">All Admins</option>
          {uniqueAdmins.map(({ email, name }) => (
            <option key={email} value={email}>
              {name}
            </option>
          ))}
        </select>

        {/* Action Type filter */}
        <select
          value={filters.actionType}
          onChange={(e) =>
            setFilters({ ...filters, actionType: e.target.value as AuditActionType | 'all' })
          }
          className="admin-filter-select"
          aria-label="Filter by action"
        >
          {ACTION_TYPES.map((a) => (
            <option key={a} value={a}>
              {a === 'all' ? 'All Actions' : a.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>

        {/* Record Type filter */}
        <select
          value={filters.recordType}
          onChange={(e) => setFilters({ ...filters, recordType: e.target.value })}
          className="admin-filter-select"
          aria-label="Filter by record type"
        >
          {RECORD_TYPES.map((r) => (
            <option key={r} value={r}>
              {r === 'all'
                ? 'All Records'
                : r.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>

        {/* Time Range filter */}
        <select
          value={filters.timeRange}
          onChange={(e) =>
            setFilters({
              ...filters,
              timeRange: e.target.value as 'today' | '7days' | '30days' | 'all',
            })
          }
          className="admin-filter-select"
          aria-label="Filter by time range"
        >
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="7days">Last 7 Days</option>
          <option value="30days">Last 30 Days</option>
        </select>

        <div style={{ fontSize: 11, color: 'var(--admin-muted)', whiteSpace: 'nowrap', marginLeft: 4 }}>
          Showing <strong style={{ color: 'var(--admin-ink)' }}>{logs.length}</strong> of{' '}
          <strong style={{ color: 'var(--admin-ink)' }}>{rawLogsCount}</strong> events
        </div>
      </div>

      {/* ── Audit Log Table ───────────────────────────────────── */}
      <div
        style={{
          background: 'var(--admin-card)',
          border: '1px solid var(--admin-border)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        {/* Table Header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 130px 120px 110px 120px',
            padding: '11px 18px',
            background: 'var(--admin-hover)',
            borderBottom: '1px solid var(--admin-border)',
            fontSize: 10.5,
            fontWeight: 700,
            color: 'var(--admin-muted)',
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            gap: 12,
          }}
        >
          <span>Admin &amp; Target Record</span>
          <span>Action</span>
          <span>Record Type</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Layers size={11} /> Category
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
            <Clock size={11} /> Time
          </span>
        </div>

        {/* Loading skeleton */}
        {loading && logs.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ color: 'var(--admin-muted)', fontSize: 13 }}>Loading audit logs…</div>
          </div>
        )}

        {/* Empty state */}
        {!loading && logs.length === 0 && (
          <div
            style={{
              padding: '48px 24px',
              textAlign: 'center',
              color: 'var(--admin-muted)',
            }}
          >
            <ShieldCheck size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: 'var(--admin-ink)' }}>
              No audit events found
            </div>
            <div style={{ fontSize: 12 }}>
              {rawLogsCount === 0
                ? 'No admin actions have been recorded yet. Start using the admin portal to generate audit events.'
                : 'Try adjusting your filters to see more results.'}
            </div>
          </div>
        )}

        {/* Log Rows */}
        {paginatedLogs.map((entry, idx) => {
          const details = entry.details || {}
          const descriptionParts: string[] = []
          if (entry.action_type === 'status_change') {
            descriptionParts.push(
              `${details.old_status || '?'} → ${details.new_status || '?'}`
            )
          } else if (entry.action_type === 'assign') {
            descriptionParts.push('Mechanic reassignment')
          } else if (entry.action_type === 'view') {
            descriptionParts.push('Inspected record')
          }

          return (
            <div
              key={entry.id || `${idx}-${entry.created_at}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 130px 120px 110px 120px',
                padding: '12px 18px',
                borderBottom:
                  idx < logs.length - 1 ? '1px solid var(--admin-border)' : 'none',
                alignItems: 'center',
                gap: 12,
                transition: 'background .15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'var(--admin-hover)'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = ''
              }}
            >
              {/* Admin + Record */}
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    color: 'var(--admin-ink)',
                    fontSize: 13,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {entry.admin_name || 'Admin'}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--admin-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginTop: 1,
                  }}
                >
                  {entry.admin_email && (
                    <span style={{ marginRight: 6, fontFamily: 'monospace' }}>
                      {entry.admin_email}
                    </span>
                  )}
                  {entry.record_title && (
                    <span style={{ color: '#e2c97e' }}>→ {entry.record_title}</span>
                  )}
                  {descriptionParts.length > 0 && (
                    <span style={{ color: '#6b8c9a', marginLeft: 4 }}>
                      ({descriptionParts.join(', ')})
                    </span>
                  )}
                </div>
              </div>

              {/* Action Badge */}
              <div>{getActionBadge(entry.action_type)}</div>

              {/* Record ID short */}
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 11,
                  color: 'var(--admin-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {entry.record_id ? String(entry.record_id).slice(0, 10) + '…' : '—'}
              </div>

              {/* Record Type pill */}
              <div>{getRecordTypePill(entry.record_type)}</div>

              {/* Timestamp */}
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--admin-muted)',
                  textAlign: 'right',
                  whiteSpace: 'nowrap',
                }}
              >
                {formatRelativeTime(entry.created_at)}
              </div>
            </div>
          )
        })}

        {totalPages > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 18px',
              borderTop: '1px solid var(--admin-border)',
              fontSize: 12,
              color: 'var(--admin-muted)',
              background: 'var(--admin-card)',
            }}
          >
            <span>
              Showing {(safePage - 1) * PAGE_SIZE + 1} to{' '}
              {Math.min(safePage * PAGE_SIZE, logs.length)} of {logs.length} entries
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                className="admin-pagination-btn"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--admin-border)',
                  background: 'none',
                  color: safePage === 1 ? 'var(--admin-muted)' : 'var(--admin-ink)',
                  cursor: safePage === 1 ? 'not-allowed' : 'pointer',
                  opacity: safePage === 1 ? 0.45 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 12,
                }}
              >
                <ChevronLeft size={13} /> Previous
              </button>
              <span style={{ fontWeight: 600, color: 'var(--admin-ink)', minWidth: 60, textAlign: 'center' }}>
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                className="admin-pagination-btn"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--admin-border)',
                  background: 'none',
                  color: safePage === totalPages ? 'var(--admin-muted)' : 'var(--admin-ink)',
                  cursor: safePage === totalPages ? 'not-allowed' : 'pointer',
                  opacity: safePage === totalPages ? 0.45 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 12,
                }}
              >
                Next <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
