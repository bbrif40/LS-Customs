/**
 * UserLogbookModal — admin-only modal that shows one user's transaction
 * history, split into two side-by-side panels: Rentals and Mechanic Services.
 *
 * Each panel is its own paginated list (10 per page, newest first) with
 * "Load more" at the bottom. A status pill, total price, and key item info
 * (vehicle name / mechanic + address) are shown per row.
 */
import { useEffect } from 'react'
import { X, Loader2, Car, Wrench, Calendar, MapPin } from 'lucide-react'
import {
  useUserTransactions,
  type VehicleBookingLogEntry,
  type ServiceBookingLogEntry,
} from '../../hooks/useAdminData'
import type { Profile } from '@ls-customs/shared-types'

interface UserLogbookModalProps {
  user: Profile
  onClose: () => void
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  assigned: 'Assigned',
  en_route: 'En route',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const STATUS_CLASS: Record<string, string> = {
  pending: 'pending',
  confirmed: 'active',
  assigned: 'pending',
  en_route: 'pending',
  in_progress: 'pending',
  completed: 'active',
  cancelled: 'inactive',
}

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

const formatDateTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

const formatPrice = (n: number) => `₱${n.toLocaleString()}`

export function UserLogbookModal({ user, onClose }: UserLogbookModalProps) {
  const {
    rentals,
    services,
    rentalsTotal,
    servicesTotal,
    loading,
    error,
    loadMoreRentals,
    loadMoreServices,
    hasMoreRentals,
    hasMoreServices,
  } = useUserTransactions(user.id)

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div
        className="admin-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 960, width: '95vw' }}
      >
        <div className="admin-modal-header">
          <div>
            <h2>Transaction logbook</h2>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: 12,
                color: 'var(--admin-muted)',
                fontWeight: 500,
                textTransform: 'none',
                letterSpacing: 0,
              }}
            >
              {user.full_name || 'Unnamed user'} · {user.role} ·{' '}
              <span style={{ fontFamily: 'monospace' }}>{user.id.slice(0, 8)}…</span>
            </p>
          </div>
          <button className="admin-modal-close" onClick={onClose} aria-label="Close logbook">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              color: '#b91c1c',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              padding: '8px 14px',
              margin: '0 24px',
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div
          className="admin-modal-body"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 18,
            maxHeight: 'calc(100vh - 240px)',
          }}
        >
          {/* ── Rentals column ──────────────────────────── */}
          <LogbookColumn
            title="Rentals"
            icon={<Car size={14} />}
            count={rentalsTotal}
            loading={loading && rentals.length === 0}
            emptyMessage="No vehicle rentals on record."
          >
            {rentals.map((entry) => (
              <RentalRow key={entry.id} entry={entry} />
            ))}
            {hasMoreRentals && (
              <button
                onClick={() => void loadMoreRentals()}
                disabled={loading}
                className="admin-modal-btn secondary"
                style={{ width: '100%', marginTop: 6 }}
              >
                {loading ? <Loader2 size={14} className="spin" /> : 'Load more'}
              </button>
            )}
          </LogbookColumn>

          {/* ── Services column ─────────────────────────── */}
          <LogbookColumn
            title="Mechanic services"
            icon={<Wrench size={14} />}
            count={servicesTotal}
            loading={loading && services.length === 0}
            emptyMessage="No mechanic service bookings on record."
          >
            {services.map((entry) => (
              <ServiceRow key={entry.id} entry={entry} />
            ))}
            {hasMoreServices && (
              <button
                onClick={() => void loadMoreServices()}
                disabled={loading}
                className="admin-modal-btn secondary"
                style={{ width: '100%', marginTop: 6 }}
              >
                {loading ? <Loader2 size={14} className="spin" /> : 'Load more'}
              </button>
            )}
          </LogbookColumn>
        </div>

        <div className="admin-modal-footer">
          <button type="button" className="admin-modal-btn secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Subcomponents ─────────────────────────────────────────────────

