/**
 * StepLocation — pick where the mechanic should arrive.
 * Defaults to the customer's saved address from useProfile; the user
 * can also type a one-off address for this booking.
 */
import { useState, useEffect } from 'react'
import { ChevronLeft, MapPin } from 'lucide-react'
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

  // When the value is cleared upstream, reset our local form.
  useEffect(() => {
    if (value === null) {
      setLine1('')
      setCity('')
    }
  }, [value])

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
    // Only commit if both fields are filled.
    if (line1.trim() && city.trim()) {
      onChange({ line1: line1.trim(), city: city.trim(), source: 'custom' })
    }
  }

  function commitCustom() {
    if (line1.trim() && city.trim()) {
      onChange({ line1: line1.trim(), city: city.trim(), source: 'custom' })
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
