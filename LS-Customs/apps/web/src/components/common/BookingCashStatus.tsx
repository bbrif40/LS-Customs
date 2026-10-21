import { useWebsiteText } from "../../hooks/useWebsiteText"
import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
export function BookingCashStatus({ bookingId, status }: { bookingId: string; status: string }) {
  const websiteText = useWebsiteText("Bookings")

  const [balance, setBalance] = useState<number | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const load = async () => {
      const { data, error: loadError } = await supabase.from('account_charges').select('amount,paid,waived').eq('booking_id', bookingId).eq('kind', 'service_base').maybeSingle()
      if (loadError) setError('Cash balance could not be loaded.'); else { setBalance(data ? Number(data.amount) - Number(data.paid) - Number(data.waived) : null); setError('') }
    }
    void load(); const timer = setInterval(() => void load(), 15000); return () => clearInterval(timer)
  }, [bookingId])
  return <div className="booking-payment-section"><h4>{websiteText("Cash payment after service")}</h4>{error && <p role="alert">{error}</p>}
    <p>{status === 'completed' ? balance === null ? websiteText("Completed · collection status loading") : balance > 0 ? websiteText("Completed · Cash unpaid · PHP {value1} due", { value1: String(balance.toFixed(2)) }) : websiteText("Completed · Balance settled") : websiteText("Cash due after service")}</p>
    {balance !== null && balance > 0 && <a href="/profile">{websiteText("Review or settle your account balance")}</a>}
  </div>
}
