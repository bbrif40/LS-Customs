/**
 * Accordion — collapsible FAQ-style list. Each item can be toggled open.
 * Supports single-open (default) and multi-open (allowMultiple) modes.
 */
import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

export interface AccordionItem {
  id: string
  question: string
  answer: ReactNode
}

interface AccordionProps {
  items: AccordionItem[]
  allowMultiple?: boolean
}

export function Accordion({ items, allowMultiple = false }: AccordionProps) {
  const [openIds, setOpenIds] = useState<string[]>([])

  const toggle = (id: string) => {
    if (allowMultiple) {
      setOpenIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      )
    } else {
      setOpenIds((prev) => (prev.includes(id) ? [] : [id]))
    }
  }

  return (
    <div className="accordion">
      {items.map((item) => {
        const isOpen = openIds.includes(item.id)
        return (
          <div
            key={item.id}
            className={`accordion-item${isOpen ? ' open' : ''}`}
          >
            <div
              className="accordion-header"
              role="button"
              tabIndex={0}
              onClick={() => toggle(item.id)}
              onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? (e.preventDefault(), toggle(item.id)) : undefined}
              aria-expanded={isOpen}
              aria-controls={`accordion-content-${item.id}`}
              id={`accordion-header-${item.id}`}
            >
              <span className="accordion-question">{item.question}</span>
              <span className="accordion-toggle">
                <ChevronDown size={16} />
              </span>
            </div>
            <div
              className="accordion-content"
              id={`accordion-content-${item.id}`}
              role="region"
              aria-labelledby={`accordion-header-${item.id}`}
            >
              <div className="accordion-answer">{item.answer}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
