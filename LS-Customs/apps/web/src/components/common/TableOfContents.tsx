/**
 * TableOfContents — sticky sidebar navigation for long-form content pages
 * (legal documents, documentation). Highlights the current section as the user
 * scrolls. Uses hash-link navigation for browser back/forward support.
 */
import { useEffect, useState } from 'react'
import type { LegalSection } from '../../types'

interface TableOfContentsProps {
  items: LegalSection[]
  activeId?: string
}

export function TableOfContents({ items, activeId: controlledActiveId }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState(controlledActiveId ?? '')

  // If controlled, defer to the parent's active state.
  useEffect(() => {
    if (controlledActiveId) setActiveId(controlledActiveId)
  }, [controlledActiveId])

  const handleClick = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      const yOffset = -80
      const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset
      window.scrollTo({ top: y, behavior: 'smooth' })
      setActiveId(id)
      window.history.pushState(null, '', `#${id}`)
    }
  }

  return (
    <nav className="legal-toc" aria-label="Table of contents">
      <h3>Contents</h3>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className={`level-${item.level}${activeId === item.id ? ' active' : ''}`}
              onClick={(e) => {
                e.preventDefault()
                handleClick(item.id)
              }}
            >
              {item.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
