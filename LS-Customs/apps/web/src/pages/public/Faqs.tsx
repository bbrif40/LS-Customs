import { useWebsiteText } from "../../hooks/useWebsiteText"
/**
 * Frequently Asked Questions — public page.
 * Features a hero with search, category filters, and an accordion list.
 */
import { useEffect, useState } from 'react'
import { SearchBox } from '../../components/common/SearchBox'
import { Accordion } from '../../components/common/Accordion'
import { faqItems } from '../../data/faqs'
import { navigateTo } from '../../utils/navigation'
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
  const websiteText = useWebsiteText("Help Center")

  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')

  const localizedItems = faqItems.map((item) => ({
    ...item,
    question: websiteText(item.question),
    answer: websiteText(item.answer),
  }))
  let filteredItems = localizedItems
  if (activeCategory !== 'all') {
    filteredItems = filteredItems.filter((item) => item.category === activeCategory)
  }
  const search = query.trim().toLowerCase()
  if (search) {
    filteredItems = filteredItems.filter((item) =>
      item.question.toLowerCase().includes(search) || item.answer.toLowerCase().includes(search))
  }

  useEffect(() => {
    document.title = 'FAQs — LS Customs'
    document.querySelector('meta[name="description"]')?.setAttribute(
      'content',
      'Browse frequently asked questions about LS Customs rentals, mobile mechanic services, billing, accounts, and bookings.'
    )
  }, [])

  const handleSearch = (q: string) => {
    setQuery(q)
  }

  return (
    <div className="public-page">
      <header className="public-hero">
        <h1>{websiteText("Frequently Asked")} <em>{websiteText("Questions")}</em></h1>
        <p className="subhead">{websiteText("Find answers to common questions about rentals, mobile mechanics, billing, and your account.")}</p>
      </header>

      <SearchBox
        placeholder={websiteText("Search questions...")}
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
            {websiteText(cat.label)}
          </button>
        ))}
      </div>

      {filteredItems.length === 0 ? (
        <p className="muted" style={{ marginTop: 24 }}>{websiteText("No questions found for \"")}{query}{websiteText("\". Try adjusting your search or filter.")}</p>
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
          <p className="muted">{websiteText("Still have questions?")}</p>
          <button
            className="button dark-button"
            style={{ marginTop: 12 }}
            onClick={() => navigateTo('/contact')}
          >{websiteText("Contact Support")}</button>
        </div>
      )}
    </div>
  )
}
