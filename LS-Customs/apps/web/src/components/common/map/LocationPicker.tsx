/**
 * LocationPicker — draggable-pin map for picking an exact location.
 *
 * Used by the mechanic booking flow's StepLocation to let customers
 * drop a pin alongside typing a street address. The selected position
 * is emitted upward via `onChange` whenever the pin is dragged, the
 * map is clicked, or "Use my current location" is tapped.
 */
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import {
  MapPin,
  RotateCcw,
  Crosshair,
  Search,
  Sparkles,
  Navigation,
  Loader2,
  X,
} from 'lucide-react'
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

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<{ line1: string; city: string }> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
      {
        signal: controller.signal,
        headers: {
          'Accept-Language': 'en',
        },
      },
    )
    clearTimeout(timeout)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const addr = data.address || {}
    const road =
      addr.road ||
      addr.street ||
      addr.pedestrian ||
      addr.suburb ||
      addr.neighbourhood ||
      addr.residential ||
      ''
    const houseNumber = addr.house_number ? `${addr.house_number} ` : ''
    const line1 = road ? `${houseNumber}${road}` : `Location near ${lat.toFixed(4)}, ${lng.toFixed(4)}`
    const city =
      addr.city ||
      addr.town ||
      addr.municipality ||
      addr.county ||
      addr.state ||
      'Metro Manila'
    return { line1, city }
  } catch {
    return {
      line1: `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      city: 'Metro Manila',
    }
  }
}

export interface AreaSuggestion {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  line1: string
  city: string
}

export const POPULAR_AREAS: AreaSuggestion[] = [
  {
    id: 'pop-bgc',
    name: 'Bonifacio Global City (BGC)',
    address: 'Taguig, Metro Manila',
    lat: 14.5507,
    lng: 121.0503,
    line1: 'Bonifacio Global City',
    city: 'Taguig',
  },
  {
    id: 'pop-makati',
    name: 'Makati Central Business District',
    address: 'Ayala Ave, Makati, Metro Manila',
    lat: 14.5547,
    lng: 121.0244,
    line1: 'Ayala Avenue',
    city: 'Makati',
  },
  {
    id: 'pop-ortigas',
    name: 'Ortigas Center',
    address: 'Pasig / Mandaluyong, Metro Manila',
    lat: 14.5866,
    lng: 121.0617,
    line1: 'Ortigas Center',
    city: 'Pasig',
  },
  {
    id: 'pop-qc',
    name: 'Quezon Memorial Circle / North EDSA',
    address: 'Quezon City, Metro Manila',
    lat: 14.6508,
    lng: 121.0494,
    line1: 'Elliptical Road',
    city: 'Quezon City',
  },
  {
    id: 'pop-valenzuela',
    name: 'Valenzuela City Center',
    address: 'Valenzuela, Metro Manila',
    lat: 14.7011,
    lng: 120.983,
    line1: 'MacArthur Highway',
    city: 'Valenzuela',
  },
  {
    id: 'pop-alabang',
    name: 'Alabang Town Center / Filinvest',
    address: 'Muntinlupa, Metro Manila',
    lat: 14.4222,
    lng: 121.0315,
    line1: 'Alabang-Zapote Road',
    city: 'Muntinlupa',
  },
]

export async function searchAreas(query: string): Promise<AreaSuggestion[]> {
  const trimmed = query.trim()
  if (!trimmed || trimmed.length < 2) return []

  // 1. Try Photon autocomplete API
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3500)
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed)}&limit=6&lat=14.5995&lon=120.9842`
    const res = await fetch(photonUrl, { signal: controller.signal })
    clearTimeout(timeout)
    if (res.ok) {
      const data = await res.json()
      if (data.features && data.features.length > 0) {
        return data.features.map((f: any, idx: number) => {
          const p = f.properties || {}
          const [lng, lat] = f.geometry.coordinates
          const name = p.name || p.street || trimmed
          const parts = [p.street, p.district, p.city, p.state, p.country].filter(Boolean)
          const address = parts.length > 0 ? parts.join(', ') : (p.name || 'Philippines')
          const line1 = p.street
            ? p.housenumber
              ? `${p.housenumber} ${p.street}`
              : p.street
            : p.name || name
          const city = p.city || p.town || p.district || p.state || 'Metro Manila'
          return {
            id: `photon-${idx}-${lat}-${lng}`,
            name,
            address,
            lat: Number(lat),
            lng: Number(lng),
            line1,
            city,
          }
        })
      }
    }
  } catch {
    // Continue to fallback
  }

  // 2. Fallback to Nominatim search API
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3500)
    const nomUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(trimmed)}&countrycodes=ph&limit=6&addressdetails=1`
    const res = await fetch(nomUrl, {
      signal: controller.signal,
      headers: { 'Accept-Language': 'en' },
    })
    clearTimeout(timeout)
    if (res.ok) {
      const data = await res.json()
      return (data || []).map((item: any, idx: number) => {
        const addr = item.address || {}
        const name = item.name || addr.road || addr.suburb || item.display_name.split(',')[0]
        const line1 = addr.road
          ? addr.house_number
            ? `${addr.house_number} ${addr.road}`
            : addr.road
          : name
        const city = addr.city || addr.town || addr.municipality || addr.state || 'Metro Manila'
        return {
          id: `nom-${idx}-${item.place_id || item.osm_id || idx}`,
          name,
          address: item.display_name,
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          line1,
          city,
        }
      })
    }
  } catch {
    // Both failed
  }

  return []
}

export interface LocationPickerProps {
  value?: { lat: number; lng: number } | null
  onChange: (pos: { lat: number; lng: number }) => void
  onAddressResolved?: (
    addr: { line1: string; city: string },
    coords?: { lat: number; lng: number },
  ) => void
  /** Default center if geolocation is denied. Defaults to Los Santos. */
  fallbackCenter?: { lat: number; lng: number }
  /** Default 340 (px). */
  height?: number | string
  /** Optional fixed id; useful when multiple pickers share a key namespace. */
  id?: string
}

const DEFAULT_CENTER = { lat: 14.5995, lng: 120.9842 } // Metro Manila HQ

export function LocationPicker({
  value,
  onChange,
  onAddressResolved,
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

  // Search & Predictive Suggestions State
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState<AreaSuggestion[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  // Sync internal pin state whenever value prop updates from outside
  useEffect(() => {
    if (value && (!pin || pin.lat !== value.lat || pin.lng !== value.lng)) {
      setPin(value)
    }
  }, [value])

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Predictive search query with 280ms debounce
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSuggestions([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    const timer = setTimeout(async () => {
      const results = await searchAreas(searchQuery)
      setSuggestions(results)
      setIsSearching(false)
    }, 280)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // On mount, try to geolocate if no value yet. Best-effort; if denied, keep fallback.
  useEffect(() => {
    if (pin) return
    if (!navigator.geolocation) return
    setBusy(true)
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const pos = { lat: coords.latitude, lng: coords.longitude }
        setPin(pos)
        onChange(pos)
        if (onAddressResolved) {
          const resolved = await reverseGeocode(pos.lat, pos.lng)
          onAddressResolved(resolved, pos)
        }
        setBusy(false)
      },
      () => setBusy(false),
      { enableHighAccuracy: true, timeout: 8000 },
    )
    // run once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleMapClick = useCallback(
    async (pos: { lat: number; lng: number }) => {
      setPin(pos)
      onChange(pos)
      if (onAddressResolved) {
        const resolved = await reverseGeocode(pos.lat, pos.lng)
        onAddressResolved(resolved, pos)
      }
    },
    [onChange, onAddressResolved],
  )

  const handlePinChange = useCallback(
    async (pos: { lat: number; lng: number }) => {
      setPin(pos)
      onChange(pos)
      if (onAddressResolved) {
        const resolved = await reverseGeocode(pos.lat, pos.lng)
        onAddressResolved(resolved, pos)
      }
    },
    [onChange, onAddressResolved],
  )

  const selectSuggestion = (item: AreaSuggestion) => {
    const pos = { lat: item.lat, lng: item.lng }
    setPin(pos)
    onChange(pos)
    if (onAddressResolved) {
      onAddressResolved({ line1: item.line1, city: item.city }, pos)
    }
    setSearchQuery(item.name)
    setShowSuggestions(false)
  }

  const useCurrent = () => {
    if (!navigator.geolocation) return
    setBusy(true)
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const pos = { lat: coords.latitude, lng: coords.longitude }
        setPin(pos)
        onChange(pos)
        if (onAddressResolved) {
          const resolved = await reverseGeocode(pos.lat, pos.lng)
          onAddressResolved(resolved, pos)
        }
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
    setSearchQuery('')
    setShowSuggestions(false)
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
      {/* Interactive Map Search Bar with Predictive Suggestions */}
      <div className="map-search-bar-container" ref={searchContainerRef}>
        <div className={`map-search-input-wrap ${isSearching ? 'is-searching' : ''}`}>
          <Search size={15} className="map-search-icon" />
          <input
            type="text"
            className="map-search-input"
            placeholder="Search area, street, or landmark (e.g. Quezon City, BGC, Valenzuela)..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setShowSuggestions(true)
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const top = suggestions[0] ?? POPULAR_AREAS[0]
                if (top) selectSuggestion(top)
              } else if (e.key === 'Escape') {
                setShowSuggestions(false)
              }
            }}
          />
          {isSearching && <Loader2 size={14} className="map-search-spinner spin" />}
          {searchQuery && !isSearching && (
            <button
              type="button"
              className="map-search-clear-btn"
              onClick={() => {
                setSearchQuery('')
                setSuggestions([])
              }}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Predictive Suggestions Dropdown */}
        {showSuggestions && (
          <div className="map-suggestions-dropdown">
            {suggestions.length > 0 ? (
              <>
                <div className="suggestions-header">
                  <Sparkles size={12} /> Matching Locations
                </div>
                {suggestions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="suggestion-item"
                    onClick={() => selectSuggestion(item)}
                  >
                    <MapPin size={15} className="suggestion-icon" />
                    <div className="suggestion-text">
                      <strong className="suggestion-name">{item.name}</strong>
                      <span className="suggestion-address">{item.address}</span>
                    </div>
                  </button>
                ))}
              </>
            ) : searchQuery.trim().length >= 2 && !isSearching ? (
              <div className="suggestions-empty">
                No places found matching "{searchQuery}". Try a major avenue or district.
              </div>
            ) : (
              <>
                <div className="suggestions-header">
                  <Navigation size={12} /> Popular Areas in Metro Manila
                </div>
                {POPULAR_AREAS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="suggestion-item"
                    onClick={() => selectSuggestion(item)}
                  >
                    <MapPin size={15} className="suggestion-icon popular" />
                    <div className="suggestion-text">
                      <strong className="suggestion-name">{item.name}</strong>
                      <span className="suggestion-address">{item.address}</span>
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Map Toolbar */}
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
