import { useWebsiteText } from "../../hooks/useWebsiteText"
import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import { supabase } from '../../supabaseClient'

export interface RentalCheckout { id: string; license_id: string | null; checkout_state: string; payment_method: string; hold_expires_at: string | null; review_deadline: string | null; pickup_deadline: string | null; pickup_at: string; return_at: string }
export function useRentalCheckout(bookingId: string) {
  const [checkout, setCheckout] = useState<RentalCheckout | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    if (!bookingId) return
    const { data, error: loadError } = await supabase.from('vehicle_bookings')
      .select('id,license_id,checkout_state,payment_method,hold_expires_at,review_deadline,pickup_deadline,pickup_at,return_at').eq('id', bookingId).single()
    if (loadError) setError('Checkout status could not be loaded. Please retry.'); else { setCheckout(data); setError('') }
  }, [bookingId])
  useEffect(() => { setCheckout(null); void load(); const timer = window.setInterval(() => void load(), 15000); return () => clearInterval(timer) }, [load])
  return { checkout, error, load }
}

export function RentalLicenseReview({ checkout, reload }: { checkout: RentalCheckout; reload: () => Promise<void> }) {
  const websiteText = useWebsiteText("Rentals")

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [review, setReview] = useState<{ state: string; review_reason: string | null } | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  useEffect(() => {
    if (!checkout.license_id) { setReview(null); return }
    void supabase.from('driver_licenses').select('state,review_reason').eq('id', checkout.license_id).single().then(({ data, error: loadError }) => {
      if (loadError) setError('License review details could not be loaded.'); else setReview(data)
    })
  }, [checkout.license_id, checkout.checkout_state, now - now % 15000])
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || busy) return
    event.target.value = ''; setBusy(true); setError('')
    try {
      if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type) || file.size > 10 * 1024 * 1024)
        throw new Error('Upload a JPEG, PNG, WebP or PDF no larger than 10 MB.')
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sign in to upload your license.')
      const path = `${user.id}/${crypto.randomUUID()}.${file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1]}`
      const { error: uploadError } = await supabase.storage.from('driver-licenses').upload(path, file, { contentType: file.type, upsert: false })
      if (uploadError) throw uploadError
      const { error: submitError } = await supabase.rpc('submit_rental_license', { p_booking: checkout.id, p_object_path: path })
      if (submitError) throw submitError
      await reload()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'License upload failed. Please retry.') }
    finally { setBusy(false) }
  }
  const deadline = checkout.checkout_state === 'license_pending' ? checkout.review_deadline : checkout.hold_expires_at
  const remaining = deadline ? Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000)) : null
  return <section className="account-panel"><h3>{websiteText("Driver license verification")}</h3>
    <p>{websiteText("Driver’s license only. It must match your profile and remain valid through your return date. Uploads are private to you and authorized admins.")}</p>
    <p>{websiteText("Status:")} {checkout.checkout_state.replace(/_/g, ' ')}</p>
    <p>{websiteText("Pickup:")} {new Date(checkout.pickup_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}<br />{' '}{websiteText("Return:")} {new Date(checkout.return_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}{websiteText("· Philippine time")}</p>
    {remaining !== null && <p role="status">{remaining > 0 ? websiteText("{value1}m {value2}s remaining", { value1: String(Math.floor(remaining / 60)), value2: String(remaining % 60) }) : websiteText("Hold expired. Please choose an available vehicle again.")}</p>}
    {review?.review_reason && <p>{websiteText("Admin review:")} {review.review_reason}</p>}
    {checkout.checkout_state === 'license_pending' && (remaining ?? 0) > 0 && <label>{checkout.license_id ? websiteText("Replace an unreadable license") : websiteText("Upload your driver’s license")}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy || (!!checkout.license_id && review?.state !== 'unreadable')} onChange={event => void upload(event)} /></label>}
    {checkout.checkout_state === 'awaiting_payment' && <p>{websiteText("Your license is approved. Pay online within 3 hours of approval.")}</p>}
    {checkout.checkout_state === 'cash_confirmed' && <p><strong>{websiteText("Confirmed · Cash due before handover.")}</strong>{' '}{websiteText("Customer cancellation is unavailable. Pickup grace deadline:")} {checkout.pickup_deadline && new Date(checkout.pickup_deadline).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}{' '}{websiteText("Philippine time. After-hours handover requires admin approval.")}</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}
