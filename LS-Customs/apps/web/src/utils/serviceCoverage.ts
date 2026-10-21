export interface ServiceCoverage { center_lat: number; center_lng: number; radius_km: number; active: boolean }
/** Geodesic ring in GeoJSON longitude/latitude order, matching SQL's 6371 km earth. */
export function coverageRing(coverage: ServiceCoverage): [number, number][] {
  const radians = Math.PI / 180
  const lat = coverage.center_lat * radians, lng = coverage.center_lng * radians
  const distance = Number(coverage.radius_km) / 6371
  return Array.from({ length: 65 }, (_, index) => {
    const bearing = (index % 64) / 64 * Math.PI * 2
    const nextLat = Math.asin(Math.sin(lat) * Math.cos(distance) + Math.cos(lat) * Math.sin(distance) * Math.cos(bearing))
    const nextLng = lng + Math.atan2(Math.sin(bearing) * Math.sin(distance) * Math.cos(lat), Math.cos(distance) - Math.sin(lat) * Math.sin(nextLat))
    return [nextLng / radians, nextLat / radians]
  })
}
