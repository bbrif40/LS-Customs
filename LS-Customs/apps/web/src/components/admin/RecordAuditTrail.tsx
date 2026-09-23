import { useState } from 'react'
import {
  Eye,
  Activity,
  UserCheck,
  Edit3,
  Clock,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
} from 'lucide-react'
import { useRecordAuditTrail } from '../../hooks/useRecordAuditTrail'
import type { AdminAuditEntry, AuditActionType } from '../../services/auditLogger'

interface RecordAuditTrailProps {
  recordType: string
  recordId: string
  recordTitle?: string
  autoLogView?: boolean
}

function formatRelativeTime(dateString?: string): string {
  if (!dateString) return 'Recently'
  const date = new Date(dateString)
  const now = new Date()
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffSec < 45) return 'Just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  if (diffSec < 172800) return 'Yesterday'
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getActionIcon(action: AuditActionType | string) {
  switch (action) {
    case 'view':
      return <Eye size={12} style={{ color: '#3b82f6' }} />
    case 'status_change':
      return <Activity size={12} style={{ color: '#f59e0b' }} />
    case 'assign':
      return <UserCheck size={12} style={{ color: '#10b981' }} />
    case 'update':
      return <Edit3 size={12} style={{ color: '#8b5cf6' }} />
    default:
      return <Activity size={12} style={{ color: '#9ca3af' }} />
  }
}

function getActionDescription(entry: AdminAuditEntry): string {
  const admin = entry.admin_name || entry.admin_email || 'An admin'
  const details = entry.details || {}

  switch (entry.action_type) {
    case 'view':
      return `${admin} inspected this record`
    case 'status_change': {
      const from = details.old_status ? String(details.old_status) : 'initial'
      const to = details.new_status ? String(details.new_status) : 'updated'
      return `${admin} updated status: ${from} → ${to}`
    }
    case 'assign':
      return `${admin} updated technician assignment`
    case 'update':
      return `${admin} modified record fields`
    case 'create':
      return `${admin} created this record`
    case 'delete':
      return `${admin} removed this record`
    default:
      return `${admin} performed ${entry.action_type}`
  }
}

export function RecordAuditTrail({
  recordType,
  recordId,
  recordTitle,
  autoLogView = true,
}: RecordAuditTrailProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { auditTrail, loading } = useRecordAuditTrail({
    recordType,
    recordId,
    recordTitle,
    autoLogView,
  })

  const viewCount = auditTrail.filter((a) => a.action_type === 'view').length
  const actionCount = auditTrail.filter((a) => a.action_type !== 'view').length
  const uniqueInspectors = Array.from(
    new Set(auditTrail.map((a) => a.admin_name || a.admin_email).filter(Boolean))
  )

  return (
    <div
      style={{
        marginTop: 14,
        borderRadius: 8,
        border: '1px solid var(--admin-border)',
        background: 'var(--admin-card)',
        overflow: 'hidden',
      }}
    >
      {/* Accordion Header */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '9px 14px',
          background: 'var(--admin-hover)',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--admin-ink)',
          fontSize: 12,
          fontWeight: 600,
          textAlign: 'left',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <ShieldAlert size={13} style={{ color: '#d4a017', flexShrink: 0 }} />
          <span style={{ color: 'var(--admin-ink)', fontSize: 12, fontWeight: 600 }}>
            Audit &amp; Access Trail
          </span>
          <span
            style={{
              fontSize: 10,
              padding: '1px 7px',
              borderRadius: 10,
              background: 'var(--admin-border)',
              color: 'var(--admin-muted)',
              fontWeight: 600,
            }}
          >
            {auditTrail.length} {auditTrail.length === 1 ? 'event' : 'events'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--admin-muted)', flexShrink: 0 }}>
          <span style={{ fontSize: 11 }}>
            {viewCount} views · {actionCount} actions
          </span>
          {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </div>
      </button>

      {/* Accordion Content */}
      {isOpen && (
        <div
          style={{
            borderTop: '1px solid var(--admin-border)',
            padding: '12px 14px',
            maxHeight: 260,
            overflowY: 'auto',
            background: '#fff',
          }}
        >
          {/* Admins involved */}
          {uniqueInspectors.length > 0 && (
            <div
              style={{
                marginBottom: 10,
                fontSize: 11,
                color: 'var(--admin-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
              }}
            >
              <span>Admins involved:</span>
              {uniqueInspectors.map((name, i) => (
                <span
                  key={i}
                  style={{
                    background: 'var(--admin-hover)',
                    color: 'var(--admin-ink)',
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    border: '1px solid var(--admin-border)',
                  }}
                >
                  {name}
                </span>
              ))}
            </div>
          )}

          {/* Timeline */}
          {loading && auditTrail.length === 0 ? (
            <div style={{ padding: '10px 0', textAlign: 'center', color: 'var(--admin-muted)', fontSize: 11 }}>
              Loading audit logs...
            </div>
          ) : auditTrail.length === 0 ? (
            <div style={{ padding: '10px 0', textAlign: 'center', color: 'var(--admin-muted)', fontSize: 11 }}>
              No audit activities recorded yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {auditTrail.map((entry) => (
                <div
                  key={entry.id || `${entry.created_at}-${entry.action_type}`}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '7px 10px',
                    background: 'var(--admin-hover)',
                    borderRadius: 6,
                    border: '1px solid var(--admin-border)',
                  }}
                >
                  {/* Icon circle */}
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: '#fff',
                      border: '1px solid var(--admin-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  >
                    {getActionIcon(entry.action_type)}
                  </div>

                  {/* Text */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        color: 'var(--admin-ink)',
                        fontSize: 12,
                        fontWeight: 500,
                        lineHeight: 1.4,
                      }}
                    >
                      {getActionDescription(entry)}
                    </div>
                    {entry.admin_email && entry.admin_email !== entry.admin_name && (
                      <div style={{ fontSize: 10.5, color: 'var(--admin-muted)', marginTop: 1 }}>
                        {entry.admin_email}
                      </div>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      color: 'var(--admin-muted)',
                      fontSize: 10.5,
                      flexShrink: 0,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Clock size={11} />
                    <span>{formatRelativeTime(entry.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
