/**
 * AdminTechnicians — Technician Scheduling page.
 * Shows a timeline grid with schedule blocks, fleet status, and unassigned jobs.
 * Matches the "Admin - Technician Scheduling" Figma screen.
 */
import { useState } from 'react'
import { Filter, Plus, MapPin, Clock, Loader2, RefreshCw } from 'lucide-react'
import { useTechnicianSchedule } from '../../hooks/useTechnicianSchedule'

const hours = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']

export function AdminTechnicians() {
  const [scheduleView, setScheduleView] = useState<'today' | 'week'>('today')
  const {
    scheduleBlocks,
    scheduleTechnicians,
    unassignedJobs,
    fleetStatus,
    loading,
    error,
    refetch,
  } = useTechnicianSchedule()

  return (
    <div className="admin-main">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="admin-topbar">
        <div className="admin-topbar-left">
          <h1>Technician Scheduling</h1>
          <p>Manage technician assignments and shift schedules.</p>
        </div>
        <div className="admin-topbar-right">
          <div className="admin-search-bar">
            <span className="admin-search-icon">🔍</span>
            <input type="text" placeholder="Search technician or job..." />
          </div>
          <button
            className="admin-add-btn"
            onClick={() => void refetch()}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          marginBottom: 16, padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid #ef444440', borderRadius: 8, color: '#ef4444', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* ── Schedule Controls ────────────────────────────────── */}
      <div className="admin-section-header" style={{ marginBottom: 8 }}>
        <h3 className="admin-section-title">Schedule</h3>
      </div>
      <div className="admin-schedule-controls">
        <div className="admin-schedule-toggle">
          <button
            className={scheduleView === 'today' ? 'active' : ''}
            onClick={() => setScheduleView('today')}
          >
            Today
          </button>
          <button
            className={scheduleView === 'week' ? 'active' : ''}
            onClick={() => setScheduleView('week')}
          >
            Week
          </button>
        </div>
        <button className="admin-schedule-filter-btn">
          <Filter size={14} /> Filters
        </button>
        <button className="admin-schedule-add-btn">
          <Plus size={14} /> Add Shift
        </button>
      </div>

      {/* ── Main Layout ──────────────────────────────────────── */}
      <div className="admin-schedule-layout">
        {/* Timeline Grid */}
        <div className="admin-timeline-card">
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--admin-muted)' }}>
              <Loader2 size={24} className="spin" style={{ margin: '0 auto 8px' }} />
              Loading schedule…
            </div>
          ) : (
            <div className="admin-timeline">
              {/* Sidebar (Tech names) */}
              <div className="admin-timeline-sidebar">
                <div className="admin-timeline-header-cell">Technician</div>
                {scheduleTechnicians.length === 0 ? (
                  <div style={{ padding: 16, fontSize: 12, color: 'var(--admin-muted)' }}>
                    No technicians with active jobs today.
                  </div>
                ) : (
                  scheduleTechnicians.map((tech) => (
                    <div
                      className="admin-timeline-tech"
                      key={tech.name}
                    >
                      <div
                        className="admin-timeline-tech-avatar"
                        style={{
                          background: `${tech.color}20`,
                          color: tech.color,
                          borderColor: `${tech.color}40`,
                        }}
                      >
                        {tech.initials}
                      </div>
                      <span className="admin-timeline-tech-name">{tech.name}</span>
                    </div>
                  ))
                )}
              </div>

              {/* Hours Grid */}
              <div className="admin-timeline-body">
                <div className="admin-timeline-hours">
                  {hours.map((h) => (
                    <div className="admin-timeline-hour" key={h}>{h}</div>
                  ))}
                </div>
                {scheduleTechnicians.length === 0 ? (
                  <div style={{
                    gridColumn: '1 / -1',
                    padding: 24,
                    textAlign: 'center',
                    color: 'var(--admin-muted)',
                    fontSize: 13,
                  }}>
                    No active schedule blocks to display.
                  </div>
                ) : (
                  scheduleTechnicians.map((tech) => {
                    const blocks = scheduleBlocks.filter((b) => b.techName === tech.name)
                    return (
                      <div className="admin-timeline-row" key={tech.name}>
                        {hours.map((_, i) => (
                          <div className="admin-timeline-cell" key={i} />
                        ))}
                        {blocks.map((block) => {
                          const left = (block.startHour - 8) * 80
                          const width = Math.max(40, (block.endHour - block.startHour) * 80)
                          return (
                            <div
                              className="admin-timeline-block"
                              key={block.bookingId}
                              style={{
                                left: `${left}px`,
                                width: `${width}px`,
                                background: block.color,
                              }}
                              title={`${block.label} — ${block.status}`}
                            >
                              {block.label}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Fleet Status + Unassigned */}
        <div>
          <div className="admin-fleet-status">
            <h3>Fleet Status</h3>
            {loading ? (
              <div style={{ padding: 16, color: 'var(--admin-muted)', fontSize: 13 }}>
                Loading fleet status…
              </div>
            ) : (
              <>
                <div className="admin-fleet-status-counts">
                  <div className="admin-fleet-count">
                    <div className="admin-fleet-count-value active">{fleetStatus.active}</div>
                    <div className="admin-fleet-count-label">Active</div>
                  </div>
                  <div className="admin-fleet-count">
                    <div className="admin-fleet-count-value pending">{fleetStatus.pending}</div>
                    <div className="admin-fleet-count-label">Pending</div>
                  </div>
                </div>

                <button className="admin-synth-btn">
                  ↻ Synthesis Monitor
                </button>

                {/* Unassigned Jobs */}
                <h4 className="admin-unassigned-title">Unassigned</h4>
                {unassignedJobs.length === 0 ? (
                  <div style={{ padding: 16, fontSize: 12, color: 'var(--admin-muted)' }}>
                    No pending unassigned jobs.
                  </div>
                ) : (
                  unassignedJobs.slice(0, 10).map((job) => (
                    <div className="admin-unassigned-job" key={job.bookingId}>
                      <div className="admin-unassigned-job-header">
                        <span className="admin-unassigned-job-title">{job.title}</span>
                        <span className={`admin-status-badge ${job.urgency}`}>
                          {job.urgency.toUpperCase()}
                        </span>
                      </div>
                      <div className="admin-unassigned-job-info">
                        <Clock size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
                        {job.vehicleInfo}
                      </div>
                      <div className="admin-unassigned-job-address">
                        <MapPin size={10} />
                        {job.address}
                      </div>
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
