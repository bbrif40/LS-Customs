/**
 * AdminTransactions — Transactions tab for the admin panel.
 *
 * Shows actual collections alongside completed cash booking recognitions.
 * Recognition rows are reporting entries; only provider-backed payments can
 * request a refund.
 *
 * Status pills use the same palette as the booking overview so the two
 * tabs feel like one surface.
 */
import { useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, RotateCcw } from 'lucide-react'
import { IonIcon } from '@ionic/react'
import { carOutline, constructOutline } from 'ionicons/icons'
import { useAdminPayments, type AdminTransactionCompletionTarget } from '../../hooks/useAdminPayments'
import { BookingReference } from './BookingReference'

const statusColors: Record<string, string> = {
  pending: '#f59e0b',
  succeeded: '#22c55e',
  failed: '#ef4444',
  refunded: '#3b82f6',
  recognized: '#316749',
}

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  succeeded: 'Succeeded',
  failed: 'Failed',
  refunded: 'Refunded',
  recognized: 'Completed',
}

const PAGE_SIZE = 10

export function AdminTransactions() {
  const { payments, loading, error, warning, updatePaymentStatus, completeTransaction, refetch } = useAdminPayments()
  const [page, setPage] = useState(1)
  const [completing, setCompleting] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

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
        <p style={{ fontSize: 13, marginTop: 8 }}>Completed cash bookings and collections appear here.</p>
      </div>
    )
  }

  const handleRefund = async (paymentId: string) => {
    const confirmed = window.confirm(
      'Request a refund for this payment? It stays pending until the provider confirms settlement.',
    )
    if (!confirmed) return
    await updatePaymentStatus(paymentId, 'refunded')
  }

  const handleComplete = async (key: string, target: AdminTransactionCompletionTarget) => {
    const reason = window.prompt('Reason for recording this cash settlement (at least 3 characters):')
    if (reason === null) return
    if (reason.trim().length < 3) {
      setActionMessage('Enter a reason with at least 3 characters.')
      return
    }
    setCompleting(key)
    setActionMessage(null)
    try {
      await completeTransaction(target, reason.trim())
      setActionMessage('Admin cash settlement recorded as completed.')
    } catch (completionError) {
      setActionMessage(completionError instanceof Error ? completionError.message : 'Could not record the cash settlement.')
    } finally {
      setCompleting(null)
    }
  }

  return (
    <div className="admin-transactions">
      {(warning || actionMessage) && <p role="status">{actionMessage ?? warning}</p>}
      {/* ── Toolbar ── */}
      <div className="admin-filter-row" style={{ marginBottom: 16 }}>
        <button
          className="admin-filter-btn"
          onClick={() => void refetch()}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
        <a href="/admin?view=revenue" className="admin-filter-btn">View revenue report</a>
        <div style={{ flex: 1 }} />
        <span style={{ color: 'var(--admin-muted)', fontSize: 13, alignSelf: 'center' }}>
          {payments.length} record{payments.length === 1 ? '' : 's'}
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
              <th>Record</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((payment) => {
              const statusColor = statusColors[payment.status] ?? '#9ca3af'
              const isRefunded = payment.status === 'refunded'
              const canRefund = payment.record_kind === 'collection'
                && payment.is_payment
                && payment.account_quote_id === null
                && payment.status === 'succeeded'
                && Boolean(payment.provider_reference)
                && payment.provider !== 'cash'
                && payment.provider !== 'online_payment'
                && payment.provider !== 'cash_ledger'
                && payment.provider !== 'admin_cash_settlement'
              const completeTarget: AdminTransactionCompletionTarget | null = payment.account_quote_id && payment.status === 'pending'
                ? { kind: 'account_quote', paymentId: payment.id }
                : payment.record_kind === 'recognition' && payment.record_source === 'cash_completion' && payment.can_complete_balance
                  ? { kind: 'service_base', bookingId: payment.booking_id }
                  : null
              const recordLabel = payment.record_source === 'admin_settlement_cash'
                ? 'Admin settlement · Cash'
                : payment.account_quote_id
                  ? `Account balance quote${payment.account_quote_charge_count ? ` · ${payment.account_quote_charge_count} charge${payment.account_quote_charge_count === 1 ? '' : 's'}` : ''}`
                : payment.record_kind === 'recognition'
                ? 'Cash booking revenue'
                : payment.record_source === 'cash_collection'
                  ? 'Cash collection'
                  : payment.record_source?.startsWith('account_charge_')
                    ? 'Account charge collection'
                  : payment.provider === 'online_payment'
                    ? 'Online payment'
                    : payment.provider ?? 'Payment'

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
                      {payment.account_quote_id ? 'Account balance' : payment.booking_type === 'vehicle' ? 'Rental' : 'Service'}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {payment.account_quote_id && payment.account_quote_bookings?.length ? (
                      payment.account_quote_bookings.length === 1
                        ? <BookingReference id={payment.account_quote_bookings[0].booking_id} />
                        : <details>
                            <summary style={{ cursor: 'pointer' }}>{payment.account_quote_bookings.length} bookings</summary>
                            <div style={{ display: 'grid', gap: 5, marginTop: 6 }}>
                              {payment.account_quote_bookings.map((booking) => (
                                <BookingReference key={`${booking.booking_type}:${booking.booking_id}`} id={booking.booking_id} />
                              ))}
                            </div>
                          </details>
                    ) : <BookingReference id={payment.booking_id} />}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: '#e8a838' }}>
                    {payment.amount.toFixed(2)} {payment.currency}
                  </td>
                  <td style={{ fontSize: 13, fontWeight: 500, textTransform: 'capitalize' }}>
                    {recordLabel}
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
                      {canRefund && <button
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
                          title={isRefunded ? 'Payment is already marked Refunded' : 'Request a provider refund'}
                      >
                        <RotateCcw size={12} /> {isRefunded ? 'Refunded' : 'Refund'}
                      </button>}
                      {completeTarget && <button
                        className="admin-vehicle-btn secondary"
                        onClick={() => void handleComplete(payment.id, completeTarget)}
                        disabled={completing === payment.id}
                        style={{
                          padding: '4px 10px',
                          fontSize: 11,
                          borderColor: '#22c55e',
                          color: '#22c55e',
                          opacity: completing === payment.id ? 0.65 : 1,
                          cursor: completing === payment.id ? 'wait' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontWeight: 600,
                          borderRadius: 6,
                        }}
                        title="Record this covered balance as collected in cash"
                      >
                        {completing === payment.id ? 'Saving…' : 'Complete'}
                      </button>}
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
