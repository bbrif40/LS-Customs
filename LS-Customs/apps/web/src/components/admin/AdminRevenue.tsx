/**
 * AdminRevenue — Revenue Reports page.
 * Shows revenue stats, SVG line chart, and transactions table.
 * Matches the "Admin - Revenue Reports" Figma screen.
 */
import { useState } from 'react'
import { Download, Calendar, ChevronLeft, ChevronRight, AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { IonIcon } from '@ionic/react'
import { carOutline, constructOutline, barChartOutline } from 'ionicons/icons'
import { useAdminRevenueData } from '../../hooks/useAdminRevenueData'

type TxFilter = 'all' | 'rentals' | 'mechanics'

export function AdminRevenue() {
  const [txFilter, setTxFilter] = useState<TxFilter>('all')
  const [dateRangeDays, setDateRangeDays] = useState(30)

  const {
    stats,
    chartData,
    transactions,
    totalTransactions,
    loading,
    error,
    refetch,
  } = useAdminRevenueData(dateRangeDays)

  const txFilters: { id: TxFilter; label: string }[] = [
    { id: 'all', label: 'All Services' },
    { id: 'rentals', label: 'Rentals Only' },
    { id: 'mechanics', label: 'Mechanics Only' },
  ]

  const isRentalTx = (tx: (typeof transactions)[0]) =>
    tx.serviceIcon === 'vehicle' || tx.serviceIcon === '🚗' || tx.serviceType.toLowerCase().includes('rental')

  const filteredTx = transactions.filter((tx) => {
    if (txFilter === 'rentals') return isRentalTx(tx)
    if (txFilter === 'mechanics') return !isRentalTx(tx)
    return true
  })

  // ── Chart calculation ──────────────────────────────────────────
  const chartW = 700
  const chartH = 200
  const padX = 50
  const padY = 30
  const padTop = 10

  const allValues = [...(chartData.rentals.length ? chartData.rentals : [0]), ...(chartData.mechanics.length ? chartData.mechanics : [0])]
  const maxVal = allValues.length > 0
    ? Math.max(...allValues) * 1.15
    : 1
  const labelCount = chartData.labels.length || 1
  const stepX = (chartW - padX) / (labelCount - 1)

  const toPoint = (val: number, idx: number) => ({
    x: padX + idx * stepX,
    y: padTop + (chartH - padY - padTop) * (1 - val / maxVal),
  })

  const buildPath = (data: number[]) =>
    data
      .map((v, i) => {
        const { x, y } = toPoint(v, i)
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
      })
      .join(' ')

  const rentalsPath = buildPath(chartData.rentals)
  const mechanicsPath = buildPath(chartData.mechanics)

  // Build area path for rentals (fill under line)
  const lastIdx = chartData.rentals.length - 1
  const areaPath = chartData.rentals.length > 0
    ? rentalsPath +
      ` L ${toPoint(chartData.rentals[lastIdx], lastIdx).x} ${chartH - padY}` +
      ` L ${padX} ${chartH - padY} Z`
    : ''

  // Grid lines
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((frac) => ({
    y: padTop + (chartH - padY - padTop) * (1 - frac),
    label: Math.round(maxVal * frac).toString(),
  }))

  // Pagination for transactions table
  const PAGE_SIZE = 20
  const [page, setPage] = useState(1)
  const totalPages = Math.ceil(filteredTx.length / PAGE_SIZE)
  const startIndex = (page - 1) * PAGE_SIZE + 1
  const endIndex = Math.min(page * PAGE_SIZE, filteredTx.length)
  const paginated = filteredTx.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // CSV Export
  const handleExportCSV = () => {
    const header = ['Date', 'Customer', 'Service Type', 'Amount', 'Status', 'Provider']
    const rows = filteredTx.map((tx) => [
      `"${tx.date}"`,
      `"${tx.customer}"`,
      `"${tx.serviceType}"`,
      `"${tx.amount}"`,
      `"${tx.status}"`,
      `"${tx.provider ?? ''}"`,
    ])
    const csv = [header, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `revenue-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Date range label
  const dateRangeLabel = dateRangeDays === 30
    ? 'Last 30 days'
    : dateRangeDays === 7
      ? 'Last 7 days'
      : `Last ${dateRangeDays} days`

  return (
    <div className="admin-main">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="admin-revenue-header">
        <div>
          <span className="admin-revenue-header-sub">LS Customs</span>
          <h1>Revenue Reports</h1>
          <p>Comprehensive financial analytics for rentals and services.</p>
        </div>
        <div className="admin-revenue-actions">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: 'var(--admin-muted)' }}>Range:</label>
            <select
              value={dateRangeDays}
              onChange={(e) => setDateRangeDays(Number(e.target.value))}
              className="admin-date-range"
              style={{ background: 'var(--admin-card-bg, #1a1f2e)', border: '1px solid var(--admin-border, #2d3748)', borderRadius: 6, padding: '6px 12px', color: 'var(--admin-text, #d4d9e6)', fontSize: 13, cursor: 'pointer' }}
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last year</option>
            </select>
          </div>
          <button className="admin-date-range">
            <Calendar size={14} />
            {dateRangeLabel}
          </button>
          <button
            className="admin-export-btn"
            onClick={handleExportCSV}
            disabled={filteredTx.length === 0}
            style={{ opacity: filteredTx.length === 0 ? 0.5 : 1, cursor: filteredTx.length === 0 ? 'not-allowed' : 'pointer' }}
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      {/* ── Stats ────────────────────────────────────────────── */}
      <div className="admin-stats-row three">
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--admin-muted)' }}>
            <Loader2 size={24} className="spin" style={{ margin: '0 auto 8px' }} />
            Loading revenue data…
          </div>
        ) : error ? (
          <div style={{ color: '#ef4444', padding: 16, background: 'rgba(239, 68, 68, 0.1)', borderRadius: 8 }}>
            {error}
          </div>
        ) : (
          stats.map((stat) => (
            <div className="admin-stat-card" key={stat.label}>
              <div className="admin-stat-header">
                <span className="admin-stat-label">{stat.label}</span>
                <div className={`admin-stat-icon ${stat.icon}`}>
                  {stat.icon === 'revenue' && <span style={{ fontWeight: 700 }}>₱</span>}
                  {stat.icon === 'avg' && <IonIcon icon={barChartOutline} style={{ fontSize: 20 }} />}
                  {stat.icon === 'subs' && <IonIcon icon={constructOutline} style={{ fontSize: 20 }} />}
                </div>
              </div>
              <div className="admin-stat-value">{stat.value}</div>
              {stat.trend && (
                <span className={`admin-stat-trend ${stat.trendUp ? 'up' : 'down'}`}>
                  {stat.trendUp ? '↑' : '↓'} {stat.trend}
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {/* ── Revenue Trends Chart ─────────────────────────────── */}
      <div className="admin-chart-card">
        <div className="admin-section-header">
          <h3 className="admin-section-title">Revenue Trends</h3>
          <div className="admin-chart-legend">
            <div className="admin-chart-legend-item">
              <div className="admin-chart-legend-line rentals" />
              Rentals
            </div>
            <div className="admin-chart-legend-item">
              <div className="admin-chart-legend-line mechanics" />
              Mechanics Services
            </div>
          </div>
        </div>
        <div className="admin-chart-container">
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--admin-muted)', height: chartH }}>
              Loading chart data…
            </div>
          ) : chartData.labels.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--admin-muted)', height: chartH }}>
              No revenue data for this period.
            </div>
          ) : (
            <svg className="admin-chart-svg" viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="none">
              <defs>
                <linearGradient id="rentalsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(232,168,56,0.2)" />
                  <stop offset="100%" stopColor="rgba(232,168,56,0)" />
                </linearGradient>
              </defs>

              {/* Grid lines */}
              {gridLines.map((line, i) => (
                <g key={i}>
                  <line
                    x1={padX}
                    y1={line.y}
                    x2={chartW}
                    y2={line.y}
                    className="admin-chart-grid-line"
                  />
                  <text
                    x={padX - 8}
                    y={line.y + 4}
                    textAnchor="end"
                    className="admin-chart-label"
                  >
                    {line.label}
                  </text>
                </g>
              ))}

              {/* X-axis labels */}
              {chartData.labels.map((label, i) => (
                <text
                  key={label}
                  x={padX + i * stepX}
                  y={chartH - 5}
                  textAnchor="middle"
                  className="admin-chart-label"
                >
                  {label}
                </text>
              ))}

              {/* Area fill for rentals */}
              {areaPath && <path d={areaPath} className="admin-chart-area-rentals" />}

              {/* Lines */}
              {rentalsPath && <path d={rentalsPath} className="admin-chart-line-rentals" />}
              {mechanicsPath && <path d={mechanicsPath} className="admin-chart-line-mechanics" />}

              {/* Dots */}
              {chartData.rentals.map((val, i) => {
                const { x, y } = toPoint(val, i)
                return <circle key={`r-${i}`} cx={x} cy={y} r={4} className="admin-chart-dot rentals" />
              })}
              {chartData.mechanics.map((val, i) => {
                const { x, y } = toPoint(val, i)
                return <circle key={`m-${i}`} cx={x} cy={y} r={4} className="admin-chart-dot mechanics" />
              })}
            </svg>
          )}
        </div>
      </div>

      {/* ── Dispatch Emergency ────────────────────────────────── */}
      <button className="admin-dispatch-btn">
        <AlertTriangle size={16} />
        Dispatch Emergency
      </button>

      {/* ── Recent Transactions ───────────────────────────────── */}
      <div className="admin-transactions-card">
        <div className="admin-transactions-header">
          <h3>Recent Transactions</h3>
          <div className="admin-transactions-filters">
            {txFilters.map((f) => (
              <button
                key={f.id}
                className={`admin-transactions-filter ${txFilter === f.id ? 'active' : ''}`}
                onClick={() => setTxFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--admin-muted)' }}>
            <Loader2 size={20} className="spin" style={{ margin: '0 auto 8px' }} />
            Loading transactions…
          </div>
        ) : (
          <>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Service Type</th>
                  <th style={{ textAlign: 'right' }}>Amount (₱)</th>
                  <th style={{ textAlign: 'right' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((tx, i) => (
                  <tr key={`${tx.paymentId}-${i}`}>
                    <td style={{ color: 'var(--admin-muted)', fontSize: 12 }}>{tx.date}</td>
                    <td style={{ fontWeight: 600 }}>{tx.customer}</td>
                    <td>
                      <div className="admin-table-service">
                        <div className="admin-table-service-icon">
                          <IonIcon
                            icon={isRentalTx(tx) ? carOutline : constructOutline}
                            style={{ fontSize: 18 }}
                          />
                        </div>
                        <span>{tx.serviceType}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{tx.amount}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className={`admin-status-badge ${tx.status}`}>
                        {tx.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="admin-transactions-pagination">
              <span>Showing {filteredTx.length === 0 ? 0 : startIndex} to {endIndex} of {filteredTx.length} entries</span>
              <div className="admin-pagination-btns">
                <button
                  className="admin-pagination-btn"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || filteredTx.length === 0}
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  className="admin-pagination-btn"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || filteredTx.length === 0}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
        {filteredTx.length === 0 && !loading && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--admin-muted)', fontSize: 13 }}>
            No transactions found for this period.
          </div>
        )}
      </div>

      {/* ── Refresh bar ────────────────────────────────────────── */}
      <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          className="admin-add-btn"
          onClick={() => { void refetch() }}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={14} /> Refresh data
        </button>
        {error && (
          <span style={{ color: '#ef4444', fontSize: 13 }}>{error}</span>
        )}
      </div>
    </div>
  )
}
