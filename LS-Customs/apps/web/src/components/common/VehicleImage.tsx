import { useState } from 'react'

/** A labelled illustration preserves the layout when a real fleet photo is absent. */
export function VehicleImage({ src, name, className }: { src?: string | null; name: string; className?: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const fallback = !src || src === failedSource
  return <img className={className} src={fallback ? '/vehicle-placeholder.svg' : src}
    alt={fallback ? `${name} — vehicle illustration; actual photo unavailable` : name}
    onError={() => { if (src && !fallback) setFailedSource(src) }} />
}
