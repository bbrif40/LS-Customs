/**
 * lazyMap — the single boundary that imports `react-leaflet` and `leaflet`.
 *
 * Leaflet touches `window` at module evaluation time, so importing it
 * from the eager graph breaks Vite on pages that never render a map.
 * This module is loaded via `React.lazy(() => import('./lazyMap'))` so
 * the `react-leaflet` and `leaflet` code only ships when a map is
 * actually mounted. The calling `<MapView>` / `<LocationPicker>` should
 * wrap the lazy import in `<Suspense fallback={<div className="map-skeleton" />}>`
 * to show a placeholder while the chunk downloads.
 */
import { useEffect, useMemo, useState } from 'react'
import type { LatLngExpression } from 'leaflet'

export interface MapSurfacePin {
  id: string
  lat: number
  lng: number
  title?: string
  description?: string
  color?: string
}

export interface MapSurfaceProps {
  center: [number, number]
  zoom: number
  pins: ReadonlyArray<MapSurfacePin>
  /** When set, renders a single draggable pin in addition to (or instead of) the read-only pins. */
  draggablePin?: { lat: number; lng: number } | null
  /** Called when the draggable pin is dropped. */
  onPinChange?: (pos: { lat: number; lng: number }) => void
  /** Called when the user clicks anywhere on the map. */
  onMapClick?: (pos: { lat: number; lng: number }) => void
  height: number | string
}

export default function MapSurface(props: MapSurfaceProps) {
  const { center, zoom, pins, draggablePin, onPinChange, onMapClick, height } = props
  const libs = useLeaflet()

  // While the chunk is loading, render nothing for one frame.
  // The surrounding <Suspense> keeps the skeleton visible.
  if (!libs) return null

  const makeIcon = (color?: string) => {
    const c = color ?? '#e8a838'
    return libs.L.divIcon({
      className: 'map-pin-wrapper',
      html: `<div class="map-pin-marker" style="background:${c}"></div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      popupAnchor: [0, -10],
    })
  }

  const containerKey = useMemo(
    // Depend on the values, not the `center` array reference (new every render).
    () => `m:${center[0].toFixed(3)}:${center[1].toFixed(3)}:${pins.length}:${draggablePin ? 'd' : 's'}`,
    [center[0], center[1], pins.length, draggablePin],
  )

  const { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } = libs.rl

  // Recenter on explicit center change (e.g. "Use my location" button).
  function Recenter({ c }: { c: [number, number] }) {
    const map = useMap()
    useEffect(() => {
      map.setView(c, map.getZoom(), { animate: true })
    }, [c, map])
    return null
  }

  // Auto-fit bounds when more than one pin is passed.
  function FitBounds({ L }: { L: typeof import('leaflet') }) {
    const map = useMap()
    useEffect(() => {
      if (pins.length < 2) return
      const bounds = L.latLngBounds(pins.map((p) => [p.lat, p.lng] as LatLngExpression))
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
    }, [map, pins, L])
    return null
  }

  // Map click → emit new pin position.
  function ClickCatcher() {
    useMapEvents({
      click(e) {
        onMapClick?.({ lat: e.latlng.lat, lng: e.latlng.lng })
      },
    })
    return null
  }

  return (
    <div style={{ height, width: '100%' }}>
      <MapContainer
        key={containerKey}
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%', borderRadius: 8 }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recenter c={center} />
        <FitBounds L={libs.L} />
        {onMapClick && <ClickCatcher />}
        {pins.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={makeIcon(p.color)}>
            {(p.title || p.description) && (
              <Popup>
                {p.title && <strong>{p.title}</strong>}
                {p.description && <p style={{ margin: '4px 0 0', fontSize: 11 }}>{p.description}</p>}
              </Popup>
            )}
          </Marker>
        ))}
        {draggablePin && (
          <Marker
            position={[draggablePin.lat, draggablePin.lng]}
            icon={makeIcon('#e8a838')}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const m = e.target as { getLatLng: () => { lat: number; lng: number } }
                const ll = m.getLatLng()
                onPinChange?.({ lat: ll.lat, lng: ll.lng })
              },
            }}
          />
        )}
      </MapContainer>
    </div>
  )
}

interface LeafletLibs {
  rl: typeof import('react-leaflet')
  L: typeof import('leaflet')
}

let cached: Promise<LeafletLibs> | null = null
function loadLeaflet(): Promise<LeafletLibs> {
  if (!cached) {
    cached = Promise.all([
      import('react-leaflet'),
      import('leaflet'),
    ]).then(([rl, L]) => ({ rl, L }))
  }
  return cached
}

/**
 * Load Leaflet exactly once, on demand. Returns null until the chunk
 * is ready, so the caller renders nothing for a frame. The surrounding
 * <Suspense> (in MapView / LocationPicker) shows the skeleton during
 * that frame. We intentionally do NOT throw here — `React.lazy` is
 * the only thing allowed to throw a promise, and a second throw
 * inside the rendered component would bubble to the error boundary
 * and white-screen the whole admin page.
 */
function useLeaflet(): LeafletLibs | null {
  const [libs, setLibs] = useState<LeafletLibs | null>(null)
  useEffect(() => {
    let cancelled = false
    loadLeaflet().then((l) => {
      if (!cancelled) setLibs(l)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return libs
}
