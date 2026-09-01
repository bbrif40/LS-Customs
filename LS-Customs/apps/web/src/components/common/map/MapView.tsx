/**
 * MapView — read-only map that renders N pins.
 *
 * Wraps the lazy MapSurface in a Suspense so Leaflet only ships when
 * a map is actually mounted. Callers can pass any number of pins; the
 * map auto-fits bounds when more than one is present and no explicit
 * center is set. A `MapBoundary` error boundary ensures a runtime error
 * inside the map shows a skeleton instead of white-screening the page.
 */
import { Suspense, lazy } from 'react'
import type { MapSurfacePin } from './lazyMap'
import { MapBoundary } from './MapBoundary'

const MapSurface = lazy(() =>
  import('./lazyMap').catch((err) => {
    // Surface lazy-load failures loudly so they don't manifest as a white page.
    // eslint-disable-next-line no-console
    console.error('[MapView] failed to load map chunk:', err)
    throw err
  }),
)

export interface MapPin {
  id: string
  lat: number
  lng: number
  title?: string
  description?: string
  color?: string
}

export interface MapViewProps {
  pins: MapPin[]
  center?: { lat: number; lng: number }
  /** Default 13. */
  zoom?: number
  /** Default 320 (px). Number = pixels; string = any CSS height. */
  height?: number | string
  className?: string
}

const FALLBACK_CENTER: [number, number] = [34.0522, -118.2437] // Los Santos

export function MapView({
  pins,
  center,
  zoom = 13,
  height = 320,
  className,
}: MapViewProps) {
  const c: [number, number] = center
    ? [center.lat, center.lng]
    : pins[0]
      ? [pins[0].lat, pins[0].lng]
      : FALLBACK_CENTER

  return (
    <div className={className} style={{ width: '100%' }}>
      <MapBoundary height={height}>
        <Suspense fallback={<div className="map-skeleton" style={{ height }}>Loading map…</div>}>
          <MapSurface
            center={c}
            zoom={zoom}
            pins={pins as ReadonlyArray<MapSurfacePin>}
            height={height}
          />
        </Suspense>
      </MapBoundary>
    </div>
  )
}
