/**
 * VirtualMechanicTracker — Animated real-time GPS & Road Simulation Tracker.
 * Shows the virtual mechanic response vehicle driving along the route
 * towards the customer's exact location when the booking status is 'en_route'.
 *
 * Used in both the Admin Portal (AdminBookingDetail) and Customer Portal (Bookings).
 */
import { useEffect, useState } from 'react'
import { Navigation, Gauge, Clock, MapPin, Phone, ShieldCheck, Truck } from 'lucide-react'

export interface VirtualMechanicTrackerProps {
  status: string
  mechanicName?: string | null
  mechanicPhone?: string | null
  customerLocation?: { lat: number; lng: number } | null
  customerAddress?: string | null
  initialDistanceKm?: number
  etaMinutes?: number
  unitName?: string
  isLightMode?: boolean
}

export function VirtualMechanicTracker({
  status,
  mechanicName = 'Mobile Roadside Specialist',
  mechanicPhone,
  customerLocation,
  customerAddress,
  initialDistanceKm = 4.2,
  etaMinutes = 12,
  unitName = 'UNIT #04 (RAPID RESPONSE)',
  isLightMode = false,
}: VirtualMechanicTrackerProps) {
  const [speed, setSpeed] = useState<number>(48)
  const [progressRatio, setProgressRatio] = useState<number>(0.22)
  const [currentRoad, setCurrentRoad] = useState<string>('South Link Expressway → Central Interchange')
  const [distanceRemaining, setDistanceRemaining] = useState<number>(initialDistanceKm)
  const [remainingMinutes, setRemainingMinutes] = useState<number>(etaMinutes)

  // Simulation tick: updates vehicle speed, moves along bezier curve, and decrements distance/ETA
  useEffect(() => {
    if (status !== 'en_route') return

    const interval = setInterval(() => {
      // Fluctuate speed realistically between 38 and 58 km/h
      setSpeed((prev) => {
        const delta = Math.floor(Math.random() * 7) - 3
        return Math.min(58, Math.max(38, prev + delta))
      })

      // Advance route progress slowly
      setProgressRatio((prev) => {
        const next = prev + 0.015
        if (next >= 0.94) return 0.94 // Keep near destination until completed
        return next
      })
    }, 1800)

    return () => clearInterval(interval)
  }, [status])

  // Update telemetry values based on route progress
  useEffect(() => {
    const fractionRemaining = Math.max(0.05, 1 - progressRatio)
    const dist = Number((initialDistanceKm * fractionRemaining).toFixed(1))
    setDistanceRemaining(dist)
    const mins = Math.max(1, Math.ceil(etaMinutes * fractionRemaining))
    setRemainingMinutes(mins)

    if (dist <= 0.6) {
      setCurrentRoad('Entering customer street / approaching exact service pin')
    } else if (dist <= 1.8) {
      setCurrentRoad('Taking Exit Ramp → Connecting to Local Arterial Road')
    } else {
      setCurrentRoad('South Link Expressway → Central Interchange')
    }
  }, [progressRatio, initialDistanceKm, etaMinutes])

  // Cubic Bézier curve calculation for highway simulation: p0 -> p1 -> p2 -> p3
  const t = Math.min(0.95, Math.max(0.05, progressRatio))
  const p0 = { x: 50, y: 55 }
  const p1 = { x: 260, y: 25 }
  const p2 = { x: 320, y: 185 }
  const p3 = { x: 510, y: 155 }

  // Current position on the curve
  const cx =
    Math.pow(1 - t, 3) * p0.x +
    3 * Math.pow(1 - t, 2) * t * p1.x +
    3 * (1 - t) * Math.pow(t, 2) * p2.x +
    Math.pow(t, 3) * p3.x
  const cy =
    Math.pow(1 - t, 3) * p0.y +
    3 * Math.pow(1 - t, 2) * t * p1.y +
    3 * (1 - t) * Math.pow(t, 2) * p2.y +
    Math.pow(t, 3) * p3.y

  // Compute tangent angle for van rotation
  const dt = 0.01
  const tNext = Math.min(1, t + dt)
  const cxNext =
    Math.pow(1 - tNext, 3) * p0.x +
    3 * Math.pow(1 - tNext, 2) * tNext * p1.x +
    3 * (1 - tNext) * Math.pow(tNext, 2) * p2.x +
    Math.pow(tNext, 3) * p3.x
  const cyNext =
    Math.pow(1 - tNext, 3) * p0.y +
    3 * Math.pow(1 - tNext, 2) * tNext * p1.y +
    3 * (1 - tNext) * Math.pow(tNext, 2) * p2.y +
    Math.pow(tNext, 3) * p3.y
  const angleDeg = (Math.atan2(cyNext - cy, cxNext - cx) * 180) / Math.PI

  return (
    <div className={`virtual-gps-tracker-card ${isLightMode ? 'light-theme' : 'dark-theme'}`}>
      {/* Telemetry Header */}
      <div className="gps-map-header">
        <div className="gps-map-title">
          <Navigation size={15} className="route-icon" />
          <span>VIRTUAL MECHANIC EN ROUTE</span>
          <span className="live-telemetry-badge">
            <span className="live-radar-dot" /> LIVE SATELLITE
          </span>
        </div>
        <div className="gps-telemetry-strip">
          <span>
            <Gauge size={13} /> {speed} km/h
          </span>
          <span>
            <MapPin size={13} /> {distanceRemaining} km away
          </span>
        </div>
      </div>

      {/* SVG Animated Road Simulation */}
      <div className="gps-map-canvas-container">
        <svg
          viewBox="0 0 580 210"
          className="gps-map-svg"
          preserveAspectRatio="xMidYMid meet"
          aria-label="En route road tracking map"
        >
          <defs>
            <filter id="routeGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <pattern id="cityGridPattern" width="30" height="30" patternUnits="userSpaceOnUse">
              <path
                d="M 30 0 L 0 0 0 30"
                fill="none"
                stroke={isLightMode ? '#e2e8f0' : '#1e293b'}
                strokeWidth="1"
              />
            </pattern>
          </defs>

          {/* Background Grid */}
          <rect width="100%" height="100%" fill="url(#cityGridPattern)" />

          {/* Secondary streets */}
          <path
            d="M 20 120 Q 200 110 560 60"
            stroke={isLightMode ? '#f1f5f9' : '#1e293b'}
            strokeWidth="10"
            fill="none"
          />
          <path
            d="M 120 10 Q 200 120 280 200"
            stroke={isLightMode ? '#f1f5f9' : '#1e293b'}
            strokeWidth="8"
            fill="none"
          />
          <path
            d="M 380 10 Q 420 100 480 200"
            stroke={isLightMode ? '#f1f5f9' : '#1e293b'}
            strokeWidth="8"
            fill="none"
          />

          {/* Main Highway Base (Asphalt outline) */}
          <path
            d="M 50 55 C 260 25, 320 185, 510 155"
            fill="none"
            stroke={isLightMode ? '#cbd5e1' : '#334155'}
            strokeWidth="16"
            strokeLinecap="round"
          />

          {/* Road Asphalt Fill */}
          <path
            d="M 50 55 C 260 25, 320 185, 510 155"
            fill="none"
            stroke={isLightMode ? '#64748b' : '#0f172a'}
            strokeWidth="12"
            strokeLinecap="round"
          />

          {/* Animated Road Dashes (Traffic Flow) */}
          <path
            d="M 50 55 C 260 25, 320 185, 510 155"
            fill="none"
            stroke="#f8fafc"
            strokeWidth="2"
            strokeDasharray="6,8"
            className="animated-road-dashes"
          />

          {/* Active Navigation Line (Blue Traveled Route) */}
          <path
            d="M 50 55 C 260 25, 320 185, 510 155"
            fill="none"
            stroke="#3b82f6"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="600"
            strokeDashoffset={600 * (1 - progressRatio)}
            filter="url(#routeGlow)"
          />

          {/* Dispatch Origin Station */}
          <g transform="translate(45, 45)">
            <circle r="12" fill="#0f172a" stroke="#3b82f6" strokeWidth="2" />
            <circle r="5" fill="#e4b95e" />
            <text x="-25" y="24" fontSize="9" fontWeight="700" fill="#94a3b8">
              LSC CENTRAL DEPOT
            </text>
          </g>

          {/* Customer Destination Pin */}
          <g transform="translate(510, 155)">
            <circle
              r="22"
              fill="none"
              stroke="rgba(239, 68, 68, 0.4)"
              strokeWidth="1.5"
              className="dest-pulse-ring"
            />
            <circle
              r="14"
              fill="none"
              stroke="rgba(239, 68, 68, 0.7)"
              strokeWidth="2"
              className="dest-pulse-ring-inner"
            />
            <circle r="8" fill="#ef4444" />
            <circle r="3" fill="#ffffff" />
            <rect x="-48" y="-36" width="96" height="18" rx="4" fill="#0f172a" />
            <text x="0" y="-24" fontSize="8" fontWeight="800" fill="#ffffff" textAnchor="middle">
              CUSTOMER PIN
            </text>
          </g>

          {/* Moving Virtual Mechanic Response Vehicle */}
          <g transform={`translate(${cx}, ${cy})`} className="moving-mechanic-group">
            <circle r="18" fill="rgba(34, 197, 94, 0.25)" className="van-radar-pulse" />

            <g transform={`rotate(${angleDeg})`}>
              <rect
                x="-14"
                y="-8"
                width="28"
                height="16"
                rx="4"
                fill="#0f172a"
                stroke="#ffffff"
                strokeWidth="1.5"
              />
              <rect x="-11" y="-6" width="10" height="12" rx="2" fill="#3b82f6" />
              <rect x="7" y="-5" width="4" height="10" rx="1" fill="#93c5fd" />
              <circle cx="0" cy="0" r="3" fill="#ef4444" className="van-strobe-light" />
            </g>

            <rect x="-56" y="-32" width="112" height="18" rx="4" fill="#16a34a" />
            <text x="0" y="-20" fontSize="8" fontWeight="800" fill="#ffffff" textAnchor="middle">
              {mechanicName.slice(0, 14)} ({speed} km/h)
            </text>
          </g>
        </svg>

        {/* Live Road Status & ETA Footer */}
        <div className="gps-live-road-footer">
          <div className="road-name-chip">
            <Navigation size={13} style={{ color: '#0284c7' }} />
            <span>{currentRoad}</span>
          </div>
          <div className="eta-live-chip">
            <Clock size={13} style={{ color: '#b45309' }} />
            <strong>ETA: {remainingMinutes} MINS</strong>
          </div>
        </div>
      </div>

      {/* Driver Context Strip */}
      <div className="virtual-mechanic-driver-bar">
        <div className="v-mechanic-avatar">
          <Truck size={16} />
        </div>
        <div className="v-mechanic-meta">
          <strong>{mechanicName}</strong>
          <p>
            <ShieldCheck size={12} style={{ display: 'inline', marginRight: 4 }} />
            {unitName} • Equipped for On-Site Diagnostic & Repair
          </p>
          {customerAddress && (
            <p className="v-mechanic-dest">
              <MapPin size={11} style={{ display: 'inline', marginRight: 4 }} />
              Heading to: <span>{customerAddress}</span>
            </p>
          )}
          {customerLocation && (
            <small style={{ color: '#94a3b8', fontSize: '10.5px' }}>
              GPS: {customerLocation.lat.toFixed(4)}, {customerLocation.lng.toFixed(4)}
            </small>
          )}
        </div>

        {mechanicPhone && (
          <a
            href={`tel:${mechanicPhone.replace(/[^+\d]/g, '')}`}
            className="v-mechanic-call-btn"
            title="Call Mechanic"
          >
            <Phone size={13} /> Call
          </a>
        )}
      </div>
    </div>
  )
}
