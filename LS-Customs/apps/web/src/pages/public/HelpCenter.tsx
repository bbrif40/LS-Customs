/**
 * Help Center — public knowledge-base landing page.
 * Features a hero with search, category cards, and popular articles.
 */
import { useEffect, useMemo, useState } from 'react'
import { Search, CarFront, Wrench, ClipboardList, UserRound, CreditCard, Bug } from 'lucide-react'
import { SearchBox } from '../../components/common/SearchBox'
import { HELP_CATEGORIES, POPULAR_ARTICLES } from '../../data/helpArticles'
import { navigateTo } from '../../utils/navigation'

const CATEGORY_ICONS: Record<string, JSX.Element> = {
  car: <CarFront size={24} />,
  wrench: <Wrench size={24} />,
  clipboard: <ClipboardList size={24} />,
  user: <UserRound size={24} />,
  credit: <CreditCard size={24} />,
  bug: <Bug size={24} />,
}

export function HelpCenter() {
  const [query, setQuery] = useState('')

  useEffect(() => {
    document.title = 'Help Center — LS Customs'
    document.querySelector('meta[name="description"]')?.setAttribute(
      'content',
      'Find answers to common questions about LS Customs rentals, mobile mechanic services, bookings, billing, and account management.'
    )
  }, [])

  const filteredArticles = useMemo(() => {
    if (!query.trim()) return POPULAR_ARTICLES
    const q = query.toLowerCase()
    return POPULAR_ARTICLES.filter(
      (a) => a.title.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
    )
  }, [query])

  const handleSearch = (q: string) => {
    setQuery(q)
  }

  return (
    <div className="public-page">
      <header className="public-hero">
        <h1>How can we <em>help</em> you?</h1>
        <p className="subhead">
          Find answers, guides, and troubleshooting steps for all LS Customs services.
        </p>
      </header>

      <SearchBox
        placeholder="Search help articles..."
        value={query}
        onChange={handleSearch}
      />

      {filteredArticles.length === 0 ? (
        <p className="muted" style={{ textAlign: 'center', marginTop: 42 }}>
          No articles found for "{query}". Try a different search term.
        </p>
      ) : (
        <>
          <div className="category-grid">
            {HELP_CATEGORIES.map((cat) => (
              <a
                key={cat.id}
                href={cat.href}
                className="category-card"
                onClick={(e) => {
                  e.preventDefault()
                  setQuery(cat.label)
                }}
              >
                {CATEGORY_ICONS[cat.icon] ?? <Search size={24} />}
                <strong>{cat.label}</strong>
                <span>{cat.description}</span>
              </a>
            ))}
          </div>

          <h2 style={{ margin: '48px 0 20px', fontSize: 18, letterSpacing: '-0.3px' }}>
            Popular articles
          </h2>
          <div className="article-list">
            {filteredArticles.map((article) => (
              <div key={article.id} className="article-card">
                <div>
                  <a href={article.href}>
                    {article.title}
                    <Search size={14} style={{ display: 'inline', marginLeft: 6 }} />
                  </a>
                  <p className="article-desc">{article.description}</p>
                  <div className="meta">
                    <span className="category-tag">{article.category}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
