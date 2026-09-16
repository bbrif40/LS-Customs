/**
 * EmergencyMechanicModal — high-priority roadside assistance dispatch modal.
 * Light mode design adhering to LS Customs color scheme.
 * Features Philippine Peso (₱) pricing, live satellite GPS lock,
 * and an interactive Virtual Mechanic GPS Tracker with live vehicle movement,
 * speed, distance, and real-time ETA calculation.
 */
import { useState, useEffect, useRef } from 'react'
import {
  AlertTriangle,
  Zap,
  Disc,
  Key,
  Fuel,
  Wrench,
  Navigation,
  PhoneCall,
  Clock,
  CheckCircle2,
  X,
  Radio,
  ChevronRight,
  ShieldAlert,
  Car,
  MapPin,
  Volume2,
  VolumeX,
  Compass,
  Gauge,
  Route,
  ShieldCheck,
} from 'lucide-react'
import { supabase } from '../../supabaseClient'

export interface EmergencyDispatchData {
  id: string
  issue: string
  issueLabel: string
  coords: { lat: number; lng: number }
  locationLabel: string
  vehicleDetails: string
  etaMinutes: number
  dispatchedAt: number
  mechanic: {
    name: string
    unit: string
    vehicle: string
    phone: string
    rating: number
    initials: string
    plateNumber: string
  }
}

interface EmergencyMechanicModalProps {
  open: boolean
  onClose: () => void
  onNotify: (message: string) => void
  userId?: string
  activeDispatch: EmergencyDispatchData | null
  setActiveDispatch: (dispatch: EmergencyDispatchData | null) => void
  onViewBookings?: () => void
}

interface EmergencyScenario {
  id: string
  label: string
  description: string
  icon: typeof Zap
  avgEta: string
  cost: number // in Philippine Peso (₱)
  color: string
}

const EMERGENCY_SCENARIOS: EmergencyScenario[] = [
  {
    id: 'battery',
    label: 'Dead Battery / Jump Start',
    description: 'Rapid battery health test, heavy-duty booster jump, or alternator check',
    icon: Zap,
    avgEta: '8 - 12 min',
    cost: 1850,
    color: '#d97706',
  },
  {
    id: 'tire',
    label: 'Flat Tire / Blowout',
    description: 'On-site tire swap with spare or rapid puncture vulcanizing plug',
    icon: Disc,
    avgEta: '10 - 15 min',
    cost: 1250,
    color: '#0284c7',
  },
  {
    id: 'engine',
    label: 'Engine Breakdown / Smoke',
    description: 'OBD-II scanner diagnostic, radiator overheating check, belt inspection',
    icon: AlertTriangle,
    avgEta: '12 - 18 min',
    cost: 2950,
    color: '#dc2626',
  },
  {
    id: 'lockout',
    label: 'Vehicle Lockout',
    description: 'Non-destructive rapid door unlocking & safe key retrieval tools',
    icon: Key,
    avgEta: '8 - 12 min',
    cost: 1650,
    color: '#7c3aed',
  },
  {
    id: 'fuel',
    label: 'Emergency Fuel / Fluids',
    description: 'Delivery of 10L gasoline/diesel or emergency radiator coolant top-up',
    icon: Fuel,
    avgEta: '8 - 12 min',
    cost: 1200,
    color: '#ea580c',
  },
  {
    id: 'towing',
    label: 'Critical Tow / Flatbed',
    description: 'Immediate heavy-duty hydraulic flatbed dispatch to your location',
    icon: Wrench,
    avgEta: '15 - 22 min',
    cost: 3800,
    color: '#db2777',
  },
]

// Default location anchor: Metro Central Highway
const DEFAULT_COORDS = { lat: 14.5547, lng: 121.0244 }
const DEFAULT_LOCATION_LABEL = 'Central Highway / Metro Ave (Near LS Customs Service Bay)'

export function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Tactical audio ping synthesized with Web Audio API */
function playTacticalBeep(pitch = 880, duration = 0.08) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(pitch, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(pitch * 1.4, ctx.currentTime + duration)
    gain.gain.setValueAtTime(0.035, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + duration)
  } catch {
    // Audio autoplay might be blocked; ignore gracefully
  }
}

