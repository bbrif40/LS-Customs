/**
 * StepLocation — pick where the mechanic should arrive.
 * Defaults to the customer's saved address from useProfile; the user
 * can also type a one-off address for this booking.
 */
import { useState, useEffect } from 'react'
import { ChevronLeft, MapPin } from 'lucide-react'
import { LocationPicker } from '../../common/map'
import type { ChosenAddress } from './MechanicBookingFlow'

interface DefaultAddress {
  id: string
  line1: string
  city: string
  label: string | null
}

interface StepLocationProps {
  defaultAddress: DefaultAddress | null
  loading: boolean
  value: ChosenAddress | null
  onChange: (addr: ChosenAddress) => void
  onBack: () => void
  onNext: () => void
}

type Mode = 'default' | 'custom'

export function StepLocation({
  defaultAddress,
  loading,
  value,
  onChange,
  onBack,
  onNext,
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

  // When the value is cleared upstream, reset our local form.
  useEffect(() => {
    if (value === null) {
      setLine1('')
      setCity('')
      setPin(null)
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
      onChange({
        id: defaultAddress.id,
        line1: defaultAddress.line1,
        city: defaultAddress.city,
        label: defaultAddress.label ?? undefined,
        source: 'default',
      })
    }
  }

  function pickCustom() {
    setMode('custom')
    emitCustom()
  }

  function commitCustom() {
    emitCustom()
  }

  function handlePinChange(pos: { lat: number; lng: number }) {
    setPin(pos)
    // Commit immediately so the parent's ChosenAddress stays in sync.
    if (line1.trim() && city.trim()) {
      onChange({
        line1: line1.trim(),
        city: city.trim(),
        source: 'custom',
        pin_lat: pos.lat,
        pin_lng: pos.lng,
      })
    }
  }

  const canProceed = value !== null && (value.line1.trim() !== '' && value.city.trim() !== '')

  return (
    <section className="step-panel">
      <header className="step-panel-head">
        <button type="button" className="text-button step-back" onClick={onBack}>
          <ChevronLeft size={15} /> Back
        </button>
        <p className="eyebrow">STEP 4 OF 5</p>
        <h2>Where should we send the mechanic?</h2>
        <p className="muted">Use your saved address or enter a one-off location for this booking.</p>
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
              <p>Enter a one-off address for this service only.</p>
            </div>
            <span className="location-option-check" aria-hidden="true" />
          </button>

          {mode === 'custom' && (
            <div className="address-fields">
              <label>
                <span>Street address</span>
                <input
                  type="text"
                  value={line1}
                  placeholder="123 Main St"
                  onChange={(e) => setLine1(e.target.value)}
                  onBlur={commitCustom}
                />
              </label>
              <label>
                <span>City</span>
                <input
                  type="text"
                  value={city}
                  placeholder="Los Santos"
                  onChange={(e) => setCity(e.target.value)}
                  onBlur={commitCustom}
                />
              </label>
              <p className="form-helper">
                We don't save custom addresses to your profile.
              </p>
              <LocationPicker
                value={pin}
                onChange={handlePinChange}
                height={340}
              />
              <p className="form-helper">
                Drag the pin to drop your exact location. We'll send the mechanic here.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="step-actions">
        <button type="button" className="button dark-button" disabled={!canProceed} onClick={onNext}>
          Continue
        </button>
      </div>
    </section>
  )
}
