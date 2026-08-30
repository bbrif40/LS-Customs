/**
 * AdminTickets — read & manage support tickets raised by customers
 * through the chatbot's structured form (or the legacy free-text path).
 * Admins can filter by status/category, search by tracking #, and inline
 * edit status / category / priority. Click a row to expand and see the
 * full description, customer contact, and timestamps.
 *
 * RLS via is_admin() gates all writes.
 */
import { useMemo, useState } from 'react'
import { Search, TicketPlus, Loader2, ChevronLeft, ChevronRight, RefreshCw, Copy, Check } from 'lucide-react'
import {
  useAdminTickets,
  type SupportTicketWithCustomer,
  type TicketStatus,
  type TicketPriority,
  type TicketCategory,
} from '../../hooks/useAdminData'
import { TicketThread } from '../common/TicketThread'

const statusLabels: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

const statusColors: Record<TicketStatus, string> = {
  open: '#ef4444',
  in_progress: '#e8a838',
  resolved: '#22c55e',
  closed: '#6b7280',
}

const priorityColors: Record<TicketPriority, string> = {
  low: '#6b7280',
  medium: '#3b82f6',
  high: '#f59e0b',
  critical: '#ef4444',
}

const categoryLabels: Record<TicketCategory, string> = {
  general: 'General',
  rental: 'Rental',
  billing: 'Billing',
  bug: 'Bug',
  mechanic: 'Mechanic',
  other: 'Other',
}

const categoryColors: Record<TicketCategory, string> = {
  rental: '#3b82f6',
  billing: '#22c55e',
  bug: '#ef4444',
  mechanic: '#f59e0b',
  general: '#6b7280',
  other: '#8b5cf6',
}

const ALL_CATEGORIES: TicketCategory[] = ['general', 'rental', 'billing', 'bug', 'mechanic', 'other']
const ALL_PRIORITIES: TicketPriority[] = ['low', 'medium', 'high', 'critical']
const ALL_STATUSES: TicketStatus[] = ['open', 'in_progress', 'resolved', 'closed']

const pageSize = 10

