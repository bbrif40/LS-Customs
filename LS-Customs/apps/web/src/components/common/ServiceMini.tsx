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
  onClick?: () => void
}

export function ServiceMini({ title, detail, price, icon, onClick }: ServiceMiniProps) {
  return (
    <article className="service-mini" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div className="service-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{detail}</p>
      <span>{price}</span>
      <ChevronRight className="mini-arrow" size={17} />
    </article>
  )
}
