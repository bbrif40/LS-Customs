import { useMemo, useState } from 'react'
import { Check, Loader2, RefreshCw, RotateCcw, Save, Search } from 'lucide-react'
import { useWebsiteTextCatalog } from '../../hooks/useWebsiteText'
import { supabase } from '../../supabaseClient'

interface WebsiteTextRow {
  key: string
  section: string
  label: string
  default_text: string
  value: string | null
  revision: number
  updated_at: string | null
}

type DraftValue = string | null
type ConflictState = 'refresh-required' | 'review-latest' | null

interface EditorState {
  drafts: Record<string, DraftValue>
  baseRevisions: Record<string, number>
}

const EMPTY_EDITOR_STATE: EditorState = { drafts: {}, baseRevisions: {} }
const PAGE_SIZE = 40

const SECTION_ORDER = [
  'Workspace',
  'Rentals',
  'Mechanic',
  'Bookings',
  'Profile',
  'Footer',
  'Help center',
  'Navigation',
  'Shared',
]

function isRevisionConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const failure = error as { code?: string; message?: string; details?: string }
  const description = `${failure.message ?? ''} ${failure.details ?? ''}`
  return failure.code === '40001' || /conflict|revision|concurrent|stale version|changed since/i.test(description)
}

function serverValidationMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const failure = error as { code?: string; message?: string }
  if (failure.code !== '22023') return null
  const message = failure.message?.trim().split(/\r?\n/, 1)[0].replace(/^ERROR:\s*/i, '').slice(0, 240)
  return message || 'One or more text values do not meet the content rules.'
}

function editorValue(row: WebsiteTextRow, draft: DraftValue | undefined): string {
  if (draft === null) return row.default_text
  if (draft !== undefined) return draft
  return row.value ?? row.default_text
}

function sectionSortIndex(section: string): number {
  const index = SECTION_ORDER.findIndex(name => name.toLowerCase() === section.toLowerCase())
  return index === -1 ? SECTION_ORDER.length : index
}

