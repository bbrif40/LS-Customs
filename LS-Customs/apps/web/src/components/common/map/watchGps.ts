import { Capacitor } from '@capacitor/core'

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