export function AdminTickets() {
  const { data: tickets, loading, error, refetch, updateField } = useAdminTickets()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | TicketStatus>('all')
  const [categoryFilter, setCategoryFilter] = useState<'all' | TicketCategory>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null) // `${id}:${field}` so two dropdowns can edit independently
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const list = tickets ?? []
    return list.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false
      const q = searchQuery.trim().toLowerCase()
      if (!q) return true
      const customer = t.profiles?.[0]?.full_name?.toLowerCase() ?? ''
      return (
        t.id.toLowerCase().includes(q) ||
        t.tracking_number.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        customer.includes(q)
      )
    })
  }, [tickets, statusFilter, categoryFilter, searchQuery])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  const counts = useMemo(() => {
    const list = tickets ?? []
    return {
      total: list.length,
      open: list.filter((t) => t.status === 'open').length,
      in_progress: list.filter((t) => t.status === 'in_progress').length,
      resolved: list.filter((t) => t.status === 'resolved').length,
      closed: list.filter((t) => t.status === 'closed').length,
      critical: list.filter((t) => t.priority === 'critical' && t.status !== 'closed' && t.status !== 'resolved').length,
    }
  }, [tickets])

  const handleFieldChange = async <K extends 'status' | 'category' | 'priority'>(
    ticket: SupportTicketWithCustomer,
    field: K,
    value: SupportTicketWithCustomer[K],
  ) => {
    if (ticket[field] === value) return
    const key = `${ticket.id}:${field}`
    setBusyKey(key)
    try {
      await updateField(ticket.id, field, value)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : `Failed to update ${field}`)
    } finally {
      setBusyKey(null)
    }
  }

  const handleCopyTracking = async (ticket: SupportTicketWithCustomer) => {
    try {
      await navigator.clipboard.writeText(ticket.tracking_number)
      setCopiedId(ticket.id)
      window.setTimeout(() => setCopiedId((curr) => (curr === ticket.id ? null : curr)), 1500)
    } catch {
      // Fallback: select the text in a temp input
      window.prompt('Copy this tracking number:', ticket.tracking_number)
    }
  }

  if (loading) {
    return (
      <div className="admin-main" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <Loader2 size={32} className="spin" style={{ color: '#e8a838' }} />
        <p style={{ marginTop: 12, color: 'var(--admin-muted)' }}>Loading tickets...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="admin-main" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', textAlign: 'center' }}>
        <div style={{ color: '#ef4444' }}>Failed to load tickets</div>
        <p style={{ color: 'var(--admin-muted)', marginTop: 8 }}>{error}</p>
        <button onClick={() => { void refetch() }} className="admin-add-btn" style={{ marginTop: 16 }}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="admin-main">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="admin-fleet-header">
        <div>
          <h1>Ticket Requests</h1>
          <p>Support tickets submitted by customers via the LS Customs Assistant.</p>
        </div>
        <button
          className="admin-add-btn"
          onClick={() => { void refetch() }}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* ── Stat strip ──────────────────────────────────────── */}
      <div className="admin-stats-row" style={{ marginBottom: 16 }}>
        {(['open', 'in_progress', 'resolved', 'closed'] as TicketStatus[]).map((s) => (
          <div className="admin-stat-card" key={s}>
            <div className="admin-stat-header">
              <span className="admin-stat-label">{statusLabels[s]}</span>
              <div
                className="admin-stat-icon"
                style={{ background: `${statusColors[s]}20`, color: statusColors[s] }}
              >
                <TicketPlus size={16} />
              </div>
            </div>
            <div className="admin-stat-value">{counts[s]}</div>
          </div>
        ))}
        {counts.critical > 0 && (
          <div
            className="admin-stat-card"
            style={{ borderColor: '#ef4444', boxShadow: '0 0 0 1px #ef4444 inset' }}
          >
            <div className="admin-stat-header">
              <span className="admin-stat-label" style={{ color: '#ef4444' }}>Critical</span>
              <div
                className="admin-stat-icon"
                style={{ background: '#ef444420', color: '#ef4444' }}
              >
                <TicketPlus size={16} />
              </div>
            </div>
            <div className="admin-stat-value" style={{ color: '#ef4444' }}>{counts.critical}</div>
          </div>
        )}
      </div>

      {/* ── Filters: status + category + search ─────────────── */}
      <div className="admin-filter-row" style={{ marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--admin-muted)', fontSize: 13, alignSelf: 'center' }}>Status:</span>
        {(['all', ...ALL_STATUSES] as const).map((s) => (
          <button
            key={s}
            className={`admin-filter-btn ${statusFilter === s ? 'active' : ''}`}
            onClick={() => { setStatusFilter(s); setCurrentPage(1) }}
            style={
              s !== 'all'
                ? { borderColor: statusColors[s], color: statusColors[s] }
                : undefined
            }
          >
            {s === 'all' ? 'All' : statusLabels[s]}
            <span style={{ background: '#374151', padding: '1px 6px', borderRadius: 10, fontSize: 11, marginLeft: 6 }}>
              {s === 'all' ? counts.total : counts[s]}
            </span>
          </button>
        ))}
      </div>

      <div className="admin-filter-row" style={{ marginBottom: 16, gap: 8, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--admin-muted)', fontSize: 13, alignSelf: 'center' }}>Category:</span>
        {(['all', ...ALL_CATEGORIES] as const).map((c) => (
          <button
            key={c}
            className={`admin-filter-btn ${categoryFilter === c ? 'active' : ''}`}
            onClick={() => { setCategoryFilter(c); setCurrentPage(1) }}
            style={
              c !== 'all'
                ? { borderColor: categoryColors[c], color: categoryColors[c] }
                : undefined
            }
          >
            {c === 'all' ? 'All' : categoryLabels[c]}
          </button>
        ))}

        <div style={{ flex: 1 }} />
        <div className="admin-fleet-search" style={{ minWidth: 280 }}>
          <Search size={14} style={{ color: '#9ca3af' }} />
          <input
            type="text"
            placeholder="Search by tracking #, subject, customer..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
          />
        </div>
      </div>

      {/* ── Tickets Table ───────────────────────────────────── */}
      <div className="admin-vehicle-grid" style={{ gridTemplateColumns: '1fr' }}>
        {filtered.length === 0 ? (
          <div
            className="admin-empty-state"
            style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: 'var(--admin-muted)' }}
          >
            No ticket requests found.
          </div>
        ) : (
          <div style={{ gridColumn: '1 / -1', overflowX: 'auto' }}>
            <table className="admin-table" style={{ minWidth: 1100 }}>
              <thead>
                <tr>
                  <th>Tracking #</th>
                  <th>Customer</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((ticket) => {
                  const customerName = ticket.profiles?.[0]?.full_name || 'Unknown'
                  const isExpanded = expandedId === ticket.id
                  const isCopied = copiedId === ticket.id
                  return (
                    <TicketRow
                      key={ticket.id}
                      ticket={ticket}
                      customerName={customerName}
                      isExpanded={isExpanded}
                      isCopied={isCopied}
                      busyKey={busyKey}
                      onToggleExpand={() => setExpandedId(isExpanded ? null : ticket.id)}
                      onCopyTracking={() => void handleCopyTracking(ticket)}
                      onFieldChange={handleFieldChange}
                    />
                  )
                })}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="admin-transactions-pagination" style={{ marginTop: 16 }}>
                <span>
                  Showing {(safePage - 1) * pageSize + 1} to{' '}
                  {Math.min(safePage * pageSize, filtered.length)} of {filtered.length} entries
                </span>
                <div className="admin-pagination-btns">
                  <button
                    className="admin-pagination-btn"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', color: 'var(--admin-muted)' }}>
                    Page {safePage} of {totalPages}
                  </span>
                  <button
                    className="admin-pagination-btn"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

interface TicketRowProps {
  ticket: SupportTicketWithCustomer
  customerName: string
  isExpanded: boolean
  isCopied: boolean
  busyKey: string | null
  onToggleExpand: () => void
  onCopyTracking: () => void
  onFieldChange: <K extends 'status' | 'category' | 'priority'>(
    ticket: SupportTicketWithCustomer,
    field: K,
    value: SupportTicketWithCustomer[K],
  ) => void
}

function TicketRow({
  ticket,
  customerName,
  isExpanded,
  isCopied,
  busyKey,
  onToggleExpand,
  onCopyTracking,
  onFieldChange,
}: TicketRowProps) {
  const selectStyle: React.CSSProperties = {
    background: '#1a1f2e',
    color: '#d4d9e6',
    border: '1px solid #2d3748',
    borderRadius: 6,
    padding: '4px 6px',
    fontSize: 12,
    fontFamily: 'DM Sans, sans-serif',
    cursor: 'pointer',
    width: '100%',
  }

  return (
    <>
      <tr
        style={{ cursor: 'pointer' }}
        onClick={onToggleExpand}
      >
        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onCopyTracking() }}
            className="admin-tracking-pill"
            title="Click to copy"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 8px',
              borderRadius: 6,
              border: '1px solid #2d3748',
              background: isCopied ? '#22c55e20' : '#1a1f2e',
              color: isCopied ? '#22c55e' : '#e8a838',
              fontFamily: 'monospace',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {isCopied ? <Check size={11} /> : <Copy size={11} />}
            {ticket.tracking_number}
          </button>
        </td>
        <td style={{ fontWeight: 500 }}>{customerName}</td>
        <td onClick={(e) => e.stopPropagation()}>
          <select
            value={ticket.category}
            disabled={busyKey === `${ticket.id}:category`}
            onChange={(e) => onFieldChange(ticket, 'category', e.target.value as TicketCategory)}
            style={{
              ...selectStyle,
              borderColor: `${categoryColors[ticket.category]}60`,
              color: categoryColors[ticket.category],
            }}
          >
            {ALL_CATEGORIES.map((c) => (
              <option key={c} value={c}>{categoryLabels[c]}</option>
            ))}
          </select>
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <select
            value={ticket.priority}
            disabled={busyKey === `${ticket.id}:priority`}
            onChange={(e) => onFieldChange(ticket, 'priority', e.target.value as TicketPriority)}
            style={{
              ...selectStyle,
              borderColor: `${priorityColors[ticket.priority]}60`,
              color: priorityColors[ticket.priority],
            }}
          >
            {ALL_PRIORITIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </td>
        <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ticket.subject}
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <span
            className="admin-status-badge"
            style={{
              background: `${statusColors[ticket.status]}20`,
              color: statusColors[ticket.status],
              border: `1px solid ${statusColors[ticket.status]}40`,
            }}
          >
            {statusLabels[ticket.status]}
          </span>
        </td>
        <td style={{ fontSize: 12, color: 'var(--admin-muted)', whiteSpace: 'nowrap' }}>
          {new Date(ticket.created_at).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <select
            value={ticket.status}
            disabled={busyKey === `${ticket.id}:status`}
            onChange={(e) => onFieldChange(ticket, 'status', e.target.value as TicketStatus)}
            style={{
              ...selectStyle,
              borderColor: `${statusColors[ticket.status]}60`,
              color: statusColors[ticket.status],
              fontWeight: 600,
            }}
          >
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{statusLabels[s]}</option>
            ))}
          </select>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={8} style={{ background: '#0f1320', padding: 16 }}>
            <div style={{ display: 'grid', gap: 10, color: 'var(--admin-muted)', fontSize: 13 }}>
              <div>
                <strong style={{ color: '#d4d9e6' }}>Description</strong>
                <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', color: '#c4c9d6', lineHeight: 1.5 }}>
                  {ticket.description}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', fontSize: 12, paddingTop: 8, borderTop: '1px solid #2d3748' }}>
                <span>👤 <strong style={{ color: '#d4d9e6' }}>{customerName}</strong></span>
                {ticket.profiles?.[0]?.phone && (
                  <span>📞 {ticket.profiles[0].phone}</span>
                )}
                <span>🆔 <code style={{ color: '#e8a838' }}>{ticket.id}</code></span>
                {ticket.resolved_at && (
                  <span>✅ Resolved: {new Date(ticket.resolved_at).toLocaleString()}</span>
                )}
                {ticket.closed_at && (
                  <span>🔒 Closed: {new Date(ticket.closed_at).toLocaleString()}</span>
                )}
              </div>
              <div
                style={{
                  paddingTop: 8,
                  borderTop: '1px solid #2d3748',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong style={{ color: '#d4d9e6' }}>Conversation</strong>
                  <span style={{ fontSize: 11, color: 'var(--admin-muted)' }}>
                    Auto-refreshes every 30s
                  </span>
                </div>
                <TicketThread
                  ticketId={ticket.id}
                  role="admin"
                  onError={(message) => window.alert(message)}
                />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
