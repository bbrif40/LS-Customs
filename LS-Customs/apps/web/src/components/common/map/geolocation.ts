/**
 * geolocation — a single, resilient wrapper around navigator.geolocation.
 *
 * Why this exists: calling getCurrentPosition with enableHighAccuracy and a
 * short timeout routinely fails on desktops/laptops (no GPS chip), and the
 * old callers swallowed the error so the "Use my current location" button
 * appeared to do nothing. This helper:
 *   1. tries a high-accuracy fix first,
 *   2. falls back to a fast network/Wi-Fi fix on timeout/unavailable,
 *   3. returns a human-readable error the UI can show.
 */

export interface UserPosition {
  lat: number
  lng: number
  /** Accuracy radius in metres, if the browser reported one. */
  accuracy?: number
}

export type LocateErrorCode = 'unsupported' | 'insecure' | 'denied' | 'unavailable' | 'timeout'

export class LocateError extends Error {
  code: LocateErrorCode
  constructor(code: LocateErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

const MESSAGES: Record<LocateErrorCode, string> = {
  unsupported: "Your browser doesn't support location services. Search for your address instead.",
  insecure: 'Location only works over a secure (https) connection. Search for your address instead.',
  denied: 'Location access is blocked. Allow location for this site in your browser settings, then try again.',
  unavailable: "We couldn't determine your location. Check that location services are on, or search for your address.",
  timeout: 'Finding your location took too long. Try again, or search for your address.',
}

function attempt(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options)
  })
}

function toLocateError(err: GeolocationPositionError | unknown): LocateError {
  const code = (err as GeolocationPositionError)?.code
  if (code === 1) return new LocateError('denied', MESSAGES.denied)
  if (code === 3) return new LocateError('timeout', MESSAGES.timeout)
  return new LocateError('unavailable', MESSAGES.unavailable)
}

/** Resolve the user's current position, or throw a LocateError with a friendly message. */
export async function locateUser(): Promise<UserPosition> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    throw new LocateError('unsupported', MESSAGES.unsupported)
  }
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    throw new LocateError('insecure', MESSAGES.insecure)
  }

  const toPos = (p: GeolocationPosition): UserPosition => ({
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    accuracy: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : undefined,
  })

  try {
    return toPos(await attempt({ enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }))
  } catch (err) {
    // Permission denied won't change on retry — surface it straight away.
    if ((err as GeolocationPositionError)?.code === 1) throw toLocateError(err)
  }

  try {
    // Low-accuracy fallback: uses Wi-Fi/IP positioning, much faster on desktops.
    return toPos(await attempt({ enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }))
  } catch (err) {
    throw toLocateError(err)
  }
}

/**
 * True when the user has already granted location permission, so we can
 * auto-locate on load without triggering a surprise permission prompt.
 */
export async function hasLocationPermission(): Promise<boolean> {
  try {
    if (!navigator.permissions?.query) return false
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
    return status.state === 'granted'
  } catch {
    return false
  }
}

export function describeAccuracy(accuracy?: number): string {
  if (!accuracy) return ''
  if (accuracy < 1000) return `±${Math.round(accuracy)} m`
  return `±${(accuracy / 1000).toFixed(1)} km`
}
