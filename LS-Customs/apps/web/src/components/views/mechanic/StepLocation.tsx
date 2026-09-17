/**
 * StepLocation — pick where the mechanic should arrive.
 * Defaults to the customer's saved address from useProfile; the user
 * can also type a one-off address for this booking.
 * Displays live distance estimation from the nearest assigned mobile mechanic
 * and calculates the travel fee (every 5km is 85 pesos).
 */
import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, MapPin, Crosshair, CheckCircle2, Loader2 } from 'lucide-react'
import { LocationPicker } from '../../common/map'
import { reverseGeocode } from '../../common/map/LocationPicker'
import type { ChosenAddress } from './MechanicBookingFlow'
import type { DefaultAddress } from '../../../hooks/useProfile'
import type { DispatchMechanic } from '../../../hooks/useMechanicDistance'
import type { Service } from '../../../types'

interface StepLocationProps {
  defaultAddress: DefaultAddress | null
  loading: boolean
  value: ChosenAddress | null
  onChange: (addr: ChosenAddress) => void
  onBack: () => void
  onNext: () => void
  assignedMechanic?: DispatchMechanic | null
  distanceKm?: number
  distanceFeePesos?: number
  formattedDistanceFee?: string
  service?: Service | null
}

type Mode = 'default' | 'custom'

