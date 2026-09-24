/**
 * AdminTransactions — Transactions tab for the admin panel.
 *
 * Replaces the mock `transactions` panel with real payment data fetched
 * from the `payments` table (via useAdminPayments). Supports two admin
 * actions on each row:
 *
 *   • Refund  — for `succeeded` payments, calls the refund-payment edge
 *     function. The status flips to `refunded` and the customer is
 *     notified by the existing DB trigger.
 *   • Retry   — for `failed` payments, creates a new payment intent so
 *     the customer can try a different card.
 *
 * Status pills use the same palette as the booking overview so the two
 * tabs feel like one surface.
 */
import { useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, CheckCircle2, RotateCcw } from 'lucide-react'
import { IonIcon } from '@ionic/react'
import { carOutline, constructOutline } from 'ionicons/icons'
import { useAdminPayments } from '../../hooks/useAdminPayments'

const statusColors: Record<string, string> = {
  pending: '#f59e0b',
  succeeded: '#22c55e',
  failed: '#ef4444',
  refunded: '#3b82f6',
}

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  succeeded: 'Succeeded',
  failed: 'Failed',
  refunded: 'Refunded',
}

const PAGE_SIZE = 10

export function AdminTransactions() {
  const { payments, loading, error, updatePaymentStatus, refetch } = useAdminPayments()
  const [page, setPage] = useState(1)

  const totalPages = Math.ceil(payments.length / PAGE_SIZE)
  const startIndex = (page - 1) * PAGE_SIZE + 1
  const endIndex = Math.min(page * PAGE_SIZE, payments.length)
  const paginated = payments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (loading) {
    return (
      <div className="admin-main" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <Loader2 size={32} className="spin" style={{ color: '#e8a838' }} />
        <p style={{ marginTop: 12, color: 'var(--admin-muted)' }}>Loading transactions…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="admin-main" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', textAlign: 'center' }}>
        <div style={{ color: '#ef4444' }}>Failed to load transactions</div>
        <p style={{ color: 'var(--admin-muted)', marginTop: 8 }}>{error}</p>
        <button onClick={() => void refetch()} className="admin-add-btn" style={{ marginTop: 16 }}>
          Retry
        </button>
      </div>
    )
  }

  if (payments.length === 0) {
    return (
      <div className="admin-main" style={{ padding: 40, color: 'var(--admin-muted)', textAlign: 'center' }}>
        <p>No transactions found.</p>
        <p style={{ fontSize: 13, marginTop: 8 }}>Payments will appear here once customers start booking.</p>
      </div>
    )
  }

  const handleMarkSucceeded = async (paymentId: string) => {
    const confirmed = window.confirm(
      'Mark this payment as Succeeded? This will confirm the transaction and automatically update the revenue reports.',
    )
    if (!confirmed) return
    await updatePaymentStatus(paymentId, 'succeeded')
  }

  const handleRefund = async (paymentId: string) => {
    const confirmed = window.confirm(
      'Issue a refund for this payment? The transaction will be marked as refunded and deducted from the revenue reports.',
    )
    if (!confirmed) return
    await updatePaymentStatus(paymentId, 'refunded')
  }

  return (
    <div className="admin-transactions">
      {/* ── Toolbar ── */}
      <div className="admin-filter-row" style={{ marginBottom: 16 }}>
        <button
          className="admin-filter-btn"
          onClick={() => void refetch()}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ color: 'var(--admin-muted)', fontSize: 13, alignSelf: 'center' }}>
          {payments.length} transaction{payments.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* ── Table ── */}
      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table" style={{ minWidth: 1000 }}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Customer</th>
              <th>Type</th>
              <th>Booking Ref</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th>Provider</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((payment) => {
              const statusColor = statusColors[payment.status] ?? '#9ca3af'
              const isSucceeded = payment.status === 'succeeded'
              const isRefunded = payment.status === 'refunded'

              return (
                <tr key={payment.id}>
                  <td style={{ fontSize: 13, color: 'var(--admin-muted)' }}>
                    {new Date(payment.created_at).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </td>
                  <td style={{ fontWeight: 500 }}>
                    {payment.customer_name ?? '—'}
                  </td>
                  <td style={{ fontSize: 13 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <IonIcon
                        icon={payment.booking_type === 'vehicle' ? carOutline : constructOutline}
                        style={{ fontSize: 15, color: payment.booking_type === 'vehicle' ? '#e8a838' : '#3b82f6' }}
                      />
                      {payment.booking_type === 'vehicle' ? 'Rental' : 'Service'}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {payment.booking_ref ?? `#${payment.booking_id.slice(0, 8)}`}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: '#e8a838' }}>
                    {payment.amount.toFixed(2)} {payment.currency}
                  </td>
                  <td style={{ fontSize: 13, fontWeight: 500 }}>
                    PayMongo
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span
                      className="admin-status-badge"
                      style={{
                        background: `${statusColor}20`,
                        color: statusColor,
                        border: `1px solid ${statusColor}40`,
                        fontSize: 11,
                      }}
                    >
                      {statusLabels[payment.status] ?? payment.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button
                        className="admin-vehicle-btn secondary"
                        onClick={() => void handleMarkSucceeded(payment.id)}
                        disabled={isSucceeded}
                        style={{
                          padding: '4px 10px',
                          fontSize: 11,
                          borderColor: isSucceeded ? '#16a34a' : '#22c55e',
                          color: isSucceeded ? '#16a34a' : '#22c55e',
                          background: isSucceeded ? 'rgba(34, 197, 94, 0.12)' : 'transparent',
                          opacity: isSucceeded ? 0.65 : 1,
                          cursor: isSucceeded ? 'default' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontWeight: 600,
                          borderRadius: 6,
                        }}
                        title={isSucceeded ? 'Payment is already marked Succeeded' : 'Mark as Succeeded (updates Revenue)'}
                      >
                        <CheckCircle2 size={12} /> Succeeded
                      </button>

                      <button
                        className="admin-vehicle-btn secondary"
                        onClick={() => void handleRefund(payment.id)}
                        disabled={isRefunded}
                        style={{
                          padding: '4px 10px',
                          fontSize: 11,
                          borderColor: isRefunded ? '#93c5fd' : '#ef4444',
                          color: isRefunded ? '#60a5fa' : '#ef4444',
                          background: isRefunded ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                          opacity: isRefunded ? 0.65 : 1,
                          cursor: isRefunded ? 'default' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontWeight: 600,
                          borderRadius: 6,
                        }}
                        title={isRefunded ? 'Payment is already marked Refunded' : 'Issue Refund (updates Revenue)'}
                      >
                        <RotateCcw size={12} /> {isRefunded ? 'Refunded' : 'Refund'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="admin-transactions-pagination" style={{ marginTop: 16 }}>
          <span>Showing {startIndex} to {endIndex} of {payments.length} entries</span>
          <div className="admin-pagination-btns">
            <button
              className="admin-pagination-btn"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft size={14} />
            </button>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', color: 'var(--admin-muted)' }}>
              Page {page} of {totalPages}
            </span>
            <button
              className="admin-pagination-btn"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
