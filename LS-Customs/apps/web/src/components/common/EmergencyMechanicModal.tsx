import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../supabaseClient'
import { useDialog } from '../../hooks/useDialog'
import { LocationPicker } from './map'

export interface EmergencyDispatchData {
  customerId: string
  id: string; issue: string; issueLabel: string; coords: { lat: number; lng: number }
  locationLabel: string; vehicleDetails: string; etaMinutes: number; dispatchedAt: number
  status?: string
  mechanic: { name: string; unit: string; vehicle: string; phone: string; rating: number; initials: string; plateNumber: string }
}
interface EmergencyMechanicModalProps {
  open: boolean; onClose: () => void; onNotify: (message: string) => void; userId?: string
  activeDispatch: EmergencyDispatchData | null
  setActiveDispatch: (dispatch: EmergencyDispatchData | null) => void
  onViewBookings?: () => void
}
const scenarios = [
  ['battery', 'Battery assistance', 1850], ['tire', 'Flat tire', 1250],
  ['engine', 'Engine trouble', 2950], ['lockout', 'Vehicle lockout', 1650],
  ['fuel', 'Fuel assistance', 1200], ['towing', 'Towing', 3800],
] as const

export function EmergencyMechanicModal({ open, onClose, onNotify, userId, activeDispatch, setActiveDispatch, onViewBookings }: EmergencyMechanicModalProps) {
  const dispatch = activeDispatch?.customerId === userId && userId ? activeDispatch : null
  const ref = useDialog(onClose, open)
  const [issue, setIssue] = useState('battery')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [notes, setNotes] = useState('')
  const [confirmedLocation, setConfirmedLocation] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [restoring, setRestoring] = useState(true)

  // Restore from the customer's saved booking and poll status. No simulated state.
  useEffect(() => {
    let active = true
    setRestoring(Boolean(userId))
    if (!userId) { setActiveDispatch(null); setRestoring(false); return }
    const refresh = async () => {
      const { data, error: queryError } = await supabase.from('service_bookings')
        .select('id,status,pin_lat,pin_lng,notes,created_at,mechanic_id')
        .eq('customer_id', userId).eq('is_emergency', true)
        .in('status', ['pending', 'assigned', 'en_route', 'in_progress'])
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!active) return
      if (queryError) { setRestoring(true); setError('Unable to check your saved requests. Retry before creating another request.'); return }
      setRestoring(false)
      if (!data) { setActiveDispatch(null); return }
      let name = 'Awaiting assignment', phone = ''
      if (data.mechanic_id) {
        const { data: mechanic } = await supabase.from('profiles').select('full_name,phone').eq('id', data.mechanic_id).maybeSingle()
        if (!active) return
        name = mechanic?.full_name ?? 'Assigned mechanic'; phone = mechanic?.phone ?? ''
      }
      const savedIssue = data.notes?.match(/Emergency: (\w+)/)?.[1] ?? 'Roadside assistance'
      setActiveDispatch({ customerId: userId, id: data.id, status: data.status, issue: savedIssue, issueLabel: scenarios.find(([id]) => id === savedIssue)?.[1] ?? 'Roadside assistance',
        coords: { lat: data.pin_lat, lng: data.pin_lng }, locationLabel: data.notes ?? '', vehicleDetails: '',
        etaMinutes: 0, dispatchedAt: Date.parse(data.created_at),
        mechanic: { name, phone, unit: data.status.replace(/_/g, ' '), vehicle: '', rating: 0, initials: '', plateNumber: '' } })
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 15000)
    return () => { active = false; window.clearInterval(timer) }
  }, [userId, open, setActiveDispatch])

  async function assign(id: string) {
    const { data, error: invokeError } = await supabase.functions.invoke('assign-mechanic', { body: { service_booking_id: id } })
    if (invokeError || data?.error) throw new Error('Your request is saved, but a mechanic could not be assigned. Retry dispatch or contact support.')
    const assignment = data?.data ?? data
    if (!assignment?.mechanic_id || assignment.service_booking_id !== id || !['assigned', 'en_route', 'in_progress'].includes(assignment.status))
      throw new Error('Your request is saved and awaiting assignment.')
    setActiveDispatch({ customerId: userId!, id, status: assignment.status,
      issue: dispatch?.issue ?? issue, issueLabel: dispatch?.issueLabel ?? issue,
      coords: dispatch?.coords ?? { lat: Number(latitude), lng: Number(longitude) },
      locationLabel: dispatch?.locationLabel ?? notes, vehicleDetails: dispatch?.vehicleDetails ?? '',
      etaMinutes: 0, dispatchedAt: dispatch?.dispatchedAt ?? Date.now(),
      mechanic: { name: assignment.mechanic_name ?? 'Assigned mechanic', phone: assignment.mechanic_phone ?? '',
        unit: assignment.status, vehicle: '', rating: 0, initials: '', plateNumber: '' } })
  }
  async function request() {
    if (busy || restoring) return
    setBusy(true); setError(null)
    try {
      if (!userId) throw new Error('Please sign in before requesting roadside assistance.')
      if (dispatch) { await assign(dispatch.id); return }
      const lat = Number(latitude), lng = Number(longitude)
      if (!latitude.trim() || !longitude.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || !confirmedLocation)
        throw new Error('Enter valid coordinates and confirm your service location.')
      const { data, error: bookingError } = await supabase.rpc('create_service_booking', {
        p_request_id: requestId, p_service_id: null, p_scheduled_at: null,
        p_lat: lat, p_lng: lng, p_notes: notes, p_emergency: issue,
      })
      if (bookingError || !data?.id) throw new Error('Your request could not be saved. Please retry or contact support.')
      setActiveDispatch({ customerId: userId, id: data.id, status: data.status, issue, issueLabel: issue, coords: { lat, lng },
        locationLabel: notes, vehicleDetails: '', etaMinutes: 0, dispatchedAt: Date.now(),
        mechanic: { name: 'Awaiting assignment', unit: 'Pending', vehicle: '', phone: '', rating: 0, initials: '', plateNumber: '' } })
      await assign(data.id)
      onNotify('A mechanic has been assigned. Check your booking for departure updates.')
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Assistance is temporarily unavailable.') }
    finally { setBusy(false) }
  }
  async function cancel() {
    if (!dispatch || busy) return
    setBusy(true); setError(null)
    const { error: cancellationError } = await supabase.rpc('cancel_customer_booking', { p_booking_type: 'service', p_booking_id: dispatch.id })
    if (cancellationError) setError('Cancellation could not be completed. Check the booking status or contact support.')
    else { setActiveDispatch(null); setRequestId(crypto.randomUUID()); onNotify('Roadside request cancelled.') }
    setBusy(false)
  }
  function locate() {
    setError(null)
    if (!navigator.geolocation) { setError('Location access is unavailable. Enter coordinates below.'); return }
    navigator.geolocation.getCurrentPosition(position => {
      setLatitude(String(position.coords.latitude)); setLongitude(String(position.coords.longitude)); setConfirmedLocation(false)
    }, () => setError('Location access failed. Enter coordinates or use your booking location.'), { timeout: 10000, enableHighAccuracy: true })
  }
  if (!open) return null
  return createPortal(<div className="auth-backdrop">
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="emergency-title" tabIndex={-1} className="auth-dialog" style={{ maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
      <button type="button" className="auth-close" aria-label="Close roadside assistance" onClick={onClose}>×</button>
      <h2 id="emergency-title">Roadside assistance</h2>
      <p>For immediate danger, contact local emergency services. Mechanic availability must be confirmed.</p>
      {error && <p role="alert">{error}</p>}
      {restoring ? <p role="status">Checking saved requests…</p> : dispatch ? <>
        <p role="status">Saved request: <strong>{dispatch.status?.replace(/_/g, ' ') ?? 'pending'}</strong></p>
        <p>{dispatch.issueLabel} · {dispatch.mechanic.name}</p><p>Arrival estimate unavailable.</p>
        {dispatch.mechanic.phone && <a href={`tel:${dispatch.mechanic.phone.replace(/[^+\d]/g, '')}`}>Call assigned mechanic</a>}
        {dispatch.status === 'pending' && <button type="button" disabled={busy} onClick={() => void request()}>Retry dispatch</button>}
        {['pending', 'assigned', 'en_route'].includes(dispatch.status ?? '') && <button type="button" disabled={busy} onClick={() => void cancel()}>Cancel saved request</button>}
        <button type="button" onClick={() => { onViewBookings?.(); onClose() }}>View booking details</button>
      </> : <form onSubmit={event => { event.preventDefault(); void request() }} style={{ display: 'grid', gap: 12 }}>
        <label>Assistance type<select value={issue} onChange={event => setIssue(event.target.value)}>{scenarios.map(([id, label, cost]) => <option key={id} value={id}>{label} · ₱{cost.toLocaleString()}</option>)}</select></label>
        <button type="button" onClick={locate}>Use my location</button>
        <LocationPicker height={260} id="emergency-location" value={latitude && longitude ? { lat: Number(latitude), lng: Number(longitude) } : null}
          onChange={position => { setLatitude(String(position.lat)); setLongitude(String(position.lng)); setConfirmedLocation(false) }} />
        <label>Latitude<input required type="number" step="any" min="-90" max="90" value={latitude} onChange={event => { setLatitude(event.target.value); setConfirmedLocation(false) }} /></label>
        <label>Longitude<input required type="number" step="any" min="-180" max="180" value={longitude} onChange={event => { setLongitude(event.target.value); setConfirmedLocation(false) }} /></label>
        <label>Landmark and vehicle details<textarea maxLength={1900} value={notes} onChange={event => setNotes(event.target.value)} /></label>
        <label><input type="checkbox" checked={confirmedLocation} onChange={event => setConfirmedLocation(event.target.checked)} /> I confirm these coordinates are my service location.</label>
        <p>Payment is collected on arrival. Your request is saved before assignment.</p>
        <button type="submit" disabled={busy || !userId || !confirmedLocation}>{busy ? 'Saving request…' : userId ? 'Request mechanic' : 'Sign in to request a mechanic'}</button>
      </form>}
    </div>
  </div>, document.body)
}
