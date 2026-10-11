import { useEffect, useRef, useState } from 'react'
import { Map, Marker, Popup, NavigationControl, LngLatBounds, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl'
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

// MapLibre 6 resolves its worker beside the library by default. Vite hashes
// the library chunk, so emit the worker as a real asset and use its URL.
setWorkerUrl(mapWorkerUrl)

export interface MapSurfacePin {
  id: string
  lat: number
  lng: number
  title?: string
  description?: string
  color?: string
  kind?: 'mechanic'
}

export interface MapSurfaceProps {
  center: [number, number]
  zoom: number
  pins: ReadonlyArray<MapSurfacePin>
  draggablePin?: { lat: number; lng: number } | null
  onPinChange?: (pos: { lat: number; lng: number }) => void
  onMapClick?: (pos: { lat: number; lng: number }) => void
  height: number | string
  route?: { type: 'LineString'; coordinates: [number, number][] } | null
  follow?: boolean
  recenterKey?: number
}

const valid = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180

export default function OpenStreetMapSurface(props: MapSurfaceProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const latest = useRef(props)
  latest.current = props
  const [failed, setFailed] = useState(false)
  const markersRef = useRef(new globalThis.Map<string, Marker>())
  const fitted = useRef(false)
  const lastRecenter = useRef(props.recenterKey)

  useEffect(() => {
    if (!container.current) return
    let map: Map
    try {
      const { center, zoom } = latest.current
      map = new Map({
        container: container.current,
        center: valid(...center) ? [center[1], center[0]] : [120.9842, 14.5995],
        zoom,
        style: {
          version: 8,
          sources: {
            osm: {
              type: 'raster',
              tiles: [import.meta.env.VITE_OSM_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              maxzoom: 19,
              attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            },
          },
          layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
        },
      })
    } catch {
      setFailed(true)
      return
    }
    mapRef.current = map
    map.addControl(new NavigationControl(), 'top-right')
    map.on('click', event => latest.current.onMapClick?.({ lat: event.lngLat.lat, lng: event.lngLat.lng }))
    const observer = new ResizeObserver(() => map.resize())
    observer.observe(container.current)
    return () => {
      observer.disconnect()
      mapRef.current = null
      map.remove()
      markersRef.current.clear()
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const present = new Set<string>()
    const frames: number[] = []
    const addMarker = (pin: MapSurfacePin, draggable = false) => {
      if (!valid(pin.lat, pin.lng)) return
      present.add(pin.id)
      const existing = markersRef.current.get(pin.id)
      if (existing) {
        if (draggable || window.matchMedia('(prefers-reduced-motion: reduce)').matches) existing.setLngLat([pin.lng, pin.lat])
        else {
          const start = existing.getLngLat(), started = performance.now()
          const animate = (time: number) => {
            const t = Math.min(1, (time-started)/800)
            existing.setLngLat([start.lng+(pin.lng-start.lng)*t, start.lat+(pin.lat-start.lat)*t])
            if (t < 1) frames.push(requestAnimationFrame(animate))
          }
          frames.push(requestAnimationFrame(animate))
        }
        return
      }
      let entity: HTMLDivElement | undefined
      if (pin.kind === 'mechanic') {
        entity = document.createElement('div')
        entity.className = 'virtual-mechanic-marker'
        entity.textContent = '🛵'
        entity.setAttribute('aria-label', 'Virtual mechanic')
      }
      const marker = new Marker({ ...(entity ? { element: entity } : { color: pin.color || '#e8a838' }), draggable }).setLngLat([pin.lng, pin.lat])
      if (pin.title || pin.description) {
        const content = document.createElement('div')
        if (pin.title) {
          const title = document.createElement('strong')
          title.textContent = pin.title
          content.append(title)
        }
        if (pin.description) {
          const description = document.createElement('p')
          description.textContent = pin.description
          content.append(description)
        }
        marker.setPopup(new Popup({ offset: 25 }).setDOMContent(content))
      }
      if (draggable) marker.on('dragend', () => {
        const position = marker.getLngLat()
        latest.current.onPinChange?.({ lat: position.lat, lng: position.lng })
      })
      marker.addTo(map)
      markersRef.current.set(pin.id, marker)
    }
    props.pins.forEach(pin => addMarker(pin))
    if (props.draggablePin) addMarker({ id: 'destination', ...props.draggablePin }, true)
    markersRef.current.forEach((marker, id) => { if (!present.has(id)) { marker.remove(); markersRef.current.delete(id) } })
    return () => frames.forEach(cancelAnimationFrame)
  }, [props.pins, props.draggablePin])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (props.follow === false && fitted.current && props.recenterKey === lastRecenter.current) return
    lastRecenter.current = props.recenterKey
    const pins = props.pins.filter(pin => valid(pin.lat, pin.lng))
    if (pins.length > 1) {
      const bounds = new LngLatBounds()
      pins.forEach(pin => bounds.extend([pin.lng, pin.lat]))
      map.fitBounds(bounds, { padding: 40, maxZoom: 15, duration: 600 })
    } else if (valid(...props.center)) {
      map.easeTo({ center: [props.center[1], props.center[0]], zoom: props.zoom, duration: 600 })
    }
    fitted.current = true
  }, [props.center[0], props.center[1], props.zoom, props.pins, props.follow, props.recenterKey])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const draw = () => {
      const data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: props.route ? [{ type: 'Feature', properties: {}, geometry: props.route }] : [] }
      const source = map.getSource('arrival-route') as GeoJSONSource | undefined
      if (source) source.setData(data)
      else {
        map.addSource('arrival-route', { type: 'geojson', data })
        map.addLayer({ id: 'arrival-route', type: 'line', source: 'arrival-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#416e5b', 'line-width': 5, 'line-opacity': 0.85 } })
      }
    }
    if (map.isStyleLoaded()) draw()
    else map.once('load', draw)
    return () => { map.off('load', draw) }
  }, [props.route])

  if (failed) return <div className="map-skeleton" style={{ height: props.height }} role="status">Map unavailable. Your device needs WebGL support.</div>
  return <div ref={container} style={{ height: props.height, width: '100%', borderRadius: 8 }} aria-label="OpenStreetMap" />
}
