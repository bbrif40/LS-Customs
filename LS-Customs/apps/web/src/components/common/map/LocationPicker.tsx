/**
 * LocationPicker — draggable-pin map for picking an exact location.
 *
 * Used by the mechanic booking flow's StepLocation to let customers
 * drop a pin alongside typing a street address. The selected position
 * is emitted upward via `onChange` whenever the pin is dragged, the
 * map is clicked, or "Use my current location" is tapped.
 */
import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { MapPin, RotateCcw, Crosshair } from 'lucide-react'
import { MapBoundary } from './MapBoundary'
import type { MapSurfacePin } from './lazyMap'

const MapSurface = lazy(() =>
  import('./lazyMap').catch((err) => {
    // Surface lazy-load failures loudly so they don't manifest as a white page.
    // eslint-disable-next-line no-console
    console.error('[LocationPicker] failed to load map chunk:', err)
    throw err
  }),
)

export interface LocationPickerProps {
  value?: { lat: number; lng: number } | null
  onChange: (pos: { lat: number; lng: number }) => void
  /** Default center if geolocation is denied. Defaults to Los Santos. */
  fallbackCenter?: { lat: number; lng: number }
  /** Default 340 (px). */
  height?: number | string
  /** Optional fixed id; useful when multiple pickers share a key namespace. */
  id?: string
}

const DEFAULT_CENTER = { lat: 34.0522, lng: -118.2437 } // Los Santos

export function LocationPicker({
  value,
  onChange,
  fallbackCenter = DEFAULT_CENTER,
  height = 340,
  id = 'loc',
}: LocationPickerProps) {
  // Local pin state. Initialized from value, then re-centered by the
  // map on mount. Keeping it in state lets the "Reset" button work.
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
    value ?? null,
  )
  const [busy, setBusy] = useState(false)

  // On mount, try to geolocate. Best-effort; if denied, keep fallback.
  useEffect(() => {
    if (pin) return
    if (!navigator.geolocation) return
    setBusy(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const pos = { lat: coords.latitude, lng: coords.longitude }
        setPin(pos)
        onChange(pos)
        setBusy(false)
      },
      () => setBusy(false),
      { enableHighAccuracy: false, timeout: 6000 },
    )
    // run once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleMapClick = useCallback(
    (pos: { lat: number; lng: number }) => {
      setPin(pos)
      onChange(pos)
    },
    [onChange],
  )

  const handlePinChange = useCallback(
    (pos: { lat: number; lng: number }) => {
      setPin(pos)
      onChange(pos)
    },
    [onChange],
  )

  const useCurrent = () => {
    if (!navigator.geolocation) return
    setBusy(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const pos = { lat: coords.latitude, lng: coords.longitude }
        setPin(pos)
        onChange(pos)
        setBusy(false)
      },
      () => setBusy(false),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const reset = () => {
    const target = value ?? fallbackCenter
    setPin(target)
    onChange(target)
  }

  const center: [number, number] = pin
    ? [pin.lat, pin.lng]
    : value
      ? [value.lat, value.lng]
      : [fallbackCenter.lat, fallbackCenter.lng]

  // Render the picker as a single draggable pin (read-only pins array stays empty).
  const pins: MapSurfacePin[] = []
  const pinPayload = pin ?? value ?? { lat: fallbackCenter.lat, lng: fallbackCenter.lng }

  return (
    <div className="location-picker" data-picker-id={id}>
      <div className="location-picker-toolbar">
        <button
          type="button"
          className="location-picker-btn"
          onClick={useCurrent}
          disabled={busy}
        >
          <Crosshair size={14} /> {busy ? 'Locating…' : 'Use my current location'}
        </button>
        <button type="button" className="location-picker-btn" onClick={reset}>
          <RotateCcw size={14} /> Reset
        </button>
        {pin && (
          <span className="location-picker-coords">
            <MapPin size={12} /> {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
          </span>
        )}
      </div>
      <Suspense fallback={<div className="map-skeleton" style={{ height }}>Loading map…</div>}>
        <MapBoundary height={height}>
          <MapSurface
            center={center}
            zoom={14}
            pins={pins}
            draggablePin={pinPayload}
            onPinChange={handlePinChange}
            onMapClick={handleMapClick}
            height={height}
          />
        </MapBoundary>
      </Suspense>
    </div>
  )
}
