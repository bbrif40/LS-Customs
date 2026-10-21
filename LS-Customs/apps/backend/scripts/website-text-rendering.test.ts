import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import {
  resolveWebsiteText,
  websiteTextLookup,
  type WebsiteTextRow,
} from '../../web/src/utils/websiteText.ts'

function row(overrides: Partial<WebsiteTextRow> = {}): WebsiteTextRow {
  return {
    key: 'copy.open',
    section: 'Home',
    label: 'Open',
    default_text: 'Open',
    value: null,
    revision: 1,
    updated_at: null,
    ...overrides,
  }
}

test('copy with the same source text stays isolated by section', () => {
  const lookup = websiteTextLookup([
    row({ key: 'copy.footer.submit', section: 'Footer', default_text: 'Submit', value: 'Join the list' }),
    row({ key: 'copy.help.submit', section: 'Help Center', default_text: 'Submit', value: 'Send request' }),
  ])

  assert.equal(resolveWebsiteText(lookup, 'Footer', 'Submit'), 'Join the list')
  assert.equal(resolveWebsiteText(lookup, 'Help Center', 'Submit'), 'Send request')
  assert.equal(resolveWebsiteText(lookup, 'Bookings', 'Submit'), 'Submit')
})

test('missing overrides fall back to current settings, then to the source text', () => {
  const lookup = websiteTextLookup([])

  assert.equal(resolveWebsiteText(lookup, 'Rentals', 'Book now', undefined, 'Reserve a vehicle'), 'Reserve a vehicle')
  assert.equal(resolveWebsiteText(lookup, 'Rentals', 'Book now'), 'Book now')
})

test('a null override restores the available fallback', () => {
  const lookup = websiteTextLookup([
    row({ section: 'Navigation', default_text: 'Home', value: null }),
  ])

  assert.equal(resolveWebsiteText(lookup, 'Navigation', 'Home', undefined, 'Current home label'), 'Current home label')
  assert.equal(resolveWebsiteText(lookup, 'Navigation', 'Home'), 'Home')
})

test('empty and missing variables leave unresolved placeholder tokens intact', () => {
  const original = 'Hello {name}; reference {reference}'
  const lookup = websiteTextLookup([
    row({ section: 'Profile', default_text: original, value: original }),
  ])

  assert.equal(resolveWebsiteText(lookup, 'Profile', original), original)
  assert.equal(resolveWebsiteText(lookup, 'Profile', original, {}), original)
  assert.equal(resolveWebsiteText(lookup, 'Profile', original, { name: 'Kai' }), 'Hello Kai; reference {reference}')
})

test('provided variables can be reordered by the saved template', () => {
  const original = '{name} owes {amount}'
  const lookup = websiteTextLookup([
    row({ section: 'Bookings', default_text: original, value: 'Amount due: {amount}; customer: {name}' }),
  ])

  assert.equal(
    resolveWebsiteText(lookup, 'Bookings', original, { name: 'Mia', amount: 1250 }),
    'Amount due: 1250; customer: Mia',
  )
})

test('HTML-like values stay plain strings for React to escape at render time', () => {
  const original = 'Description'
  const literal = '<img src=x onerror=alert(1)> & plain text'
  const lookup = websiteTextLookup([
    row({ section: 'Help Center', default_text: original, value: literal }),
  ])

  const resolved = resolveWebsiteText(lookup, 'Help Center', original)
  assert.equal(typeof resolved, 'string')
  assert.equal(resolved, literal)
})

test('numeric price variables are inserted without changing their value or formatting', () => {
  const original = 'Daily rate: ₱{price}; subtotal: ₱{subtotal}'
  const lookup = websiteTextLookup([
    row({ section: 'Rentals', default_text: original, value: 'Rental: ₱{price}; subtotal: ₱{subtotal}' }),
  ])

  assert.equal(
    resolveWebsiteText(lookup, 'Rentals', original, { price: 1250, subtotal: '1,250.00' }),
    'Rental: ₱1250; subtotal: ₱1,250.00',
  )
})

test('the generated catalog has unique keys and lookup pairs, bounded text, and all user-facing sections', async () => {
  const catalogUrl = new URL('../../web/src/data/websiteTextCatalog.json', import.meta.url)
  const catalog = JSON.parse(await readFile(catalogUrl, 'utf8')) as Array<{
    key: string
    section: string
    label: string
    default_text: string
  }>

  assert.ok(catalog.length > 0)
  assert.equal(new Set(catalog.map((entry) => entry.key)).size, catalog.length, 'catalog keys must be unique')
  assert.equal(
    new Set(catalog.map((entry) => `${entry.section}\0${entry.default_text}`)).size,
    catalog.length,
    'section and source text pairs must be unique for lookup',
  )

  for (const entry of catalog) {
    assert.ok(entry.key.trim().length > 0)
    assert.ok(entry.section.trim().length > 0)
    assert.ok(entry.label.trim().length > 0)
    assert.ok(entry.default_text.length > 0)
    assert.ok(Array.from(entry.label).length <= 4000, `${entry.key} label exceeds 4000 characters`)
    assert.ok(Array.from(entry.default_text).length <= 4000, `${entry.key} text exceeds 4000 characters`)
  }

  const sections = new Set(catalog.map((entry) => entry.section))
  for (const expected of ['Workspace', 'Rentals', 'Mechanic', 'Bookings', 'Profile', 'Footer', 'Help Center', 'Navigation']) {
    assert.ok(sections.has(expected), `catalog must include the ${expected} section`)
  }
})

test('published default reset takes precedence over migrated legacy settings', () => {
  const lookup = websiteTextLookup([row({section:'Footer',default_text:'Original company',value:null})])
  assert.equal(resolveWebsiteText(lookup,'Footer','Original company',undefined,'Legacy company',true),'Original company')
  assert.equal(resolveWebsiteText(lookup,'Footer','Unmigrated field',undefined,'Legacy field',true),'Legacy field')
})

test('catalog Unicode text retains the exact source associated with each stable key', async () => {
  const rows = JSON.parse(await readFile(new URL('../../web/src/data/websiteTextCatalog.json', import.meta.url), 'utf8')) as WebsiteTextRow[]
  for (const row of rows) assert.equal(row.key, 'copy.' + createHash('sha256').update(row.section + '\0' + row.default_text).digest('hex').slice(0,24))
})
