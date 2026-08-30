/**
 * PageHeading — standard section header with eyebrow, title, detail, and optional action button.
 */
import type { ReactNode } from 'react'

interface PageHeadingProps {
  eyebrow: string
  title: string
  detail: string
  action?: ReactNode
}

export function PageHeading({ eyebrow, title, detail, action }: PageHeadingProps) {
  return (
    <section className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{detail}</p>
      </div>
      {action}
    </section>
  )
}
