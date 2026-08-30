/**
 * AdminRevenue — Revenue Reports page.
 * Shows revenue stats, SVG line chart, and transactions table.
 * Matches the "Admin - Revenue Reports" Figma screen.
 */
import { useState } from 'react'
import { Download, Calendar, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { revenueStats, revenueChartData, transactions } from '../../data/adminData'

type TxFilter = 'all' | 'rentals' | 'mechanics'

export function AdminRevenue() {
  const [txFilter, setTxFilter] = useState<TxFilter>('all')

  const txFilters: { id: TxFilter; label: string }[] = [
    { id: 'all', label: 'All Services' },
    { id: 'rentals', label: 'Rentals Only' },
    { id: 'mechanics', label: 'Mechanics Only' },
  ]

  const filteredTx = transactions.filter((tx) => {
    if (txFilter === 'rentals') return tx.serviceIcon === '🚗'
    if (txFilter === 'mechanics') return tx.serviceIcon === '🔧'
    return true
  })

  // ── Chart calculation ──────────────────────────────────────────
  const chartW = 700
  const chartH = 200
  const padX = 50
  const padY = 30
  const padTop = 10

  const maxVal = Math.max(...revenueChartData.rentals, ...revenueChartData.mechanics) * 1.15
  const stepX = (chartW - padX) / (revenueChartData.labels.length - 1)

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

  const rentalsPath = buildPath(revenueChartData.rentals)
  const mechanicsPath = buildPath(revenueChartData.mechanics)

  // Build area path for rentals (fill under line)
  const areaPath =
    rentalsPath +
    ` L ${toPoint(revenueChartData.rentals[revenueChartData.rentals.length - 1], revenueChartData.rentals.length - 1).x} ${chartH - padY}` +
    ` L ${padX} ${chartH - padY} Z`

  // Grid lines
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((frac) => ({
    y: padTop + (chartH - padY - padTop) * (1 - frac),
    label: Math.round(maxVal * frac).toString(),
  }))

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
          <button className="admin-date-range">
            <Calendar size={14} />
            Oct 2023 – Mar 2024
          </button>
          <button className="admin-export-btn">
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      {/* ── Stats ────────────────────────────────────────────── */}
      <div className="admin-stats-row three">
        {revenueStats.map((stat) => (
          <div className="admin-stat-card" key={stat.label}>
            <div className="admin-stat-header">
              <span className="admin-stat-label">{stat.label}</span>
              <div className={`admin-stat-icon ${stat.icon}`}>
                {stat.icon === 'revenue' && '₱'}
                {stat.icon === 'avg' && '📊'}
                {stat.icon === 'subs' && '🔧'}
              </div>
            </div>
            <div className="admin-stat-value">{stat.value}</div>
            {stat.trend && (
              <span className={`admin-stat-trend ${stat.trendUp ? 'up' : 'down'}`}>
                {stat.trendUp ? '↑' : '↓'} {stat.trend}
              </span>
            )}
          </div>
        ))}
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
            {revenueChartData.labels.map((label, i) => (
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
            <path d={areaPath} className="admin-chart-area-rentals" />

            {/* Lines */}
            <path d={rentalsPath} className="admin-chart-line-rentals" />
            <path d={mechanicsPath} className="admin-chart-line-mechanics" />

            {/* Dots */}
            {revenueChartData.rentals.map((val, i) => {
              const { x, y } = toPoint(val, i)
              return <circle key={`r-${i}`} cx={x} cy={y} r={4} className="admin-chart-dot rentals" />
            })}
            {revenueChartData.mechanics.map((val, i) => {
              const { x, y } = toPoint(val, i)
              return <circle key={`m-${i}`} cx={x} cy={y} r={4} className="admin-chart-dot mechanics" />
            })}
          </svg>
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
            {filteredTx.map((tx, i) => (
              <tr key={i}>
                <td style={{ color: 'var(--admin-muted)', fontSize: 12 }}>{tx.date}</td>
                <td style={{ fontWeight: 600 }}>{tx.customer}</td>
                <td>
                  <div className="admin-table-service">
                    <div className="admin-table-service-icon">{tx.serviceIcon}</div>
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
          <span>Showing 1 to 4 of 240 entries</span>
          <div className="admin-pagination-btns">
            <button className="admin-pagination-btn">
              <ChevronLeft size={14} />
            </button>
            <button className="admin-pagination-btn">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
