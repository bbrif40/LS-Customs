import { Capacitor, registerPlugin } from '@capacitor/core'
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation'

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation')
const TrackingPermissions = registerPlugin<{ requestIndicatorPermission(): Promise<{ granted: boolean }> }>('TrackingPermissions')

export interface GpsFix {
  timestamp: number
  coords: { latitude: number; longitude: number; accuracy: number; heading: number | null; speed: number | null }
}

/** Foreground GPS with native Android permission handling. Caller owns cleanup. */
export async function watchGps(onPosition: (fix: GpsFix) => void, onError: (denied: boolean) => void): Promise<() => void> {
  if (Capacitor.isNativePlatform()) {
    const { Geolocation } = await import('@capacitor/geolocation')
    let permission = await Geolocation.checkPermissions()
    if (permission.location !== 'granted') permission = await Geolocation.requestPermissions({ permissions: ['location'] })
    if (permission.location !== 'granted') { onError(true); return () => {} }
    const id = await Geolocation.watchPosition({ enableHighAccuracy: true, maximumAge: 0, timeout: 20_000, minimumUpdateInterval: 5000 }, (position, error) => {
      if (error) onError(false)
      else if (position) onPosition(position)
    })
    return () => { void Geolocation.clearWatch({ id }) }
  }
  if (!navigator.geolocation) { onError(false); return () => {} }
  const id = navigator.geolocation.watchPosition(onPosition, error => onError(error.code === 1), { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 })
  return () => navigator.geolocation.clearWatch(id)
}

/** Explicitly enabled by the mechanic for an en-route booking only. */
export async function watchTripGps(onPosition: (fix: GpsFix) => void, onError: (denied: boolean) => void): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return watchGps(onPosition, onError)
  if (Capacitor.getPlatform() === 'android') {
    const result = await TrackingPermissions.requestIndicatorPermission()
    if (!result.granted) { onError(true); return () => {} }
  }
  const id = await BackgroundGeolocation.addWatcher({ backgroundTitle: 'LS Customs · Trip location',
    backgroundMessage: 'Sharing location with your assigned customer during travel. Stops on arrival or cancellation.',
    requestPermissions: true, stale: false, distanceFilter: 0,
  }, (location, error) => {
    if (error) { onError(error.code === 'NOT_AUTHORIZED'); return }
    if (!location || !location.time || location.simulated) { onError(false); return }
    onPosition({ timestamp: location.time, coords: { latitude: location.latitude, longitude: location.longitude,
      accuracy: location.accuracy, heading: location.bearing, speed: location.speed } })
  })
  return () => { void BackgroundGeolocation.removeWatcher({ id }) }
}
