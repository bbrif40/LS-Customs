import { useWebsiteText } from "../../hooks/useWebsiteText"
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

export function LoadingMessage({ label = 'Loading LS Customs…' }: { label?: string }) {
  const websiteText = useWebsiteText("Shared")

  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 8000)
    return () => window.clearTimeout(timer)
  }, [])
  return <div className="custom-loading" role="status" aria-live="polite">
    <Loader2 size={24} className="spin" aria-hidden="true" />
    <strong>{slow ? websiteText("Taking a little longer than usual") : websiteText(label)}</strong>
    {slow && <><p>{websiteText("We’re still loading your information. Please check your connection and give us a moment.")}</p><button type="button" className="outline-button" onClick={() => window.location.reload()}>{websiteText("Reload page")}</button></>}
  </div>
}
