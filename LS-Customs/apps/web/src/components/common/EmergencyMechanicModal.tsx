/**
 * EmergencyMechanicModal — high-priority roadside assistance dispatch modal.
 * Features live GPS acquisition, dynamic tactical radar scanning,
 * immediate technician assignment (via Supabase Edge Function assign-mechanic or rapid fallback),
 * real-time countdown timer, and direct emergency hotline dialing.
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
  cost: number
  color: string
}

const EMERGENCY_SCENARIOS: EmergencyScenario[] = [
  {
    id: 'battery',
    label: 'Dead Battery / Jump Start',
    description: 'Rapid battery testing, booster pack jump, or alternator check',
    icon: Zap,
    avgEta: '8 - 12 min',
    cost: 65,
    color: '#eab308',
  },
  {
    id: 'tire',
    label: 'Flat Tire / Blowout',
    description: 'On-site wheel change with your spare or professional plug/patch',
    icon: Disc,
    avgEta: '10 - 15 min',
    cost: 45,
    color: '#38bdf8',
  },
  {
    id: 'engine',
    label: 'Engine Breakdown / Smoke',
    description: 'Diagnostic scanner check, overheating recovery, belt inspection',
    icon: AlertTriangle,
    avgEta: '12 - 18 min',
    cost: 110,
    color: '#ef4444',
  },
  {
    id: 'lockout',
    label: 'Vehicle Lockout',
    description: 'Non-destructive rapid door entry & key retrieval tools',
    icon: Key,
    avgEta: '8 - 12 min',
    cost: 55,
    color: '#a855f7',
  },
  {
    id: 'fuel',
    label: 'Emergency Fuel / Fluids',
    description: 'Delivery of 2-3 gallons fuel or emergency engine coolant',
    icon: Fuel,
    avgEta: '8 - 12 min',
    cost: 40,
    color: '#f97316',
  },
  {
    id: 'towing',
    label: 'Critical Tow / Flatbed',
    description: 'Immediate heavy-duty recovery flatbed dispatch to your location',
    icon: Wrench,
    avgEta: '15 - 22 min',
    cost: 125,
    color: '#ec4899',
  },
]

// Default Los Santos fallback coordinates
const DEFAULT_COORDS = { lat: 34.0522, lng: -118.2437 }
const DEFAULT_LOCATION_LABEL = 'Los Santos Central Highway (Mile Marker 14)'

/** Tactical radar ping sound synthesized with Web Audio API */
function playTacticalBeep(pitch = 880, duration = 0.09) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(pitch, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(pitch * 1.5, ctx.currentTime + duration)
    gain.gain.setValueAtTime(0.04, ctx.currentTime)
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
  const [scanStepMessage, setScanStepMessage] = useState<string>('Broadcasting SOS packet...')
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true)
  const [remainingSeconds, setRemainingSeconds] = useState<number>(600) // 10 minutes default
  const radarIntervalRef = useRef<number | null>(null)

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
          setLocationLabel(`Live GPS: ${newCoords.lat}°N, ${Math.abs(newCoords.lng)}°W (Accuracy ±${Math.round(position.coords.accuracy)}m)`)
          setGpsStatus('locked')
          if (soundEnabled) playTacticalBeep(1200, 0.12)
        },
        () => {
          setGpsStatus('failed')
          setLocationLabel('Downtown Los Santos, Burton Way (Near LS Customs HQ)')
        },
        { timeout: 8000, enableHighAccuracy: true }
      )
    } else {
      setGpsStatus('failed')
      setLocationLabel('Los Santos Metro Area')
    }
  }

  const handleStartDispatch = async () => {
    setIsScanning(true)
    if (soundEnabled) playTacticalBeep(520, 0.1)

    // Radar scan progress steps with sound feedback
    const scanSteps = [
      { msg: 'Connecting to Los Santos Roadside Dispatch Grid...', delay: 700, pitch: 600 },
      { msg: 'Triangulating closest certified mobile mechanics in 5km radius...', delay: 1500, pitch: 750 },
      { msg: 'Locking signal on Rapid Response Unit #04...', delay: 2300, pitch: 950 },
      { msg: 'Dispatched! Unit Marcus Vance accepted emergency route.', delay: 3100, pitch: 1200 },
    ]

    scanSteps.forEach(({ msg, delay, pitch }) => {
      window.setTimeout(() => {
        setScanStepMessage(msg)
        if (soundEnabled) playTacticalBeep(pitch, 0.08)
      }, delay)
    })

    const selectedScenario = EMERGENCY_SCENARIOS.find((s) => s.id === selectedIssueId) || EMERGENCY_SCENARIOS[0]

    // Create real DB booking if user is authenticated
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
            notes: `[EMERGENCY ROADSIDE DISPATCH] Issue: ${selectedScenario.label}. Location: ${locationLabel}. Vehicle: ${vehicleDetails || 'Standard Passenger Vehicle'}. Urgency: Immediate Roadside Assistance`,
            total_price: selectedScenario.cost,
          })
          .select('id')
          .single()

        if (!error && data?.id) {
          bookingId = data.id
          // Attempt edge function automatic assignment
          void supabase.functions.invoke('assign-mechanic', {
            body: { service_booking_id: data.id },
          }).catch(() => {
            // Ignored - fallback mechanics profile still displayed
          })
        }
      } catch {
        // Continue with graceful local reference
      }
    }

    // Complete scan after 3.2 seconds
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
          unit: 'Rapid Unit #04',
          vehicle: 'Ford F-250 Heavy Duty Service Rig',
          phone: '(800) 555-0199',
          rating: 4.96,
          initials: 'MV',
        },
      }

      setActiveDispatch(newDispatch)
      setIsScanning(false)
      onNotify(`🚨 Emergency Mechanic ${newDispatch.mechanic.name} is en route to your location!`)
    }, 3400)
  }

  const handleCancelDispatch = () => {
    if (window.confirm('Are you sure you want to cancel emergency roadside dispatch?')) {
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
      <div className="emergency-modal-dialog" onClick={(e) => e.stopPropagation()}>
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
                24/7 RAPID RESPONSE DISPATCH
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

        {/* ── Active Dispatch Screen ─────────────────────────────── */}
        {activeDispatch ? (
          <div className="emergency-modal-content active-cockpit">
            <div className="active-dispatch-banner">
              <div className="dispatch-radar-pulse">
                <Radio size={24} className="radar-icon-spin" />
              </div>
              <div>
                <span className="dispatch-badge-enroute">UNIT EN ROUTE • EMERGENCY MODE</span>
                <h3>Technician Assigned & In Transit</h3>
                <p className="dispatch-reference">Booking Ref: <strong>{activeDispatch.id}</strong></p>
              </div>
              <div className="eta-countdown-display">
                <span className="eta-label">ESTIMATED ARRIVAL</span>
                <strong className="eta-timer">{formatCountdown(remainingSeconds)}</strong>
                <small className="eta-distance">Approx. 1.8 miles away</small>
              </div>
            </div>

            {/* Stepper Progress */}
            <div className="emergency-progress-track">
              <div className="step-item completed">
                <span className="step-dot"><CheckCircle2 size={13} /></span>
                <span className="step-title">SOS Broadcasted</span>
              </div>
              <div className="step-connector active" />
              <div className="step-item active">
                <span className="step-dot pulse-beacon">2</span>
                <span className="step-title">Unit En Route</span>
              </div>
              <div className="step-connector" />
              <div className="step-item pending">
                <span className="step-dot">3</span>
                <span className="step-title">On Scene Help</span>
              </div>
            </div>

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
                </div>
                <p className="mechanic-unit-tag">{activeDispatch.mechanic.unit} • {activeDispatch.mechanic.vehicle}</p>
                <div className="mechanic-detail-chips">
                  <span>📍 GPS Destination: {activeDispatch.locationLabel}</span>
                  <span>🔧 Service: {activeDispatch.issueLabel}</span>
                </div>
              </div>
              <div className="mechanic-call-action">
                <a
                  href={`tel:${activeDispatch.mechanic.phone}`}
                  className="button emergency-call-tech-btn"
                  onClick={() => onNotify('Calling emergency roadside dispatch...')}
                >
                  <PhoneCall size={16} />
                  <span>Call Driver</span>
                </a>
              </div>
            </div>

            {/* Roadside Safety Protocol */}
            <div className="roadside-safety-box">
              <div className="safety-title">
                <AlertTriangle size={16} />
                <strong>Driver Safety Checklist:</strong>
              </div>
              <ul>
                <li>Keep hazard lights on at all times.</li>
                <li>Stay inside the vehicle with seatbelts on if stopped on a high-speed highway.</li>
                <li>The response vehicle will approach with amber strobe lights flashing.</li>
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
                View in Workspace Bookings
              </button>
              <button
                type="button"
                className="button cancel-emergency-btn"
                onClick={handleCancelDispatch}
              >
                Cancel Emergency Call
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
          /* ── Triage & SOS Request Form ──────────────────────────── */
          <div className="emergency-modal-content">
            {/* GPS Banner */}
            <div className="emergency-gps-strip">
              <div className="gps-indicator-group">
                <span className={`gps-status-dot ${gpsStatus}`} />
                <div>
                  <strong>Roadside GPS Location:</strong>
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
                {gpsStatus === 'locating' ? 'Acquiring...' : 'Re-scan GPS'}
              </button>
            </div>

            {/* Scenario Selection */}
            <div className="emergency-section-title">
              <span>1</span> SELECT EMERGENCY ISSUE:
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
                      if (soundEnabled) playTacticalBeep(700, 0.05)
                    }}
                  >
                    <div className="scenario-icon" style={{ color: sc.color, background: `${sc.color}22` }}>
                      <IconComponent size={20} />
                    </div>
                    <div className="scenario-info">
                      <h4>{sc.label}</h4>
                      <p>{sc.description}</p>
                    </div>
                    <div className="scenario-meta">
                      <span className="scenario-eta"><Clock size={11} /> {sc.avgEta}</span>
                      <strong className="scenario-price">${sc.cost}</strong>
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
                  placeholder="e.g. 2023 Black Ford Mustang, hazard lights on, near exit 14B"
                  value={vehicleDetails}
                  onChange={(e) => setVehicleDetails(e.target.value)}
                />
              </div>
            </div>

            {/* Dispatch Button */}
            <div className="emergency-submit-footer">
              <div className="emergency-pricing-preview">
                <span>Estimated Emergency Fee:</span>
                <strong>${selectedScenario.cost}.00</strong>
                <small>No pre-payment required for emergency roadside dispatch</small>
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
                <span>Or dial direct 24/7 hotline:</span>
                <a href="tel:18005550199" className="tollfree-link">
                  <PhoneCall size={14} /> 1-800-555-0199 (Toll-Free)
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
