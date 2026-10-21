import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { AccountBalance } from '../common/AccountBalance'
import { BookingReports } from '../common/BookingReports'
import { RefundRecovery } from './RefundRecovery'
import { ServiceSettings } from './ServiceSettings'
import { BookingSupport } from '../common/BookingSupport'

interface QueueItem { id: string; kind: string; title: string; customer_id: string | null; booking_id: string | null; due_at: string | null; claimed_by: string | null; details: Record<string, unknown> }
export function AdminOperations() {
  const [items, setItems] = useState<QueueItem[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [bookingId, setBookingId] = useState('')
  const [reportBookingId, setReportBookingId] = useState('')
  const [reportBookingType, setReportBookingType] = useState<'vehicle' | 'service'>('vehicle')
  const [returnedAt, setReturnedAt] = useState(() => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 16))
  const [arrangedPickup, setArrangedPickup] = useState('')
  const [pickupExtension, setPickupExtension] = useState('')
  const [reason, setReason] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [newAppointment, setNewAppointment] = useState('')
  const [message, setMessage] = useState('')
  const [reviewBooking, setReviewBooking] = useState('')
  const [reviewReason, setReviewReason] = useState('')
  const [licenseExpiry, setLicenseExpiry] = useState('')
  const [licenseUrl, setLicenseUrl] = useState('')
  const [licensePdf, setLicensePdf] = useState(false)
  const [licenseWindow, setLicenseWindow] = useState('')
  const load = useCallback(async () => {
    const { error: refreshError } = await supabase.rpc('refresh_operations_queue')
    if (refreshError) { setError('Due operations could not be refreshed. Please retry.'); return }
    const { data, error: loadError } = await supabase.from('operations_queue').select('*').is('closed_at', null).order('due_at', { nullsFirst: false }).order('created_at')
    // Polling keeps action errors visible; each action clears its own error when it starts.
    if (loadError) setError(loadError.message); else setItems(data ?? [])
  }, [])
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 30000); return () => clearInterval(timer) }, [load])
  const openWorkspace = async (id: string) => {
    const { data: rental } = await supabase.from('vehicle_bookings').select('id').eq('id', id).maybeSingle()
    setReportBookingType(rental ? 'vehicle' : 'service'); setBookingId(id); setReportBookingId(id)
  }
  const arrangePickup = async () => {
    setBusy(true)
    const { error: arrangementError } = await supabase.rpc('arrange_rental_pickup', { p_booking: bookingId,
      p_pickup: new Date(`${arrangedPickup}:00+08:00`).toISOString(), p_reason: reason })
    if (arrangementError) setError(arrangementError.message); else { setMessage('Pickup and return shifted together with duration and price preserved.'); await load() }
    setBusy(false)
  }
  const claim = async (id: string, release = false) => {
    setBusy(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error: claimError } = await supabase.rpc('claim_operations_item', { p_id: id, p_owner: release ? null : user?.id })
      if (claimError) throw claimError
      await load()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Assignment failed') }
    finally { setBusy(false) }
  }
  const recordReturn = async () => {
    if (busy) return
    setBusy(true); setMessage('')
    try {
      const { data, error: returnError } = await supabase.rpc('record_vehicle_return', {
        p_booking: bookingId, p_returned_at: new Date(`${returnedAt}:00+08:00`).toISOString(),
        p_reason: reason, p_request: crypto.randomUUID(),
      })
      if (returnError) throw returnError
      setMessage(`Return recorded. Late-return fee: PHP ${Number(data).toFixed(2)}.`)
      setReason(''); await load()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Return could not be recorded') }
    finally { setBusy(false) }
  }
  const openLicense = async (booking: string) => {
    setReviewBooking(booking); setLicenseUrl(''); setLicenseWindow(''); setError('')
    const { data: rental, error: rentalError } = await supabase.from('vehicle_bookings').select('license_id,checkout_state,review_deadline').eq('id', booking).single()
    if (rentalError || !rental?.license_id) { setError('The customer has not uploaded a license yet.'); return }
    setLicenseWindow(rental.checkout_state === 'license_pending' && rental.review_deadline && Date.parse(rental.review_deadline) > Date.now()
      ? `Review before ${new Date(rental.review_deadline).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} Philippine time.`
      : `Review window closed (booking ${rental.checkout_state.replace(/_/g, ' ')}). The license can be viewed but no longer approved.`)
    const { data: license, error: licenseError } = await supabase.from('driver_licenses').select('object_path').eq('id', rental.license_id).single()
    if (licenseError || !license) { setError('License could not be loaded.'); return }
    const { data, error: urlError } = await supabase.storage.from('driver-licenses').createSignedUrl(license.object_path, 600)
    if (urlError) setError('Private license preview could not be opened.'); else { setLicensePdf(license.object_path.endsWith('.pdf')); setLicenseUrl(data.signedUrl) }
  }
  const reviewLicense = async (state: 'approved' | 'unreadable' | 'rejected') => {
    if (busy) return
    setBusy(true)
    const { error: reviewError } = await supabase.rpc('review_rental_license', { p_booking: reviewBooking, p_state: state, p_expires_on: licenseExpiry || null, p_reason: reviewReason })
    if (reviewError) setError(reviewError.message)
    else { setReviewBooking(''); setLicenseUrl(''); setReviewReason(''); await load() }
    setBusy(false)
  }
  const managePickup = async (arrived: boolean) => {
    setBusy(true)
    const { error: pickupError } = await supabase.rpc('manage_cash_pickup', { p_booking: bookingId, p_arrived: arrived,
      p_extension: arrived ? null : new Date(`${pickupExtension}:00+08:00`).toISOString(), p_reason: reason })
    if (pickupError) setError(pickupError.message); else { setMessage('Cash pickup arrangement recorded.'); await load() }
    setBusy(false)
  }
  const collectRentalCash = async () => {
    if (busy) return
    setBusy(true)
    const { error: cashError } = await supabase.rpc('record_rental_cash', { p_booking: bookingId, p_request: crypto.randomUUID(), p_reason: reason })
    if (cashError) setError(cashError.message); else { setMessage('Rental cash collection recorded.'); await load() }
    setBusy(false)
  }
  const reviewCancellation = async (requestId: string, approve: boolean) => {
    if (busy || reason.trim().length < 3) { setError('Enter an admin review reason in the notes field below.'); return }
    setBusy(true)
    const { error: reviewError } = await supabase.rpc('review_booking_cancellation', { p_request: requestId, p_approve: approve, p_reason: reason, p_refund_amount: refundAmount === '' ? null : Number(refundAmount) })
    if (reviewError) setError(reviewError.message); else { setReason(''); await load() }
    setBusy(false)
  }
  const reviewChange = async (requestId: string, kind: string, approve: boolean) => {
    if (busy || reason.trim().length < 3) { setError('Enter review notes below first.'); return }
    setBusy(true)
    const { error: changeError } = await supabase.rpc(kind === 'extension_review' ? 'approve_rental_extension' : 'approve_service_location_change', { p_request: requestId, p_approve: approve, p_reason: reason })
    if (changeError) setError(changeError.message); else { setReason(''); await load() }
    setBusy(false)
  }
  const providerAction = async (cancel: boolean) => {
    if (busy || reason.trim().length < 3) return
    setBusy(true)
    const result = cancel ? await supabase.rpc('provider_cancel_booking', { p_type: reportBookingType, p_booking: bookingId, p_reason: reason })
      : await supabase.rpc('request_mechanic_reschedule', { p_request: crypto.randomUUID(), p_booking: bookingId, p_schedule: new Date(`${newAppointment}:00+08:00`).toISOString() })
    if (result.error) setError(result.error.message); else { setMessage(cancel ? 'Provider cancellation recorded; collected payments enter full-refund processing.' : 'Time change proposed. Original appointment remains active until customer acceptance and mechanic capacity are secured.'); await load() }
    setBusy(false)
  }
  return <div className="admin-page"><section className="account-panel"><h1>Action queue</h1>
    {error && !reviewBooking && <p role="alert">{error}</p>}
    {!items.length && <p>No items requiring action.</p>}
    {items.map(item => <article className="account-panel" key={item.id}><h3>{item.title}</h3><p>{item.kind.replace(/_/g, ' ')} · {item.due_at ? `Due ${new Date(item.due_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} Philippine time` : 'No deadline'}</p>
      <p>{item.claimed_by ? `Assigned to admin ${item.claimed_by.slice(0, 8)}` : 'Unclaimed'}</p>
      {item.booking_id && <p>Booking {item.booking_id} <button type="button" onClick={() => void openWorkspace(item.booking_id!)}>Open booking workspace</button></p>}
      {item.kind === 'license_review' && item.booking_id && <button type="button" disabled={busy} onClick={() => void openLicense(item.booking_id!)}>Review private driver license</button>}
      {item.customer_id && <p>Customer {item.customer_id}</p>}
      {reviewBooking === item.booking_id && <fieldset disabled={busy}><legend>License review · {reviewBooking}</legend>{error && <p role="alert">{error}</p>}{licenseWindow && <p>{licenseWindow}</p>}{licenseUrl && <>{!licensePdf && <img src={licenseUrl} alt="Customer driver license" style={{ display: 'block', maxWidth: '100%', maxHeight: 480 }} />}<a href={licenseUrl} target="_blank" rel="noreferrer">Open private license in a new tab (10 minutes)</a></>}<label>Verified license expiry<input type="date" value={licenseExpiry} onChange={e => setLicenseExpiry(e.target.value)} /></label><label>Verification / rejection reason<input value={reviewReason} onChange={e => setReviewReason(e.target.value)} /></label><div className="transaction-actions"><button type="button" disabled={!licenseUrl || !licenseExpiry || reviewReason.length < 3} onClick={() => void reviewLicense('approved')}>Approve matching license</button><button type="button" disabled={reviewReason.length < 3} onClick={() => void reviewLicense('unreadable')}>Request readable upload</button><button type="button" disabled={reviewReason.length < 3} onClick={() => void reviewLicense('rejected')}>Reject invalid / mismatched license</button></div></fieldset>}
      {item.kind === 'cancellation_review' && typeof item.details.request_id === 'string' && <div><p>Review reason is required in the notes field below. Work already started requires a support-reviewed refund amount.</p><button type="button" disabled={busy} onClick={() => void reviewCancellation(item.details.request_id as string, true)}>Approve cancellation and quoted refund</button><button type="button" disabled={busy} onClick={() => void reviewCancellation(item.details.request_id as string, false)}>Decline cancellation</button></div>}
      {['extension_review', 'location_review'].includes(item.kind) && typeof item.details.request_id === 'string' && <div><button type="button" disabled={busy} onClick={() => void reviewChange(item.details.request_id as string, item.kind, true)}>Approve after availability / license checks</button><button type="button" disabled={busy} onClick={() => void reviewChange(item.details.request_id as string, item.kind, false)}>Decline proposed change</button></div>}
      <button type="button" disabled={busy} onClick={() => void claim(item.id)}>Claim / reassign to me</button>{item.claimed_by && <button type="button" disabled={busy} onClick={() => void claim(item.id, true)}>Release claim</button>}
    </article>)}<button type="button" onClick={() => void load()}>Refresh queue</button>
  </section><section className="account-panel"><h2>Rental cash and actual return</h2><p>Return time stops the late-fee clock. Corrections require a reason and retain audit history.</p>
    <label>Booking reference<input value={bookingId} onChange={e => setBookingId(e.target.value)} required /></label>
    <label>Actual return (Philippine time)<input type="datetime-local" value={returnedAt} onChange={e => setReturnedAt(e.target.value)} required /></label>
    <label>Reason / return notes<input value={reason} minLength={3} onChange={e => setReason(e.target.value)} required /></label>
    <label>Support-reviewed refund amount (PHP; leave empty for quoted policy refund)<input type="number" min="0" step="0.01" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} /></label>
    <button type="button" disabled={busy || !bookingId || reason.trim().length < 3} onClick={() => void recordReturn()}>Record actual return</button>{message && <p role="status">{message}</p>}
    <button type="button" disabled={busy || !bookingId || reason.trim().length < 3} onClick={() => void collectRentalCash()}>Record rental cash before handover</button>
    <button type="button" disabled={busy || !bookingId || reason.trim().length < 3} onClick={() => void managePickup(true)}>Record arrival before cash pickup expires</button>
    <label>Agreed pickup, including after hours (Philippine time)<input type="datetime-local" value={arrangedPickup} onChange={event => setArrangedPickup(event.target.value)} /></label><p>This shifts return by the same amount, preserving duration and price. Availability and approved license validity are checked.</p><button type="button" disabled={busy || !bookingId || !arrangedPickup || reason.trim().length < 5} onClick={() => void arrangePickup()}>Record agreed rental time arrangement</button>
    <label>Extended cash pickup deadline (Philippine time)<input type="datetime-local" value={pickupExtension} onChange={event => setPickupExtension(event.target.value)} /></label><button type="button" disabled={busy || !bookingId || !pickupExtension || reason.trim().length < 3} onClick={() => void managePickup(false)}>Extend active cash pickup deadline</button>
    <button type="button" disabled={busy || !bookingId || reason.trim().length < 3} onClick={() => void providerAction(true)}>Provider cancellation · full refund</button>
    <label>Proposed mechanic time (Philippine time)<input type="datetime-local" value={newAppointment} onChange={e => setNewAppointment(e.target.value)} /></label><button type="button" disabled={busy || !bookingId || !newAppointment || reason.trim().length < 3 || reportBookingType !== 'service'} onClick={() => void providerAction(false)}>Propose new time · customer can decline for full refund</button>
  </section><section className="account-panel"><h2>Booking reports</h2><label>Booking type<select value={reportBookingType} onChange={e => setReportBookingType(e.target.value as 'vehicle' | 'service')}><option value="vehicle">Rental</option><option value="service">Mechanic / roadside</option></select></label><label>Booking reference<input value={reportBookingId} onChange={e => setReportBookingId(e.target.value)} /></label>
    {/^[0-9a-f-]{36}$/i.test(reportBookingId) && <BookingReports key={`${reportBookingType}:${reportBookingId}`} bookingId={reportBookingId} bookingType={reportBookingType} operator="admin" />}
    {/^[0-9a-f-]{36}$/i.test(reportBookingId) && <BookingSupport key={`support:${reportBookingType}:${reportBookingId}`} bookingId={reportBookingId} bookingType={reportBookingType} admin />}
  </section><RefundRecovery /><AccountBalance admin /><ServiceSettings /></div>
}