export function StepLocation({
  defaultAddress,
  loading,
  value,
  onChange,
  onBack,
  onNext,
  assignedMechanic,
  distanceKm = 0,
  distanceFeePesos = 85,
  formattedDistanceFee = '₱85.00',
  service,
}: StepLocationProps) {
  // If the user has no default address, force the custom input.
  const initialMode: Mode =
    value?.source ?? (defaultAddress ? 'default' : 'custom')

  const [mode, setMode] = useState<Mode>(initialMode)
  const [line1, setLine1] = useState(value?.source === 'custom' ? value.line1 : '')
  const [city, setCity] = useState(value?.source === 'custom' ? value.city : '')
  // Local pin state. Mirrors value.pin_lat/pin_lng so the picker renders immediately,
  // and so the "Reset" button on the picker has somewhere to read.
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
    value?.pin_lat != null && value?.pin_lng != null
      ? { lat: value.pin_lat, lng: value.pin_lng }
      : null,
  )
  const [isLocating, setIsLocating] = useState(false)
  const [autoDetected, setAutoDetected] = useState(false)

  // Auto-detect current GPS location and reverse geocode address
  const detectLocation = useCallback(async () => {
    if (!navigator.geolocation) return
    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const pos = { lat: coords.latitude, lng: coords.longitude }
        setPin(pos)
        const resolved = await reverseGeocode(pos.lat, pos.lng)
        setLine1(resolved.line1)
        setCity(resolved.city)
        setAutoDetected(true)
        setIsLocating(false)
        onChange({
          line1: resolved.line1,
          city: resolved.city,
          source: 'custom',
          pin_lat: pos.lat,
          pin_lng: pos.lng,
        })
      },
      () => {
        setIsLocating(false)
      },
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }, [onChange])

  // Automatically trigger location detection on mount if no address is set yet
  useEffect(() => {
    if (!value || (!value.line1 && !value.pin_lat)) {
      if (!defaultAddress) {
        void detectLocation()
      }
    }
  }, [defaultAddress, detectLocation, value])

  // When the value is cleared upstream, reset our local form.
  useEffect(() => {
    if (value === null) {
      setLine1('')
      setCity('')
      setPin(null)
      setAutoDetected(false)
    }
  }, [value])

  // Emit a complete custom address object (text + pin) upward.
  function emitCustom(nextPin?: { lat: number; lng: number } | null) {
    if (!line1.trim() || !city.trim()) return
    const lat = nextPin ? nextPin.lat : pin?.lat ?? null
    const lng = nextPin ? nextPin.lng : pin?.lng ?? null
    onChange({
      line1: line1.trim(),
      city: city.trim(),
      source: 'custom',
      pin_lat: lat,
      pin_lng: lng,
    })
  }

  function pickDefault() {
    setMode('default')
    if (defaultAddress) {
      const lat = defaultAddress.lat && defaultAddress.lat !== 0 ? defaultAddress.lat : 14.5995
      const lng = defaultAddress.lng && defaultAddress.lng !== 0 ? defaultAddress.lng : 120.9842
      onChange({
        id: defaultAddress.id,
        line1: defaultAddress.line1,
        city: defaultAddress.city,
        label: defaultAddress.label ?? undefined,
        source: 'default',
        pin_lat: lat,
        pin_lng: lng,
      })
    }
  }

  function pickCustom() {
    setMode('custom')
    if (!line1 && !pin) {
      void detectLocation()
    } else {
      emitCustom()
    }
  }

  function commitCustom() {
    emitCustom()
  }

  async function handlePinChange(pos: { lat: number; lng: number }) {
    setPin(pos)
    // If the address was automatically detected or fields are empty, reverse-geocode to keep address in sync
    if (autoDetected || !line1.trim()) {
      const resolved = await reverseGeocode(pos.lat, pos.lng)
      setLine1(resolved.line1)
      setCity(resolved.city)
      setAutoDetected(true)
      onChange({
        line1: resolved.line1,
        city: resolved.city,
        source: 'custom',
        pin_lat: pos.lat,
        pin_lng: pos.lng,
      })
    } else {
      onChange({
        line1: line1.trim(),
        city: city.trim() || 'Metro Manila',
        source: 'custom',
        pin_lat: pos.lat,
        pin_lng: pos.lng,
      })
    }
  }

  function handleAddressResolved(
    resolved: { line1: string; city: string },
    coords?: { lat: number; lng: number },
  ) {
    setLine1(resolved.line1)
    setCity(resolved.city)
    setAutoDetected(true)
    const effectivePin = coords ?? pin
    if (effectivePin) {
      setPin(effectivePin)
      onChange({
        line1: resolved.line1,
        city: resolved.city,
        source: 'custom',
        pin_lat: effectivePin.lat,
        pin_lng: effectivePin.lng,
      })
    }
  }

  const canProceed = value !== null && (value.line1.trim() !== '' && value.city.trim() !== '')
  const basePriceNum = service?.priceCents != null ? service.priceCents / 100 : 0
  const estimatedTotalNum = basePriceNum + distanceFeePesos

  return (
    <section className="step-panel">
      <header className="step-panel-head">
        <button type="button" className="text-button step-back" onClick={onBack}>
          <ChevronLeft size={15} /> Back
        </button>
        <p className="eyebrow">STEP 4 OF 5</p>
        <h2>Where should we send the mechanic?</h2>
        <p className="muted">Use your saved address or drop a pin. Distance travel fee is ₱85 per 5km.</p>
      </header>

      {loading ? (
        <p className="muted" style={{ padding: '24px 0' }}>Loading your address…</p>
      ) : (
        <div className="location-options">
          {defaultAddress && (
            <button
              type="button"
              className={`location-option ${mode === 'default' ? 'selected' : ''}`}
              onClick={pickDefault}
            >
              <div className="location-option-icon">
                <MapPin size={18} />
              </div>
              <div className="location-option-copy">
                <strong>{defaultAddress.label ?? 'Default address'}</strong>
                <p>
                  {defaultAddress.line1}, {defaultAddress.city}
                </p>
              </div>
              <span className="location-option-check" aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            className={`location-option ${mode === 'custom' ? 'selected' : ''}`}
            onClick={pickCustom}
          >
            <div className="location-option-icon">
              <MapPin size={18} />
            </div>
            <div className="location-option-copy">
              <strong>Use a different address</strong>
              <p>Enter a one-off address or drop a pin on the map.</p>
            </div>
            <span className="location-option-check" aria-hidden="true" />
          </button>

          {mode === 'custom' && (
            <div className="address-fields">
              <div className="gps-auto-detect-header">
                {isLocating ? (
                  <span className="gps-status-pill locating">
                    <Loader2 size={13} className="spin" /> Detecting current location via GPS…
                  </span>
                ) : autoDetected ? (
                  <span className="gps-status-pill detected">
                    <CheckCircle2 size={13} /> Current GPS location detected automatically
                  </span>
                ) : (
                  <button
                    type="button"
                    className="gps-detect-btn"
                    onClick={() => void detectLocation()}
                  >
                    <Crosshair size={13} /> Auto-detect my location
                  </button>
                )}
              </div>

              <label>
                <span>Street address</span>
                <input
                  type="text"
                  value={line1}
                  placeholder="Enter street or landmark"
                  onChange={(e) => {
                    setLine1(e.target.value)
                    setAutoDetected(false)
                  }}
                  onBlur={commitCustom}
                />
              </label>
              <label>
                <span>City</span>
                <input
                  type="text"
                  value={city}
                  placeholder="Metro Manila"
                  onChange={(e) => {
                    setCity(e.target.value)
                    setAutoDetected(false)
                  }}
                  onBlur={commitCustom}
                />
              </label>
              <p className="form-helper">
                We don't save custom addresses to your profile.
              </p>
              <LocationPicker
                value={pin}
                onChange={handlePinChange}
                onAddressResolved={handleAddressResolved}
                height={340}
              />
              <p className="form-helper">
                Drag the pin to drop your exact location. Distance fee updates in real-time.
              </p>
            </div>
          )}

          {/* Live Driver Distance & Travel Fee Preview Card */}
          {assignedMechanic && (
            <div className="driver-distance-card">
              <div className="driver-distance-badge-row">
                <span className="driver-pill">
                  <span className="live-dot" /> Live Distance Estimation
                </span>
                <span className="rate-badge">Rate: ₱85 per 5km</span>
              </div>

              <div className="driver-info-row">
                <div className="driver-avatar-circle">
                  {assignedMechanic.full_name.charAt(0)}
                </div>
                <div className="driver-info-meta">
                  <strong>Assigned Driver: {assignedMechanic.full_name}</strong>
                  <p>★ {assignedMechanic.rating_avg.toFixed(1)} rating • Fast Roadside Dispatch Unit</p>
                </div>
                <div className="driver-distance-stat">
                  <span>Estimated Distance</span>
                  <strong>{distanceKm > 0 ? `${distanceKm.toFixed(1)} km` : '3.5 km'}</strong>
                </div>
              </div>

              <div className="distance-fee-summary-row">
                <div className="fee-item">
                  <span>Base Service</span>
                  <strong>{service?.price ?? (basePriceNum > 0 ? `₱${basePriceNum.toFixed(2)}` : '—')}</strong>
                </div>
                <div className="fee-divider">+</div>
                <div className="fee-item">
                  <span>Distance Travel Fee</span>
                  <strong className="fee-accent">{formattedDistanceFee}</strong>
                  <small>(every 5km is ₱85)</small>
                </div>
                <div className="fee-divider">=</div>
                <div className="fee-item fee-item-total">
                  <span>Estimated Total Price</span>
                  <strong className="total-highlight">
                    ₱{estimatedTotalNum.toFixed(2)}
                  </strong>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="step-actions">
        <button type="button" className="button dark-button" disabled={!canProceed} onClick={onNext}>
          Continue to Review
        </button>
      </div>
    </section>
  )
}
