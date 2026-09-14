/**
 * Frequently Asked Questions — public page.
 * Features a hero with search, category filters, and an accordion list.
 */
import { useEffect, useMemo, useState } from 'react'
import { SearchBox } from '../../components/common/SearchBox'
import { Accordion } from '../../components/common/Accordion'
import { faqItems } from '../../data/faqs'
import type { FaqItem } from '../../types'

const FAQ_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'rentals', label: 'Rentals' },
  { id: 'mechanic', label: 'Mobile Mechanic' },
  { id: 'billing', label: 'Billing' },
  { id: 'account', label: 'Account' },
  { id: 'bookings', label: 'Bookings' },
] as const

export function Faqs() {
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')

  useEffect(() => {
    document.title = 'FAQs — LS Customs'
    document.querySelector('meta[name="description"]')?.setAttribute(
      'content',
      'Browse frequently asked questions about LS Customs rentals, mobile mechanic services, billing, accounts, and bookings.'
    )
  }, [])

  const filteredItems = useMemo(() => {
    let items = faqItems

    if (activeCategory !== 'all') {
      items = items.filter((item) => item.category === activeCategory)
    }

    if (query.trim()) {
      const q = query.toLowerCase()
      items = items.filter(
        (item) =>
          item.question.toLowerCase().includes(q) ||
          item.answer.toLowerCase().includes(q)
      )
    }

    return items
  }, [query, activeCategory])

  const handleSearch = (q: string) => {
    setQuery(q)
  }

  return (
    <div className="public-page">
      <header className="public-hero">
        <h1>Frequently Asked <em>Questions</em></h1>
        <p className="subhead">
          Find answers to common questions about rentals, mobile mechanics,
          billing, and your account.
        </p>
      </header>

      <SearchBox
        placeholder="Search questions..."
        value={query}
        onChange={handleSearch}
      />

      {/* Category filters */}
      <div className="faq-filters">
        {FAQ_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            className={`faq-filter${activeCategory === cat.id ? ' active' : ''}`}
            onClick={() => setActiveCategory(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {filteredItems.length === 0 ? (
        <p className="muted" style={{ marginTop: 24 }}>
          No questions found for "{query}". Try adjusting your search or filter.
        </p>
      ) : (
        <Accordion
          items={filteredItems.map((item: FaqItem) => ({
            id: item.id,
            question: item.question,
            answer: item.answer,
          }))}
          allowMultiple={false}
        />
      )}

      {filteredItems.length > 0 && (
        <div style={{ marginTop: 36, textAlign: 'center' }}>
          <p className="muted">Still have questions?</p>
          <button
            className="button dark-button"
            style={{ marginTop: 12 }}
            onClick={() => { window.location.href = '/contact' }}
          >
            Contact Support
          </button>
        </div>
      )}
    </div>
  )
}
