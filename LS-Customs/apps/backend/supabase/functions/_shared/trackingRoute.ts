export interface RouteConfig { geoapifyKey?: string; osrmBase?: string; osrmKey?: string; mode?: string }
export function routeRequest(config: RouteConfig, origin: [number, number], destination: [number, number]): { url: URL; headers: Record<string, string>; provider: 'geoapify' | 'osrm' } {
  if (config.geoapifyKey) {
    const url = new URL('https://api.geoapify.com/v1/routing')
    url.searchParams.set('waypoints', `${origin[1]},${origin[0]}|${destination[1]},${destination[0]}`)
    url.searchParams.set('mode', config.mode === 'drive' ? 'drive' : 'motorcycle')
    url.searchParams.set('units', 'metric')
    url.searchParams.set('traffic', 'free_flow')
    url.searchParams.set('apiKey', config.geoapifyKey)
    return { url, headers: {}, provider: 'geoapify' as const }
  }
  if (!config.osrmBase) throw new Error('Routing is not configured')
  const url = new URL(`${config.osrmBase.replace(/\/$/, '')}/route/v1/driving/${origin.join(',')};${destination.join(',')}`)
  if (url.protocol !== 'https:') throw new Error('Routing endpoint requires HTTPS')
  url.search = 'overview=full&geometries=geojson&alternatives=false'
  return { url, headers: config.osrmKey ? { Authorization: `Bearer ${config.osrmKey}` } : {}, provider: 'osrm' as const }
}

export function parseTrackingRoute(body: any, provider: 'geoapify' | 'osrm') {
  let duration: number, distance: number, geometry: any
  if (provider === 'geoapify') {
    const feature = body.features?.[0]
    duration = feature?.properties?.time
    distance = feature?.properties?.distance
    geometry = feature?.geometry
    if (geometry?.type === 'MultiLineString' && Array.isArray(geometry.coordinates)) geometry = { type: 'LineString', coordinates: geometry.coordinates.flat() }
  } else {
    if (body.code !== 'Ok') throw new Error('Routing failed')
    const route = body.routes?.[0]
    duration = route?.duration; distance = route?.distance; geometry = route?.geometry
  }
  if (!Number.isFinite(duration) || duration < 0 || !Number.isFinite(distance) || distance < 0 || geometry?.type !== 'LineString'
    || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2 || geometry.coordinates.length > 20_000
    || !geometry.coordinates.every((p: number[]) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)) throw new Error('Invalid route')
  return { geometry, durationSeconds: duration, distanceMeters: distance, provider }
}
