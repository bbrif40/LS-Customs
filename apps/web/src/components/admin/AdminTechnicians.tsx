/**
 * AdminTechnicians — Technician Scheduling page.
 * Shows a timeline grid with schedule blocks, fleet status, and unassigned jobs.
 * Matches the "Admin - Technician Scheduling" Figma screen.
 */
import { useState } from 'react'
import { Filter, Plus, MapPin, Clock } from 'lucide-react'
import { scheduleBlocks, scheduleTechnicians, unassignedJobs } from '../../data/adminData'

const hours = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']

export function AdminTechnicians() {
  const [scheduleView, setScheduleView] = useState<'today' | 'week'>('today')

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
        </div>
      </div>

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
          <div className="admin-timeline">
            {/* Sidebar (Tech names) */}
            <div className="admin-timeline-sidebar">
              <div className="admin-timeline-header-cell">Technician</div>
              {scheduleTechnicians.map((name) => (
                <div className="admin-timeline-tech" key={name}>
                  <div className="admin-timeline-tech-avatar">
                    {name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <span className="admin-timeline-tech-name">{name}</span>
                </div>
              ))}
            </div>

            {/* Hours Grid */}
            <div className="admin-timeline-body">
              <div className="admin-timeline-hours">
                {hours.map((h) => (
                  <div className="admin-timeline-hour" key={h}>{h}</div>
                ))}
              </div>
              {scheduleTechnicians.map((techName) => {
                const blocks = scheduleBlocks.filter((b) => b.techName === techName)
                return (
                  <div className="admin-timeline-row" key={techName}>
                    {hours.map((_, i) => (
                      <div className="admin-timeline-cell" key={i} />
                    ))}
                    {blocks.map((block, i) => {
                      const left = (block.startHour - 8) * 80
                      const width = (block.endHour - block.startHour) * 80
                      return (
                        <div
                          className="admin-timeline-block"
                          key={i}
                          style={{
                            left: `${left}px`,
                            width: `${width}px`,
                            background: block.color,
                          }}
                        >
                          {block.label}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Fleet Status + Unassigned */}
        <div>
          <div className="admin-fleet-status">
            <h3>Fleet Status</h3>
            <div className="admin-fleet-status-counts">
              <div className="admin-fleet-count">
                <div className="admin-fleet-count-value active">12</div>
                <div className="admin-fleet-count-label">Active</div>
              </div>
              <div className="admin-fleet-count">
                <div className="admin-fleet-count-value pending">3</div>
                <div className="admin-fleet-count-label">Pending</div>
              </div>
            </div>

            <button className="admin-synth-btn">
              ↻ Synthesis Monitor
            </button>

            {/* Unassigned Jobs */}
            <h4 className="admin-unassigned-title">Unassigned</h4>
            {unassignedJobs.map((job, i) => (
              <div className="admin-unassigned-job" key={i}>
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
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