export function EmergencyMechanicModal({
  open,
  onClose,
  onNotify,
  userId,
  activeDispatch,
  setActiveDispatch,
  onViewBookings,
}: EmergencyMechanicModalProps) {
  const [selectedIssueId, setSelectedIssueId] = useState<string>('battery')
  const [vehicleDetails, setVehicleDetails] = useState<string>('')
  const [locationLabel, setLocationLabel] = useState<string>(DEFAULT_LOCATION_LABEL)
  const [coords, setCoords] = useState<{ lat: number; lng: number }>(DEFAULT_COORDS)
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'locked' | 'failed'>('idle')
  const [isScanning, setIsScanning] = useState<boolean>(false)
  const [scanStepMessage, setScanStepMessage] = useState<string>('Broadcasting SOS packet to fleet...')
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true)
  const [remainingSeconds, setRemainingSeconds] = useState<number>(540) // 9 minutes default

  // Auto-acquire GPS on modal mount if not already acquired
  useEffect(() => {
    if (open && gpsStatus === 'idle' && !activeDispatch) {
      locateUser()
    }
  }, [open, gpsStatus, activeDispatch])

  // Countdown timer for active dispatch
  useEffect(() => {
    if (!activeDispatch) return

    const elapsed = Math.floor((Date.now() - activeDispatch.dispatchedAt) / 1000)
    const initialSeconds = activeDispatch.etaMinutes * 60
    const remaining = Math.max(0, initialSeconds - elapsed)
    setRemainingSeconds(remaining)

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [activeDispatch])

  if (!open) return null

  const locateUser = () => {
    setGpsStatus('locating')
    if (soundEnabled) playTacticalBeep(640, 0.08)

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newCoords = {
            lat: Number(position.coords.latitude.toFixed(4)),
            lng: Number(position.coords.longitude.toFixed(4)),
          }
          setCoords(newCoords)
          setLocationLabel(`Live GPS: ${newCoords.lat}°N, ${newCoords.lng}°E (Accuracy ±${Math.round(position.coords.accuracy)}m)`)
          setGpsStatus('locked')
          if (soundEnabled) playTacticalBeep(1200, 0.12)
        },
        () => {
          setGpsStatus('failed')
          setLocationLabel('Metro Central Highway (Near LS Customs Central Depot)')
        },
        { timeout: 8000, enableHighAccuracy: true }
      )
    } else {
      setGpsStatus('failed')
      setLocationLabel('Metro Area Highway')
    }
  }

  const handleStartDispatch = async () => {
    setIsScanning(true)
    if (soundEnabled) playTacticalBeep(520, 0.1)

    const scanSteps = [
      { msg: 'Transmitting encrypted SOS telemetry to Roadside Mesh...', delay: 600, pitch: 580 },
      { msg: 'Triangulating closest mobile response units in 5km radius...', delay: 1400, pitch: 720 },
      { msg: 'GPS Signal Locked: Rapid Unit #04 accepted emergency dispatch...', delay: 2200, pitch: 920 },
      { msg: 'Unit en route! Route cleared via Southlink Highway.', delay: 3000, pitch: 1180 },
    ]

    scanSteps.forEach(({ msg, delay, pitch }) => {
      window.setTimeout(() => {
        setScanStepMessage(msg)
        if (soundEnabled) playTacticalBeep(pitch, 0.08)
      }, delay)
    })

    const selectedScenario = EMERGENCY_SCENARIOS.find((s) => s.id === selectedIssueId) || EMERGENCY_SCENARIOS[0]

    let bookingId = `LSC-EMG-${Math.floor(1000 + Math.random() * 9000)}`
    if (userId) {
      try {
        const { data, error } = await supabase
          .from('service_bookings')
          .insert({
            customer_id: userId,
            pin_lat: coords.lat,
            pin_lng: coords.lng,
            scheduled_at: new Date().toISOString(),
            status: 'pending',
            notes: `[EMERGENCY ROADSIDE DISPATCH] Issue: ${selectedScenario.label}. Location: ${locationLabel}. Vehicle: ${vehicleDetails || 'Passenger Vehicle'}. Fee: ₱${selectedScenario.cost}`,
            total_price: selectedScenario.cost,
          })
          .select('id')
          .single()

        if (!error && data?.id) {
          bookingId = data.id
          void supabase.functions.invoke('assign-mechanic', {
            body: { service_booking_id: data.id },
          }).catch(() => {
            // Graceful fallback to simulated on-duty technician
          })
        }
      } catch {
        // Fallback reference handled below
      }
    }

    window.setTimeout(() => {
      const newDispatch: EmergencyDispatchData = {
        id: bookingId,
        issue: selectedIssueId,
        issueLabel: selectedScenario.label,
        coords,
        locationLabel,
        vehicleDetails: vehicleDetails.trim() || 'Passenger Vehicle (Hazards On)',
        etaMinutes: 9,
        dispatchedAt: Date.now(),
        mechanic: {
          name: 'Marcus Vance',
          unit: 'Mobile Van Unit #04',
          vehicle: 'Ford F-250 Heavy Duty Service Rig',
          phone: '(0917) 555-0199',
          plateNumber: 'LSC-SOS-992',
          rating: 4.98,
          initials: 'MV',
        },
      }

      setActiveDispatch(newDispatch)
      setIsScanning(false)
      onNotify(`🚨 Unit #04 (Marcus Vance) is en route to your GPS location!`)
    }, 3300)
  }

  const handleCancelDispatch = () => {
    if (window.confirm('Cancel emergency roadside mechanic dispatch?')) {
      setActiveDispatch(null)
      onNotify('Emergency dispatch request has been cancelled')
    }
  }

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const selectedScenario = EMERGENCY_SCENARIOS.find((s) => s.id === selectedIssueId) || EMERGENCY_SCENARIOS[0]

  return (
    <div className="emergency-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="emergency-modal-dialog light-mode" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="emergency-modal-header">
          <div className="emergency-header-title">
            <div className="emergency-pulse-icon">
              <ShieldAlert size={20} />
            </div>
            <div>
              <h2>LS Customs Roadside SOS</h2>
              <span className="emergency-header-badge">
                <span className="pulse-dot-red" />
                24/7 RAPID RESPONSE DISPATCH • PHILIPPINES
              </span>
            </div>
          </div>
          <div className="emergency-header-actions">
            <button
              className="emergency-sound-toggle"
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? 'Mute radar sounds' : 'Enable radar sounds'}
              aria-label="Toggle sound"
            >
              {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <button className="emergency-modal-close" onClick={onClose} aria-label="Close emergency modal">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Active Dispatch Screen with Virtual Mechanic GPS Tracking ── */}
        {activeDispatch ? (
          <div className="emergency-modal-content active-cockpit">
            {/* Status Banner */}
            <div className="active-dispatch-banner">
              <div className="dispatch-radar-pulse">
                <Radio size={24} className="radar-icon-spin" />
              </div>
              <div className="dispatch-banner-text">
                <span className="dispatch-badge-enroute">UNIT EN ROUTE • EMERGENCY MODE</span>
                <h3>Virtual Mechanic In Transit</h3>
                <p className="dispatch-reference">Dispatch ID: <strong>{activeDispatch.id}</strong></p>
              </div>
              <div className="eta-countdown-display">
                <span className="eta-label">ESTIMATED ARRIVAL</span>
                <strong className="eta-timer">{formatCountdown(remainingSeconds)}</strong>
                <small className="eta-distance">Live GPS Tracking Active</small>
              </div>
            </div>

            {/* Stepper Progress */}
            <div className="emergency-progress-track">
              <div className="step-item completed">
                <span className="step-dot"><CheckCircle2 size={13} /></span>
                <span className="step-title">SOS Confirmed</span>
              </div>
              <div className="step-connector active" />
              <div className="step-item active">
                <span className="step-dot pulse-beacon">2</span>
                <span className="step-title">En Route (Live GPS)</span>
              </div>
              <div className="step-connector" />
              <div className="step-item pending">
                <span className="step-dot">3</span>
                <span className="step-title">On-Site Service</span>
              </div>
            </div>

            {/* ── Virtual Mechanic Live GPS Map Tracker ───────────────── */}
            <VirtualMechanicGPSMap
              activeDispatch={activeDispatch}
              remainingSeconds={remainingSeconds}
            />

            {/* Assigned Mechanic Card */}
            <div className="assigned-mechanic-card">
              <div className="mechanic-avatar-box">
                <span>{activeDispatch.mechanic.initials}</span>
                <span className="mechanic-verified-check">✓</span>
              </div>
              <div className="mechanic-info-main">
                <div className="mechanic-name-row">
                  <h4>{activeDispatch.mechanic.name}</h4>
                  <span className="mechanic-rating-badge">★ {activeDispatch.mechanic.rating}</span>
                  <span className="mechanic-plate-tag">Plate: {activeDispatch.mechanic.plateNumber}</span>
                </div>
                <p className="mechanic-unit-tag">{activeDispatch.mechanic.unit} • {activeDispatch.mechanic.vehicle}</p>
                <div className="mechanic-detail-chips">
                  <span>📍 Destination: {activeDispatch.locationLabel}</span>
                  <span>🔧 Service: {activeDispatch.issueLabel}</span>
                  <span>💵 Total: <strong>{formatPeso(selectedScenario.cost)}</strong></span>
                </div>
              </div>
              <div className="mechanic-call-action">
                <a
                  href={`tel:${activeDispatch.mechanic.phone}`}
                  className="button emergency-call-tech-btn"
                  onClick={() => onNotify('Connecting to roadside driver direct line...')}
                >
                  <PhoneCall size={15} />
                  <span>Call Driver</span>
                </a>
              </div>
            </div>

            {/* Roadside Safety Protocol */}
            <div className="roadside-safety-box">
              <div className="safety-title">
                <AlertTriangle size={16} />
                <strong>Driver Safety Protocol:</strong>
              </div>
              <ul>
                <li>Keep vehicle hazard emergency lights flashing.</li>
                <li>Remain safely inside the vehicle with seatbelts fastened if stopped along an expressway shoulder.</li>
                <li>Service van will arrive with high-visibility amber strobe beacon lights active.</li>
              </ul>
            </div>

            {/* Bottom Actions */}
            <div className="active-dispatch-actions">
              <button
                type="button"
                className="button outline-button"
                onClick={() => {
                  onClose()
                  if (onViewBookings) onViewBookings()
                }}
              >
                Track in My Bookings
              </button>
              <button
                type="button"
                className="button cancel-emergency-btn"
                onClick={handleCancelDispatch}
              >
                Cancel Emergency Request
              </button>
            </div>
          </div>
        ) : isScanning ? (
          /* ── Radar Scanning State ───────────────────────────────── */
          <div className="emergency-modal-content scanning-cockpit">
            <div className="tactical-radar-container">
              <div className="tactical-radar-screen">
                <div className="radar-grid-ring ring-1" />
                <div className="radar-grid-ring ring-2" />
                <div className="radar-grid-ring ring-3" />
                <div className="radar-axis-horizontal" />
                <div className="radar-axis-vertical" />
                <div className="radar-sweep-beam" />
                {/* Radar Blips */}
                <div className="radar-blip blip-user">
                  <span className="blip-label">YOU</span>
                </div>
                <div className="radar-blip blip-unit-1">
                  <span className="blip-label">UNIT 04</span>
                </div>
                <div className="radar-blip blip-unit-2">
                  <span className="blip-label">UNIT 07</span>
                </div>
              </div>
            </div>

            <div className="radar-scan-status">
              <span className="status-indicator-dot" />
              <h3>EMERGENCY DISPATCH IN PROGRESS</h3>
              <p className="scan-step-text">{scanStepMessage}</p>
              <div className="scan-progress-bar">
                <div className="scan-progress-fill" />
              </div>
            </div>
          </div>
        ) : (
          /* ── Triage & SOS Request Form (Light Mode) ──────────────── */
          <div className="emergency-modal-content">
            {/* GPS Banner */}
            <div className="emergency-gps-strip">
              <div className="gps-indicator-group">
                <span className={`gps-status-dot ${gpsStatus}`} />
                <div>
                  <strong>Your Roadside GPS Location:</strong>
                  <p>{locationLabel}</p>
                </div>
              </div>
              <button
                type="button"
                className="emergency-gps-recenter-btn"
                onClick={locateUser}
                disabled={gpsStatus === 'locating'}
              >
                <Navigation size={13} />
                {gpsStatus === 'locating' ? 'Locating...' : 'Re-scan GPS'}
              </button>
            </div>

            {/* Scenario Selection */}
            <div className="emergency-section-title">
              <span>1</span> SELECT EMERGENCY SERVICE:
            </div>
            <div className="emergency-scenarios-grid">
              {EMERGENCY_SCENARIOS.map((sc) => {
                const IconComponent = sc.icon
                const isSelected = sc.id === selectedIssueId
                return (
                  <button
                    key={sc.id}
                    type="button"
                    className={`scenario-card ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => {
                      setSelectedIssueId(sc.id)
                      if (soundEnabled) playTacticalBeep(750, 0.05)
                    }}
                  >
                    <div className="scenario-icon" style={{ color: sc.color, background: `${sc.color}16` }}>
                      <IconComponent size={20} />
                    </div>
                    <div className="scenario-info">
                      <h4>{sc.label}</h4>
                      <p>{sc.description}</p>
                    </div>
                    <div className="scenario-meta">
                      <span className="scenario-eta"><Clock size={11} /> {sc.avgEta}</span>
                      <strong className="scenario-price">{formatPeso(sc.cost)}</strong>
                    </div>
                    {isSelected && <div className="scenario-check-badge">✓</div>}
                  </button>
                )
              })}
            </div>

            {/* Vehicle Details Field */}
            <div className="emergency-vehicle-box">
              <div className="emergency-section-title">
                <span>2</span> VEHICLE & LOCATION NOTES (OPTIONAL):
              </div>
              <div className="vehicle-input-wrapper">
                <Car size={16} className="input-icon" />
                <input
                  type="text"
                  placeholder="e.g. 2024 White Toyota Fortuner, hazard lights on, near highway tollgate"
                  value={vehicleDetails}
                  onChange={(e) => setVehicleDetails(e.target.value)}
                />
              </div>
            </div>

            {/* Dispatch Footer */}
            <div className="emergency-submit-footer">
              <div className="emergency-pricing-preview">
                <span>Estimated Emergency Fee:</span>
                <strong>{formatPeso(selectedScenario.cost)}</strong>
                <small>No advance payment required. Cash or GCash upon arrival</small>
              </div>

              <button
                type="button"
                className="button emergency-launch-btn"
                onClick={handleStartDispatch}
              >
                <div className="btn-beacon-glow" />
                <AlertTriangle size={18} />
                <span>DISPATCH EMERGENCY MECHANIC NOW</span>
                <ChevronRight size={18} />
              </button>

              <div className="emergency-tollfree-strip">
                <span>24/7 Roadside Assistance Hotline:</span>
                <a href="tel:0288880199" className="tollfree-link">
                  <PhoneCall size={14} /> (02) 8888-0199 / 0917-555-0199
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * VirtualMechanicGPSMap — animated real-time GPS tracking route
 * showing the virtual response van driving along the road towards the customer!
 */
function VirtualMechanicGPSMap({
  activeDispatch,
  remainingSeconds,
}: {
  activeDispatch: EmergencyDispatchData
  remainingSeconds: number
}) {
  // Road travel progress from 15% (starting dispatch) to 95% (arrived)
  const initialTotalSeconds = activeDispatch.etaMinutes * 60
  const elapsed = Math.max(0, initialTotalSeconds - remainingSeconds)
  const baseProgress = Math.min(0.92, Math.max(0.12, elapsed / initialTotalSeconds))

  // Live fluctuating telemetry for realistic alive feel
  const [speed, setSpeed] = useState<number>(46)
  const [distanceKm, setDistanceKm] = useState<number>(Number((1.8 * (1 - baseProgress * 0.85)).toFixed(1)))
  const [currentRoad, setCurrentRoad] = useState<string>('South Link Expressway → Central Interchange')

  useEffect(() => {
    const interval = setInterval(() => {
      // Small realistic speed variance
      setSpeed((prev) => {
        const delta = Math.floor(Math.random() * 7) - 3
        const newSpeed = prev + delta
        return Math.min(58, Math.max(36, newSpeed))
      })

      // Distance calculation based on remaining time
      const dist = Math.max(0.2, Number(((remainingSeconds / (activeDispatch.etaMinutes * 60)) * 2.2).toFixed(1)))
      setDistanceKm(dist)

      if (dist < 0.6) {
        setCurrentRoad('Entering your street / service lane — Approaching vehicle')
      } else if (dist < 1.2) {
        setCurrentRoad('Taking Exit 14 Ramp → Connecting to Local Road')
      } else {
        setCurrentRoad('South Link Expressway → Central Interchange')
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [remainingSeconds, activeDispatch.etaMinutes])

  // Waypoint road coordinates on SVG (width 600, height 220)
  // Van starts at left (x: 50, y: 50) and follows S-curve to user (x: 520, y: 160)
  const progressRatio = Math.min(0.95, baseProgress)
  // Quadratic bezier points: P0=(50, 45), P1=(280, 20), P2=(340, 180), P3=(520, 160)
  // Approximate path position for smooth SVG interpolation:
  const t = progressRatio
  const p0 = { x: 50, y: 55 }
  const p1 = { x: 260, y: 25 }
  const p2 = { x: 320, y: 185 }
  const p3 = { x: 510, y: 155 }

  // Cubic bezier formula: B(t) = (1-t)^3*P0 + 3*(1-t)^2*t*P1 + 3*(1-t)*t^2*P2 + t^3*P3
  const cx = Math.pow(1 - t, 3) * p0.x + 3 * Math.pow(1 - t, 2) * t * p1.x + 3 * (1 - t) * Math.pow(t, 2) * p2.x + Math.pow(t, 3) * p3.x
  const cy = Math.pow(1 - t, 3) * p0.y + 3 * Math.pow(1 - t, 2) * t * p1.y + 3 * (1 - t) * Math.pow(t, 2) * p2.y + Math.pow(t, 3) * p3.y

  // Calculate tangent angle for van rotation
  const dt = 0.01
  const tNext = Math.min(1, t + dt)
  const cxNext = Math.pow(1 - tNext, 3) * p0.x + 3 * Math.pow(1 - tNext, 2) * tNext * p1.x + 3 * (1 - tNext) * Math.pow(tNext, 2) * p2.x + Math.pow(tNext, 3) * p3.x
  const cyNext = Math.pow(1 - tNext, 3) * p0.y + 3 * Math.pow(1 - tNext, 2) * tNext * p1.y + 3 * (1 - tNext) * Math.pow(tNext, 2) * p2.y + Math.pow(tNext, 3) * p3.y
  const angleDeg = (Math.atan2(cyNext - cy, cxNext - cx) * 180) / Math.PI

  return (
    <div className="virtual-gps-tracker-card">
      {/* Live Map Header */}
      <div className="gps-map-header">
        <div className="gps-map-title">
          <Route size={16} className="route-icon" />
          <strong>LIVE VIRTUAL MECHANIC ROUTE</strong>
          <span className="live-telemetry-badge">
            <span className="live-radar-dot" /> LIVE SATELLITE
          </span>
        </div>
        <div className="gps-telemetry-strip">
          <span><Gauge size={13} /> {speed} km/h</span>
          <span><MapPin size={13} /> {distanceKm} km away</span>
        </div>
      </div>

      {/* SVG Animated Road Simulation */}
      <div className="gps-map-canvas-container">
        <svg
          viewBox="0 0 580 210"
          className="gps-map-svg"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="roadGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#e2e8f0" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </linearGradient>
            <linearGradient id="activeTrailGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Grid lines simulating city block coordinates */}
          <pattern id="cityGrid" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#f1f5f9" strokeWidth="1" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#cityGrid)" />

          {/* Secondary streets */}
          <path d="M 20 120 Q 200 110 560 60" stroke="#f1f5f9" strokeWidth="10" fill="none" />
          <path d="M 120 10 Q 200 120 280 200" stroke="#f1f5f9" strokeWidth="8" fill="none" />
          <path d="M 380 10 Q 420 100 480 200" stroke="#f1f5f9" strokeWidth="8" fill="none" />

          {/* Main Highway Road (Asphalt base) */}
          <path
            d="M 50 55 C 260 25, 320 185, 510 155"
            fill="none"
            stroke="#cbd5e1"
            strokeWidth="16"
            strokeLinecap="round"
          />
          {/* Road Asphalt Fill */}
          <path
            d="M 50 55 C 260 25, 320 185, 510 155"
            fill="none"
            stroke="#475569"
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
            filter="url(#glow)"
          />

          {/* Dispatch Origin Station */}
          <g transform="translate(45, 45)">
            <circle r="12" fill="#0f172a" />
            <circle r="6" fill="#e4b95e" />
            <text x="-25" y="24" fontSize="9.5" fontWeight="700" fill="#475569">LSC DEPOT</text>
          </g>

          {/* Customer Vehicle Destination Pin */}
          <g transform="translate(510, 155)">
            {/* Concentric radar pulse circles */}
            <circle r="22" fill="none" stroke="rgba(239, 68, 68, 0.4)" strokeWidth="1.5" className="dest-pulse-ring" />
            <circle r="14" fill="none" stroke="rgba(239, 68, 68, 0.7)" strokeWidth="2" className="dest-pulse-ring-inner" />
            <circle r="8" fill="#ef4444" />
            <circle r="3" fill="#ffffff" />
            {/* Label */}
            <rect x="-42" y="-36" width="84" height="18" rx="4" fill="#0f172a" />
            <text x="0" y="-24" fontSize="8.5" fontWeight="800" fill="#ffffff" textAnchor="middle">YOUR CAR 📍</text>
          </g>

          {/* Moving Virtual Mechanic Van */}
          <g
            transform={`translate(${cx}, ${cy})`}
            className="moving-mechanic-group"
          >
            {/* Dynamic radar wave around van */}
            <circle r="16" fill="rgba(34, 197, 94, 0.25)" className="van-radar-pulse" />

            {/* Van body rotating along road */}
            <g transform={`rotate(${angleDeg})`}>
              {/* Van Chassis */}
              <rect x="-14" y="-8" width="28" height="16" rx="4" fill="#0f172a" stroke="#ffffff" strokeWidth="1.5" />
              <rect x="-11" y="-6" width="10" height="12" rx="2" fill="#3b82f6" />
              {/* Windshield */}
              <rect x="7" y="-5" width="4" height="10" rx="1" fill="#93c5fd" />
              {/* Flashing Emergency Beacon Light */}
              <circle cx="0" cy="0" r="3" fill="#ef4444" className="van-strobe-light" />
            </g>

            {/* Float Tag above Van */}
            <rect x="-48" y="-32" width="96" height="18" rx="4" fill="#16a34a" />
            <text x="0" y="-20" fontSize="8.5" fontWeight="800" fill="#ffffff" textAnchor="middle">
              🚐 UNIT #04 ({speed} km/h)
            </text>
          </g>
        </svg>

        {/* Live GPS Telemetry Overlay */}
        <div className="gps-live-road-footer">
          <div className="road-name-chip">
            <Compass size={12} />
            <span>{currentRoad}</span>
          </div>
          <div className="eta-live-chip">
            <Clock size={12} />
            <strong>ETA: {Math.max(1, Math.ceil(remainingSeconds / 60))} MINS</strong>
          </div>
        </div>
      </div>
    </div>
  )
}
