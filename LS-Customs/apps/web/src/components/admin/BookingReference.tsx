import { useEffect, useState } from 'react'
import { Copy, Check } from 'lucide-react'

export function BookingReference({ id, actionsLink = false, bookingType }: { id: string; actionsLink?: boolean; bookingType?: 'vehicle' | 'service' }) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)
  useEffect(() => { setCopied(false); setError(false) }, [id])
  return <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 8, maxWidth: '100%' }}>
    <code style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: 'normal', overflowWrap: 'anywhere', userSelect: 'all' }}>{id}</code>
    <button type="button" title="Copy full booking ID" aria-label="Copy full booking ID" style={{ flexShrink: 0, padding: 4, display: 'inline-flex' }} onClick={async event => {
      event.stopPropagation()
      try { await navigator.clipboard.writeText(id); setCopied(true); setError(false) } catch { setError(true) }
    }}>{copied ? <Check size={14} /> : <Copy size={14} />}</button>
    {actionsLink && <a href={`/admin?view=operations&booking=${encodeURIComponent(id)}${bookingType ? `&booking_type=${bookingType}` : ''}`} style={{ fontSize: 11 }} onClick={event => event.stopPropagation()}>Open actions</a>}
    <span role="status" style={{ fontSize: 11 }}>{error ? 'Select the ID to copy it.' : copied ? 'Copied' : ''}</span>
  </span>
}
