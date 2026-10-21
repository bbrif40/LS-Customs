import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { watchTripGps } from '../components/common/map/watchGps'
import { Capacitor } from '@capacitor/core'

export function useMechanicGps(bookingId: string | null, enabled: boolean) {
  const [message, setMessage] = useState('GPS sharing is off')
  const [lastSent, setLastSent] = useState<string | null>(null)
  useEffect(() => {
    setLastSent(null)
    if (!bookingId || !enabled) { setMessage('GPS sharing is off'); return }
    let clearWatch: (() => void) | null = null, starting = false, cancelled = false, busy = false, lastWrite = 0, generation = 0
    const stop = () => { generation++; clearWatch?.(); clearWatch = null }
    const start = async () => {
      if ((!Capacitor.isNativePlatform() && document.hidden) || clearWatch || starting || cancelled) return
      starting = true
      const token = generation
      setMessage('Waiting for GPS permission and a location fix')
      try {
      const cleanup = await watchTripGps(async position => {
        if (cancelled || (!Capacitor.isNativePlatform() && document.hidden) || token !== generation) return
        const { coords, timestamp } = position
        if (coords.accuracy > 150 || Date.now() - timestamp > 30_000) { setMessage('Waiting for a more accurate GPS fix'); return }
        const interval = coords.speed != null && coords.speed < 1 ? 15_000 : 5_000
        if (busy || Date.now() - lastWrite < interval) return
        busy = true; lastWrite = Date.now()
        try {
          const { error } = await supabase.rpc('publish_booking_location', {
            p_booking_id: bookingId, p_lat: coords.latitude, p_lng: coords.longitude,
            p_accuracy: coords.accuracy, p_recorded_at: new Date(timestamp).toISOString(),
            p_heading: Number.isFinite(coords.heading) ? coords.heading : null,
            p_speed: Number.isFinite(coords.speed) ? coords.speed : null,
          })
          if (cancelled) return
          setMessage(error ? 'GPS update failed. Checking assignment and retrying with the next fix.' : 'Sharing your location with the assigned customer')
          if (!error) setLastSent(new Date().toISOString())
          if (error?.code === '42501') { stop(); setMessage('Location sharing stopped because this trip is no longer active.') }
        } catch { if (!cancelled) setMessage('Connection lost. Retrying with the next GPS fix.') }
        finally { busy = false }
      }, denied => {
        if (!cancelled) {
          setMessage(denied ? 'Location permission denied. Enable it and restart sharing.' : 'GPS signal unavailable. Restart sharing to retry.')
          void supabase.rpc('report_booking_gps_failure', { p_booking: bookingId, p_reason: denied ? 'Location permission denied' : 'GPS signal unavailable' })
            .then(({ error }) => { if (error) console.error('GPS alert could not be recorded', error.message) })
        }
        stop()
      })
      if (cancelled || (!Capacitor.isNativePlatform() && document.hidden) || token !== generation) cleanup()
      else clearWatch = cleanup
      } catch { if (!cancelled) setMessage('GPS could not start. Check location permissions and restart sharing.') }
      finally { starting = false }
    }
    const visibility = () => { if (document.hidden && !Capacitor.isNativePlatform()) { stop(); setMessage('Browser sharing paused while hidden; use the Android app for background trip sharing.') } else void start() }
    void start()
    document.addEventListener('visibilitychange', visibility)
    return () => { cancelled = true; stop(); document.removeEventListener('visibilitychange', visibility) }
  }, [bookingId, enabled])
  return { message, lastSent }
}
