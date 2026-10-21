import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
export interface ServiceCheckout { id: string; checkout_state: string; payment_method: string; status: string; mechanic_id: string | null; hold_expires_at: string | null; offer_deadline: string | null }
export function useServiceCheckout(bookingId: string) {
  const [checkout, setCheckout] = useState<ServiceCheckout | null>(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('service_bookings')
      .select('id,checkout_state,payment_method,status,mechanic_id,hold_expires_at,offer_deadline').eq('id', bookingId).single()
    if (loadError) setError('Booking checkout could not be loaded.'); else { setCheckout(data); setError('') }
  }, [bookingId])
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 5000); const clock = setInterval(() => setNow(Date.now()), 1000); return () => { clearInterval(timer); clearInterval(clock) } }, [load])
  const deadline = checkout?.checkout_state === 'offering' ? checkout.offer_deadline : checkout?.hold_expires_at
  return { checkout, error, load, remaining: deadline ? Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000)) : null }
}
