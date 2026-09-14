/**
 * Terms of Service — public legal page.
 * Renders the Terms sections with a sticky table of contents sidebar.
 */
import { useEffect } from 'react'
import { TableOfContents } from '../../components/common/TableOfContents'
import { termsSections, TERMS_LAST_UPDATED } from '../../data/legal'

export function Terms() {
  useEffect(() => {
    document.title = 'Terms of Service — LS Customs'
    document.querySelector('meta[name="description"]')?.setAttribute(
      'content',
      'Read the LS Customs Terms of Service governing the use of our automotive rental and mobile mechanic platform.'
    )
  }, [])

  return (
    <div className="public-page">
      <header className="contact-hero">
        <h1>Terms of <em>Service</em></h1>
        <p className="subhead">
          These terms govern your use of the LS Customs platform. Please read
          them carefully before booking any service.
        </p>
        <p className="last-updated">Last updated: {TERMS_LAST_UPDATED}</p>
      </header>

      <div className="legal-page">
        <TableOfContents items={termsSections} />

        <article className="legal-content">
          {termsSections.map((section) => (
            <section key={section.id} id={section.id}>
              <h2 id={`${section.id}-title`}>{section.title}</h2>
              {section.content.split('\n').map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </section>
          ))}
        </article>
      </div>
    </div>
  )
}
