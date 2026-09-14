/**
 * Privacy Policy — public legal page.
 * Renders the Privacy sections with a sticky table of contents sidebar.
 */
import { useEffect } from 'react'
import { TableOfContents } from '../../components/common/TableOfContents'
import { privacySections, PRIVACY_LAST_UPDATED } from '../../data/legal'

export function PrivacyPolicy() {
  useEffect(() => {
    document.title = 'Privacy Policy — LS Customs'
    document.querySelector('meta[name="description"]')?.setAttribute(
      'content',
      'Read the LS Customs Privacy Policy to understand what data we collect, how we use it, and your rights.'
    )
  }, [])

  return (
    <div className="public-page">
      <header className="contact-hero">
        <h1>Privacy <em>Policy</em></h1>
        <p className="subhead">
          We are committed to protecting your personal data and being transparent
          about how we collect, use, and share information when you use LS Customs.
        </p>
        <p className="last-updated">Last updated: {PRIVACY_LAST_UPDATED}</p>
      </header>

      <div className="legal-page">
        <TableOfContents items={privacySections} />

        <article className="legal-content">
          {privacySections.map((section) => (
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
