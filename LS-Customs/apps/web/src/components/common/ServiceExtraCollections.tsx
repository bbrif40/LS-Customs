import { useWebsiteText } from "../../hooks/useWebsiteText"
import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
export function ServiceExtraCollections({ bookingId }: { bookingId: string }) {
  const websiteText = useWebsiteText("Shared")

  const [charges, setCharges] = useState<{ id: string; amount: number; paid: number; waived: number }[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = async () => {
    const { data, error: loadError } = await supabase.from('account_charges').select('id,amount,paid,waived').eq('booking_id', bookingId).eq('kind', 'service_extra')
    if (loadError) setError('Extra-work balances could not be loaded.'); else setCharges(data ?? [])
  }
  useEffect(() => { void load() }, [bookingId])
  const collect = async (id: string) => {
    setBusy(true)
    const { error: collectionError } = await supabase.rpc('collect_service_extra_cash', { p_charge: id, p_request: crypto.randomUUID() })
    if (collectionError) setError(collectionError.message); else await load()
    setBusy(false)
  }
  return <section className="account-panel"><h3>{websiteText("Approved extras · cash collection after service")}</h3>{error && <p role="alert">{error}</p>}{charges.map(charge => <p key={charge.id}>{websiteText("PHP")} {(Number(charge.amount) - Number(charge.paid) - Number(charge.waived)).toFixed(2)}{' '}{websiteText("outstanding")} <button type="button" disabled={busy || Number(charge.amount) <= Number(charge.paid) + Number(charge.waived)} onClick={() => void collect(charge.id)}>{websiteText("Record cash collected for extras")}</button></p>)}</section>
}
