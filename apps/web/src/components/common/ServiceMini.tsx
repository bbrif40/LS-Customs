/**
 * ServiceMini — featured service card with icon, title, and price.
 */
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

interface ServiceMiniProps {
  title: string
  detail: string
  price: string
  icon: ReactNode
}

export function ServiceMini({ title, detail, price, icon }: ServiceMiniProps) {
  return (
    <article className="service-mini">
      <div className="service-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{detail}</p>
      <span>{price}</span>
      <ChevronRight className="mini-arrow" size={17} />
    </article>
  )
}
