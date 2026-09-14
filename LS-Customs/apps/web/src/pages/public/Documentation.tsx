/**
 * Documentation — public page with categorized articles.
 * Features a hero with search, a sticky category sidebar, and article listings.
 */
import { useEffect, useMemo, useState } from 'react'
import { SearchBox } from '../../components/common/SearchBox'
import { DOC_CATEGORIES, DOC_ARTICLES } from '../../data/documentation'
import type { DocArticle } from '../../types'

export function Documentation() {
  const [query, setQuery] = useState('')

  useEffect(() => {
    document.title = 'Documentation — LS Customs'
    document.querySelector('meta[name="description"]')?.setAttribute(
      'content',
      'Browse LS Customs documentation: getting started guides, rental and mechanic service instructions, account settings, and billing help.'
    )
  }, [])

  const filteredArticles = useMemo(() => {
    if (!query.trim()) return DOC_ARTICLES
    const q = query.toLowerCase()
    const result: Record<string, DocArticle[]> = {}
    for (const [categoryId, articles] of Object.entries(DOC_ARTICLES)) {
      const matches = articles.filter(
        (a) => a.title.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
      )
      if (matches.length > 0) result[categoryId] = matches
    }
    return result
  }, [query])

  const hasResults = Object.values(filteredArticles).some((articles) => articles.length > 0)

  return (
    <div className="public-page">
      <header className="public-hero">
        <h1>Documentation</h1>
        <p className="subhead">
          Step-by-step guides, troubleshooting, and best practices for LS Customs.
        </p>
      </header>

      <SearchBox
        placeholder="Search documentation..."
        value={query}
        onChange={setQuery}
      />

      {!hasResults ? (
        <p className="muted" style={{ textAlign: 'center', marginTop: 42 }}>
          No documents found for "{query}". Try a different search term.
        </p>
      ) : (
        <div className="doc-layout">
          <aside className="doc-sidebar">
            <h3>Categories</h3>
            <ul>
              {DOC_CATEGORIES.map((cat) => {
                const count = filteredArticles[cat.id]?.length ?? 0
                if (count === 0) return null
                return (
                  <li key={cat.id}>
                    <a href={`#${cat.id}`} className="active">
                      {cat.label}
                      <span style={{ color: 'var(--muted)', fontSize: '10px', fontWeight: 400, marginLeft: 'auto' }}>
                        ({count})
                      </span>
                    </a>
                  </li>
                )
              })}
            </ul>
          </aside>

          <main className="doc-content">
            {DOC_CATEGORIES.map((cat) => {
              const articles = filteredArticles[cat.id]
              if (!articles || articles.length === 0) return null
              return (
                <section key={cat.id} id={cat.id} className="doc-section">
                  <h2>{cat.label}</h2>
                  <p style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 18 }}>{cat.description}</p>
                  {articles.map((article) => (
                    <div key={article.id} className="doc-article-card">
                      <a href={article.href}>
                        {article.title}
                      </a>
                      <p>{article.description}</p>
                    </div>
                  ))}
                </section>
              )
            })}
          </main>
        </div>
      )}
    </div>
  )
}