function LogbookColumn({
  title,
  icon,
  count,
  loading,
  emptyMessage,
  children,
}: {
  title: string
  icon: React.ReactNode
  count: number
  loading: boolean
  emptyMessage: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: 'var(--admin-bg)',
        borderRadius: 8,
        border: '1px solid var(--admin-border)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid var(--admin-border)',
          background: 'var(--admin-card)',
          borderRadius: '8px 8px 0 0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: 'var(--admin-ink)' }}>
          {icon}
          {title}
        </div>
        <span
          style={{
            fontSize: 11,
            color: 'var(--admin-muted)',
            fontWeight: 600,
            background: 'var(--admin-bg)',
            padding: '2px 8px',
            borderRadius: 10,
          }}
        >
          {count} {count === 1 ? 'total' : 'total'}
        </span>
      </div>

      <div
        style={{
          padding: 12,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          minHeight: 0,
          flex: 1,
        }}
      >
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24, color: 'var(--admin-muted)' }}>
            <Loader2 size={18} className="spin" />
          </div>
        ) : count === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '24px 8px',
              color: 'var(--admin-muted)',
              fontSize: 12,
              fontStyle: 'italic',
            }}
          >
            {emptyMessage}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`admin-status-badge ${STATUS_CLASS[status] ?? 'pending'}`}
      style={{ fontSize: 10, padding: '2px 8px' }}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

function RowCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--admin-card)',
        border: '1px solid var(--admin-border)',
        borderRadius: 8,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {children}
    </div>
  )
}

function RowMeta({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--admin-muted)' }}>
      {icon}
      <span>{children}</span>
    </div>
  )
}

function RentalRow({ entry }: { entry: VehicleBookingLogEntry }) {
  return (
    <RowCard>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--admin-ink)' }}>
            {entry.vehicle_name ?? 'Vehicle'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--admin-muted)', textTransform: 'capitalize' }}>
            {entry.vehicle_category?.replace('_', ' ') ?? '—'}
          </div>
        </div>
        <StatusPill status={entry.status} />
      </div>

      <RowMeta icon={<Calendar size={11} />}>
        {formatDate(entry.start_date)} → {formatDate(entry.end_date)}
      </RowMeta>

      {entry.pickup_location && (
        <RowMeta icon={<MapPin size={11} />}>
          {entry.pickup_location}
        </RowMeta>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid var(--admin-border)',
          paddingTop: 6,
          marginTop: 2,
        }}
      >
        <span style={{ fontSize: 10, color: 'var(--admin-muted)' }}>
          Booked {formatDateTime(entry.created_at)}
        </span>
        <span style={{ fontWeight: 700, color: 'var(--admin-ink)', fontSize: 13 }}>
          {formatPrice(entry.total_price)}
        </span>
      </div>
    </RowCard>
  )
}

function ServiceRow({ entry }: { entry: ServiceBookingLogEntry }) {
  return (
    <RowCard>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--admin-ink)' }}>
            {entry.mechanic_name ? `Mechanic: ${entry.mechanic_name}` : 'Awaiting assignment'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--admin-muted)' }}>Service booking</div>
        </div>
        <StatusPill status={entry.status} />
      </div>

      <RowMeta icon={<Calendar size={11} />}>Scheduled {formatDateTime(entry.scheduled_at)}</RowMeta>

      {entry.address_line1 && (
        <RowMeta icon={<MapPin size={11} />}>
          {entry.address_line1}
          {entry.address_city ? `, ${entry.address_city}` : ''}
        </RowMeta>
      )}

      {entry.notes && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--admin-muted)',
            fontStyle: 'italic',
            borderLeft: '2px solid var(--admin-border)',
            paddingLeft: 8,
          }}
        >
          “{entry.notes}”
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid var(--admin-border)',
          paddingTop: 6,
          marginTop: 2,
        }}
      >
        <span style={{ fontSize: 10, color: 'var(--admin-muted)' }}>
          Booked {formatDateTime(entry.created_at)}
        </span>
        <span style={{ fontWeight: 700, color: 'var(--admin-ink)', fontSize: 13 }}>
          {formatPrice(entry.total_price)}
        </span>
      </div>
    </RowCard>
  )
}
