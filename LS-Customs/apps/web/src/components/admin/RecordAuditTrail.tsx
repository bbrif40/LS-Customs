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
      return <Eye size={13} style={{ color: '#60a5fa' }} />
    case 'status_change':
      return <Activity size={13} style={{ color: '#fbbf24' }} />
    case 'assign':
      return <UserCheck size={13} style={{ color: '#34d399' }} />
    case 'update':
      return <Edit3 size={13} style={{ color: '#a78bfa' }} />
    default:
      return <Activity size={13} style={{ color: '#9ca3af' }} />
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

  // Summary counts
  const viewCount = auditTrail.filter((a) => a.action_type === 'view').length
  const actionCount = auditTrail.filter((a) => a.action_type !== 'view').length
  const uniqueInspectors = Array.from(
    new Set(auditTrail.map((a) => a.admin_name || a.admin_email).filter(Boolean))
  )

  return (
    <div
      style={{
        marginTop: 18,
        borderRadius: 10,
        border: '1px solid #1f2f37',
        background: '#0d181e',
        overflow: 'hidden',
      }}
    >
      {/* Header bar / accordion toggle */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#e2e8f0',
          fontSize: 12,
          fontWeight: 600,
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldAlert size={15} style={{ color: '#e5b842' }} />
          <span>Audit & Access Trail</span>
          <span
            style={{
              fontSize: 10,
              padding: '2px 7px',
              borderRadius: 12,
              background: '#19303d',
              color: '#94a3b8',
              fontWeight: 500,
            }}
          >
            {auditTrail.length} {auditTrail.length === 1 ? 'event' : 'events'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8' }}>
          <span style={{ fontSize: 11 }}>
            {viewCount} views · {actionCount} actions
          </span>
          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {/* Accordion Content */}
      {isOpen && (
        <div
          style={{
            borderTop: '1px solid #1f2f37',
            padding: '12px 14px',
            maxHeight: 280,
            overflowY: 'auto',
          }}
        >
          {/* Quick Inspector Summary */}
          {uniqueInspectors.length > 0 && (
            <div
              style={{
                marginBottom: 10,
                fontSize: 11,
                color: '#94a3b8',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ color: '#64748b' }}>Admins involved:</span>
              {uniqueInspectors.map((name, i) => (
                <span
                  key={i}
                  style={{
                    background: '#162730',
                    color: '#e2e8f0',
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    border: '1px solid #233c4a',
                  }}
                >
                  {name}
                </span>
              ))}
            </div>
          )}

          {/* Timeline List */}
          {loading && auditTrail.length === 0 ? (
            <div style={{ padding: '12px 0', textAlign: 'center', color: '#64748b', fontSize: 11 }}>
              Loading audit logs...
            </div>
          ) : auditTrail.length === 0 ? (
            <div style={{ padding: '12px 0', textAlign: 'center', color: '#64748b', fontSize: 11 }}>
              No audit activities recorded yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {auditTrail.map((entry) => (
                <div
                  key={entry.id || `${entry.created_at}-${entry.action_type}`}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '8px 10px',
                    background: '#122028',
                    borderRadius: 6,
                    border: '1px solid #1c323f',
                  }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: '#1c2f3b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  >
                    {getActionIcon(entry.action_type)}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        color: '#f1f5f9',
                        fontSize: 11.5,
                        fontWeight: 500,
                        lineHeight: 1.35,
                      }}
                    >
                      {getActionDescription(entry)}
                    </div>
                    {entry.admin_email && entry.admin_email !== entry.admin_name && (
                      <div style={{ fontSize: 10, color: '#64748b' }}>{entry.admin_email}</div>
                    )}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      color: '#64748b',
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
