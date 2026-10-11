export type JourneyPoint = [number, number] // longitude, latitude

export function distanceBetween(a: JourneyPoint, b: JourneyPoint): number {
  const radians = Math.PI / 180
  const h = Math.sin((b[1] - a[1]) * radians / 2) ** 2
    + Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * Math.sin((b[0] - a[0]) * radians / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)))
}

/** Time determines progress; distance determines where the entity is on the road. */
export function virtualJourney(coordinates: JourneyPoint[], durationSeconds: number, startedAt: string, now: number) {
  if (coordinates.length < 2 || !Number.isFinite(durationSeconds) || durationSeconds < 0 || !Number.isFinite(Date.parse(startedAt))) throw new Error('Invalid virtual journey')
  const fraction = durationSeconds === 0 ? 1 : Math.max(0, Math.min(1, (now - Date.parse(startedAt)) / (durationSeconds * 1000)))
  const lengths = coordinates.slice(1).map((point, index) => distanceBetween(coordinates[index], point))
  const total = lengths.reduce((sum, length) => sum + length, 0)
  let remaining = total * fraction
  let index = 0
  while (index < lengths.length - 1 && remaining > lengths[index]) { remaining -= lengths[index]; index++ }
  const ratio = lengths[index] > 0 ? Math.min(1, remaining / lengths[index]) : fraction
  const from = coordinates[index], to = coordinates[index + 1]
  const position: JourneyPoint = fraction === 1 ? coordinates[coordinates.length - 1] : [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio]
  return { position, arrived: fraction === 1, remainingSeconds: Math.ceil(durationSeconds * (1 - fraction)), remainingFraction: 1 - fraction,
    remainingCoordinates: [position, ...coordinates.slice(index + 1)] as JourneyPoint[] }
}
