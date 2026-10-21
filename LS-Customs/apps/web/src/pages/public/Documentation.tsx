import { useWebsiteText } from "../../hooks/useWebsiteText"
/**
 * Documentation — public page with categorized articles.
 * Features a hero with search, a sticky category sidebar, and article listings.
 */
import { useEffect, useState } from 'react'
import { SearchBox } from '../../components/common/SearchBox'
import { DOC_CATEGORIES, DOC_ARTICLES } from '../../data/documentation'
import type { DocArticle } from '../../types'

export function Documentation() {
  const websiteText = useWebsiteText("Help Center")

  const [query, setQuery] = useState('')

  const categories = DOC_CATEGORIES.map((category) => ({
    ...category,
    label: websiteText(category.label),
    description: websiteText(category.description),
  }))
  const displayedArticles: Record<string, DocArticle[]> = Object.fromEntries(
    Object.entries(DOC_ARTICLES).map(([categoryId, articles]) => [
      categoryId,
      articles.map((article) => ({
        ...article,
        title: websiteText(article.title),
        description: websiteText(article.description),
      })),
    ]),
  )
  const search = query.trim().toLowerCase()
  const filteredArticles: Record<string, DocArticle[]> = {}
  for (const [categoryId, articles] of Object.entries(displayedArticles)) {
    const matches = search
      ? articles.filter((article) => article.title.toLowerCase().includes(search) || article.description.toLowerCase().includes(search))
      : articles
    if (matches.length > 0) filteredArticles[categoryId] = matches
  }
  const hasResults = Object.values(filteredArticles).some((articles) => articles.length > 0)

  useEffect(() => {
    document.title = 'Documentation — LS Customs'
    document.querySelector('meta[name="description"]')?.setAttribute(
      'content',
      'Browse LS Customs documentation: getting started guides, rental and mechanic service instructions, account settings, and billing help.'
    )
  }, [])

  return (
    <div className="public-page">
      <header className="public-hero">
        <h1>{websiteText("Documentation")}</h1>
        <p className="subhead">{websiteText("Step-by-step guides, troubleshooting, and best practices for LS Customs.")}</p>
      </header>

      <SearchBox
        placeholder={websiteText("Search documentation...")}
        value={query}
        onChange={setQuery}
      />

      {!hasResults ? (
        <p className="muted" style={{ textAlign: 'center', marginTop: 42 }}>{websiteText("No documents found for \"")}{query}{websiteText("\". Try a different search term.")}</p>
      ) : (
        <div className="doc-layout">
          <aside className="doc-sidebar">
            <h3>{websiteText("Categories")}</h3>
            <ul>
              {categories.map((cat) => {
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
            {categories.map((cat) => {
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