export function AdminWebsiteText() {
  const { rows, loading, error, refresh } = useWebsiteTextCatalog()
  const [editorState, setEditorState] = useState<EditorState>(EMPTY_EDITOR_STATE)
  const { drafts, baseRevisions } = editorState
  const [query, setQuery] = useState('')
  const [sectionFilter, setSectionFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [conflict, setConflict] = useState<ConflictState>(null)

  const draftCount = Object.keys(drafts).length
  const sections = useMemo(() => {
    const available = [...new Set(rows.map(row => row.section))]
    return available.sort((a, b) => {
      const order = sectionSortIndex(a) - sectionSortIndex(b)
      return order || a.localeCompare(b)
    })
  }, [rows])

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return rows.filter(row => {
      if (sectionFilter !== 'all' && row.section !== sectionFilter) return false
      if (!needle) return true
      const current = editorValue(row, drafts[row.key])
      return [row.label, row.section, current, row.default_text].some(value => value.toLocaleLowerCase().includes(needle))
    })
  }, [drafts, query, rows, sectionFilter])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, pageCount)
  const pageRows = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const rowsBySection = useMemo(() => {
    const grouped = new Map<string, WebsiteTextRow[]>()
    for (const row of pageRows) {
      const group = grouped.get(row.section) ?? []
      group.push(row)
      grouped.set(row.section, group)
    }
    return [...grouped.entries()].sort(([a], [b]) => {
      const order = sectionSortIndex(a) - sectionSortIndex(b)
      return order || a.localeCompare(b)
    })
  }, [pageRows])

  const pageControls = (position: 'top' | 'bottom') => pageCount > 1 && (
    <nav className="awt-page-controls" aria-label={`Website text pages, ${position}`}>
      <button type="button" className="awt-button awt-button--secondary" onClick={() => setCurrentPage(page => Math.max(1, page - 1))} disabled={safePage === 1}>
        Previous
      </button>
      <span>Page {safePage} of {pageCount}</span>
      <button type="button" className="awt-button awt-button--secondary" onClick={() => setCurrentPage(page => Math.min(pageCount, page + 1))} disabled={safePage === pageCount}>
        Next
      </button>
    </nav>
  )

  const updateDraft = (row: WebsiteTextRow, value: string) => {
    setEditorState(current => {
      const nextDrafts = { ...current.drafts }
      const nextRevisions = { ...current.baseRevisions }
      if (value === (row.value ?? row.default_text)) {
        delete nextDrafts[row.key]
        delete nextRevisions[row.key]
      } else {
        if (!Object.prototype.hasOwnProperty.call(nextDrafts, row.key)) nextRevisions[row.key] = row.revision
        nextDrafts[row.key] = value
      }
      return { drafts: nextDrafts, baseRevisions: nextRevisions }
    })
    setSaveError('')
    setSaveMessage('')
  }

  const restoreDefault = (row: WebsiteTextRow) => {
    setEditorState(current => {
      const nextDrafts = { ...current.drafts }
      const nextRevisions = { ...current.baseRevisions }
      if (row.value === null) {
        delete nextDrafts[row.key]
        delete nextRevisions[row.key]
      } else {
        if (!Object.prototype.hasOwnProperty.call(nextDrafts, row.key)) nextRevisions[row.key] = row.revision
        nextDrafts[row.key] = null
      }
      return { drafts: nextDrafts, baseRevisions: nextRevisions }
    })
    setSaveError('')
    setSaveMessage('')
  }

  const discardDrafts = () => {
    setEditorState(EMPTY_EDITOR_STATE)
    setConflict(null)
    setSaveError('')
    setSaveMessage('')
  }

  const refreshCatalog = async () => {
    setRefreshing(true)
    setSaveError('')
    setSaveMessage('')
    try {
      await refresh()
    } catch {
      setSaveError('The latest text could not be loaded. Please try again.')
    } finally {
      setRefreshing(false)
    }
  }

  const refreshAfterConflict = async () => {
    setRefreshing(true)
    setSaveError('')
    try {
      await refresh()
      setConflict('review-latest')
    } catch {
      setSaveError('The latest text could not be loaded. Your drafts are still safe.')
    } finally {
      setRefreshing(false)
    }
  }

  const saveChanges = async () => {
    if (saving || draftCount === 0 || conflict) return
    const pendingRows = rows.filter(row => Object.prototype.hasOwnProperty.call(drafts, row.key))
    if (pendingRows.length !== draftCount || pendingRows.some(row => baseRevisions[row.key] === undefined)) {
      setConflict('refresh-required')
      setSaveError('Your drafts no longer match the loaded text versions. Refresh and review the latest values before saving.')
      return
    }
    const changes = pendingRows.map(row => ({
      key: row.key,
      value: drafts[row.key] ?? null,
      revision: baseRevisions[row.key]!,
    }))

    setSaving(true)
    setSaveError('')
    setSaveMessage('')
    try {
      const { error: rpcError } = await supabase.rpc('save_website_text', { p_changes: changes })
      if (rpcError) {
        if (isRevisionConflict(rpcError)) {
          setConflict('refresh-required')
          setSaveError('Some text changed since it was loaded. Your drafts are safe. Refresh the latest version to review before saving again.')
        } else {
          setSaveError(serverValidationMessage(rpcError) ?? 'Changes could not be saved. Please try again.')
        }
        return
      }

      setEditorState(EMPTY_EDITOR_STATE)
      setConflict(null)
      setSaveMessage('Changes saved. They are live on the website.')
      try {
        await refresh()
      } catch {
        setSaveError('Your changes are live, but the catalog could not be refreshed. Reload when ready.')
      }
    } catch (failure) {
      setSaveError(serverValidationMessage(failure) ?? 'Changes could not be saved. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading && rows.length === 0) {
    return <div className="admin-main awt-loading"><Loader2 size={28} className="spin" aria-hidden="true" /><span>Loading website text…</span></div>
  }

  if (error && rows.length === 0) {
    return (
      <main className="admin-main awt-screen">
        <header className="awt-header">
          <div><span className="awt-eyebrow">Content</span><h1>Website text</h1><p>Update the words customers see across the site.</p></div>
        </header>
        <div className="awt-empty-state" role="alert">
          <strong>Website text could not be loaded.</strong>
          <button type="button" className="awt-button awt-button--secondary" onClick={() => void refreshCatalog()} disabled={refreshing}>
            <RefreshCw size={15} aria-hidden="true" /> Try again
          </button>
        </div>
        {saveError && <p className="awt-feedback awt-feedback--error" role="alert">{saveError}</p>}
      </main>
    )
  }

  return (
    <main className="admin-main awt-screen">
      <header className="awt-header">
        <div>
          <span className="awt-eyebrow">Content</span>
          <h1>Website text</h1>
          <p>Edit customer-facing wording. Booking prices, customer data, and versioned transaction terms are managed separately.</p>
        </div>
        <button
          type="button"
          className="awt-button awt-button--secondary awt-refresh-button"
          onClick={() => void refreshCatalog()}
          disabled={refreshing || saving || draftCount > 0}
          title={draftCount > 0 ? 'Discard local edits before refreshing' : undefined}
        >
          <RefreshCw size={15} aria-hidden="true" className={refreshing ? 'awt-spin' : undefined} />
          Refresh
        </button>
      </header>

      <div className="awt-toolbar">
        <label className="awt-search">
          <Search size={16} aria-hidden="true" />
          <span className="awt-visually-hidden">Search website text</span>
          <input value={query} onChange={event => { setQuery(event.target.value); setCurrentPage(1) }} placeholder="Search labels and text…" />
        </label>
        <label className="awt-section-filter">
          <span className="awt-visually-hidden">Filter by section</span>
          <select value={sectionFilter} onChange={event => { setSectionFilter(event.target.value); setCurrentPage(1) }}>
            <option value="all">All sections</option>
            {sections.map(section => <option key={section} value={section}>{section}</option>)}
          </select>
        </label>
      </div>

      {error && <p className="awt-feedback awt-feedback--error" role="alert">Some website text may be out of date. Refresh to try again.</p>}
      {saveError && <p className="awt-feedback awt-feedback--error" role="alert">{saveError}</p>}
      {saveMessage && <p className="awt-feedback awt-feedback--success" role="status"><Check size={15} aria-hidden="true" />{saveMessage}</p>}

      {conflict && (
        <section className="awt-conflict" aria-labelledby="awt-conflict-title">
          <div>
            <h2 id="awt-conflict-title">This text changed while you were editing</h2>
            {conflict === 'refresh-required' ? (
              <p>Your drafts are retained. Load the latest saved text to compare before deciding whether to apply your drafts.</p>
            ) : (
              <p>The latest saved values are shown with your drafts below. Review the differences, then choose whether to apply your drafts to this version.</p>
            )}
          </div>
          {conflict === 'refresh-required' ? (
            <button type="button" className="awt-button awt-button--secondary" onClick={() => void refreshAfterConflict()} disabled={refreshing}>
              <RefreshCw size={15} aria-hidden="true" className={refreshing ? 'awt-spin' : undefined} />
              {refreshing ? 'Refreshing…' : 'Refresh latest text'}
            </button>
          ) : (
            <button type="button" className="awt-button awt-button--secondary" onClick={() => {
              setEditorState(current => {
                const nextRevisions = { ...current.baseRevisions }
                for (const key of Object.keys(current.drafts)) {
                  const latestRow = rows.find(row => row.key === key)
                  if (latestRow) nextRevisions[key] = latestRow.revision
                }
                return { ...current, baseRevisions: nextRevisions }
              })
              setConflict(null)
              setSaveError('')
            }}>
              Use my drafts with latest values
            </button>
          )}
        </section>
      )}

      {filteredRows.length > 0 && (
        <div className="awt-pagination">
          <span>Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredRows.length)} of {filteredRows.length} items</span>
          {pageControls('top')}
        </div>
      )}

      {rowsBySection.length === 0 ? (
        <div className="awt-empty-state">No text matches those filters.</div>
      ) : (
        <div className="awt-section-list">
          {rowsBySection.map(([section, sectionRows]) => (
            <section className="awt-section" key={section} aria-labelledby={`awt-section-${section.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}>
              <div className="awt-section-heading">
                <h2 id={`awt-section-${section.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}>{section}</h2>
                <span>{sectionRows.length} {sectionRows.length === 1 ? 'item' : 'items'}</span>
              </div>
              <div className="awt-row-list">
                {sectionRows.map(row => {
                  const draft = Object.prototype.hasOwnProperty.call(drafts, row.key) ? drafts[row.key] : undefined
                  const text = editorValue(row, draft)
                  const hasDraft = draft !== undefined
                  const multiline = text.length > 110 || text.includes('\n') || row.default_text.length > 110 || row.default_text.includes('\n')
                  const fieldId = `awt-field-${row.key.replace(/[^a-z0-9_-]/gi, '-')}`
                  return (
                    <article className={`awt-row${hasDraft ? ' awt-row--draft' : ''}`} key={row.key}>
                      <div className="awt-row-heading">
                        <div>
                          <h3>{row.label}</h3>
                          <span className={`awt-state${hasDraft ? ' awt-state--draft' : ''}`}>
                            {hasDraft ? (draft === null ? 'Default in draft' : 'Unsaved draft') : row.value === null ? 'Using default' : 'Customized'}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="awt-restore-button"
                          onClick={() => restoreDefault(row)}
                          disabled={text === row.default_text || saving}
                          aria-label={`Restore ${row.label} to its default text`}
                        >
                          <RotateCcw size={14} aria-hidden="true" /> Restore default
                        </button>
                      </div>

                      <div className="awt-row-content">
                        <div className="awt-editor-column">
                          <label className="awt-field-label" htmlFor={fieldId}>{conflict === 'review-latest' ? 'Your draft' : 'Current text'}</label>
                          {multiline ? (
                            <textarea id={fieldId} value={text} onChange={event => updateDraft(row, event.target.value)} rows={3} spellCheck disabled={saving} />
                          ) : (
                            <input id={fieldId} type="text" value={text} onChange={event => updateDraft(row, event.target.value)} spellCheck disabled={saving} />
                          )}
                          <div className="awt-default-text">
                            <span>Default</span>
                            <p>{row.default_text || <em>Blank</em>}</p>
                          </div>
                          {conflict === 'review-latest' && (
                            <div className="awt-latest-text">
                              <span>Latest saved</span>
                              <p>{(row.value ?? row.default_text) || <em>Blank</em>}</p>
                            </div>
                          )}
                        </div>
                        <div className="awt-preview-column">
                          <span className="awt-field-label">Live preview</span>
                          <div className="awt-preview" aria-live="polite">{text || <span className="awt-preview-empty">Blank text</span>}</div>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {pageControls('bottom')}

      {draftCount > 0 && (
        <div className="awt-savebar" role="region" aria-label="Unsaved website text changes">
          <div className="awt-savebar-copy">
            <strong>{draftCount} unsaved {draftCount === 1 ? 'change' : 'changes'}</strong>
            <span>Saved text updates the public website.</span>
          </div>
          <div className="awt-savebar-actions">
            <button type="button" className="awt-button awt-button--quiet" onClick={discardDrafts} disabled={saving}>Discard</button>
            <button type="button" className="awt-button awt-button--save" onClick={() => void saveChanges()} disabled={saving || Boolean(conflict)}>
              {saving ? <Loader2 size={16} className="awt-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
