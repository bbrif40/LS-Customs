import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createTestDatabase } from './test-database.ts'

const { db, customer, admin, as, fails, isolated } = createTestDatabase(7)
const fixtureRows = [
  { key: 'home.title', section: 'home', label: 'Home title', default_text: 'Original copy' },
  { key: 'home.subtitle', section: 'home', label: 'Home subtitle', default_text: 'Supporting copy' },
  { key: 'footer.greeting', section: 'footer', label: 'Greeting', default_text: 'Welcome {name}, reference {ref}.' },
]

async function seedWebsiteText() {
  for (const row of fixtureRows) {
    await db.query(
      'insert into public.website_text(key, section, label, default_text) values ($1, $2, $3, $4)',
      [row.key, row.section, row.label, row.default_text],
    )
  }
}

function saveSql(changes: Array<{ key: string; value: string | null; revision: number }>) {
  const json = JSON.stringify(changes).replaceAll("'", "''")
  return `select * from public.save_website_text('${json}'::jsonb)`
}

isolated('website text is publicly readable and clients cannot write directly', async () => {
  await seedWebsiteText()

  await as('anon')
  assert.equal((await db.query('select count(*)::int as count from public.website_text')).rows[0].count, 3)
  await fails("insert into public.website_text(key,section,label,default_text) values('x','x','x','x')", /permission denied|row-level security/)
  await fails("update public.website_text set value='changed' where key='home.title'", /permission denied|row-level security/)
  await fails(saveSql([{ key: 'home.title', value: 'Anonymous edit', revision: 1 }]), /permission denied/)

  await as('authenticated', customer)
  assert.equal((await db.query('select count(*)::int as count from public.website_text')).rows[0].count, 3)
  await fails("update public.website_text set value='changed' where key='home.title'", /permission denied|row-level security/)
  await fails("delete from public.website_text where key='home.title'", /permission denied|row-level security/)
  await fails(saveSql([{ key: 'home.title', value: 'Customer edit', revision: 1 }]), /Administrator access required/)
})

isolated('admins save changes with revisions and an audit record; unchanged values do not increment', async () => {
  await seedWebsiteText()
  await as('authenticated', admin)

  const saved = await db.query(saveSql([{ key: 'home.title', value: 'Updated copy', revision: 1 }]))
  assert.equal(saved.rows.length, 1)
  assert.equal(saved.rows[0].value, 'Updated copy')
  assert.equal(saved.rows[0].revision, 2)
  assert.equal(saved.rows[0].updated_by, admin)

  const audit = await db.query("select admin_id, action_type, record_type, record_id, details from public.admin_audit_logs where action_type='website_text_changed'")
  assert.equal(audit.rows.length, 1)
  assert.equal(audit.rows[0].admin_id, admin)
  assert.equal(audit.rows[0].record_type, 'website_text')
  assert.equal(audit.rows[0].record_id, 'home.title')
  assert.equal(audit.rows[0].details.before_text, 'Original copy')
  assert.equal(audit.rows[0].details.after_text, 'Updated copy')

  const unchanged = await db.query(saveSql([{ key: 'home.title', value: 'Updated copy', revision: 2 }]))
  assert.equal(unchanged.rows.length, 0)
  assert.equal((await db.query("select revision from public.website_text where key='home.title'")).rows[0].revision, 2)
  assert.equal((await db.query("select count(*)::int as count from public.admin_audit_logs where action_type='website_text_changed'")).rows[0].count, 1)
})

isolated('a stale revision rejects a whole batch without writes or audit records', async () => {
  await seedWebsiteText()
  await as('authenticated', admin)

  await fails(saveSql([
    { key: 'home.title', value: 'Would have changed', revision: 1 },
    { key: 'home.subtitle', value: 'Stale edit', revision: 9 },
  ]), /Revision conflict/)

  const { rows } = await db.query("select key, value, revision from public.website_text where key in ('home.title','home.subtitle') order by key")
  assert.deepEqual(rows.map((row) => [row.key, row.value, row.revision]), [
    ['home.subtitle', null, 1],
    ['home.title', null, 1],
  ])
  assert.equal((await db.query("select count(*)::int as count from public.admin_audit_logs where action_type='website_text_changed'")).rows[0].count, 0)
})

isolated('null resets to the default and increments the revision when the override changes', async () => {
  await seedWebsiteText()
  await db.query("update public.website_text set value='Customized copy' where key='home.title'")
  await as('authenticated', admin)

  const { rows } = await db.query(saveSql([{ key: 'home.title', value: null, revision: 1 }]))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].value, null)
  assert.equal(rows[0].revision, 2)
  const audit = await db.query("select details from public.admin_audit_logs where action_type='website_text_changed'")
  assert.equal(audit.rows[0].details.before_text, 'Customized copy')
  assert.equal(audit.rows[0].details.after_text, 'Original copy')
})

isolated('placeholder tokens are preserved and saved text remains literal', async () => {
  await seedWebsiteText()
  await as('authenticated', admin)

  await fails(saveSql([{ key: 'footer.greeting', value: 'Welcome {name}.', revision: 1 }]), /Placeholder tokens must be preserved/)
  const literal = 'Use <b>{name}</b> and {ref} as text.'
  const { rows } = await db.query(saveSql([{ key: 'footer.greeting', value: literal, revision: 1 }]))
  assert.equal(rows[0].value, literal)
  assert.equal(rows[0].revision, 2)
})

isolated('invalid keys, duplicate keys, and values outside the size limit are rejected', async () => {
  await seedWebsiteText()
  await as('authenticated', admin)

  await fails(saveSql([{ key: 'home.typo', value: 'Unknown', revision: 1 }]), /Unknown website text key/)
  await fails(saveSql([
    { key: 'home.title', value: 'First', revision: 1 },
    { key: 'home.title', value: 'Second', revision: 1 },
  ]), /Duplicate website text key/)
  await fails(saveSql([{ key: 'home.title', value: '', revision: 1 }]), /between 1 and 4000 characters/)
  await fails(saveSql([{ key: 'home.title', value: 'x'.repeat(4001), revision: 1 }]), /between 1 and 4000 characters/)
})

isolated('catalog seed imports all copy and preserves configured legacy wording', async () => {
  await db.exec(`
    create table if not exists public.customer_site_settings (
      id smallint primary key default 1 check (id = 1),
      settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object')
    )
  `)
  await db.query(
    `insert into public.customer_site_settings(id, settings)
     values (1, $1::jsonb)
     on conflict (id) do update set settings = excluded.settings`,
    [JSON.stringify({ companyName: 'Fixture Company', bannerText: 'Fixture banner message' })],
  )

  const migrationPath = new URL('../supabase/migrations/20261021111000_website_text_catalog.sql', import.meta.url)
  const catalogPath = new URL('../../web/src/data/websiteTextCatalog.json', import.meta.url)
  const migration = await readFile(migrationPath, 'utf8')
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8')) as Array<{
    key: string
    section: string
    label: string
    default_text: string
  }>
  const legacyUpdateMarker = '-- Preserve the currently displayed banner/business wording from existing settings.'
  const insertEnd = migration.indexOf(legacyUpdateMarker)
  assert.ok(insertEnd > 0, 'catalog migration should separate initial settings mapping from its insert seed')

  await db.exec(migration)

  assert.equal((await db.query('select count(*)::int as count from public.website_text')).rows[0].count, catalog.length)
  const company = catalog.find((entry) => entry.section === 'Footer' && entry.label === 'Company Name')
  const banner = catalog.find((entry) => entry.section === 'Workspace' && entry.label === 'Banner Text')
  const faq = catalog.find((entry) => entry.section === 'Help Center' && entry.default_text.endsWith('?'))
  assert.ok(company)
  assert.ok(banner)
  assert.ok(faq)

  const companyRow = (await db.query('select value from public.website_text where key = $1', [company.key])).rows[0]
  assert.equal(companyRow.value, 'Fixture Company')
  const bannerRow = (await db.query('select value from public.website_text where key = $1', [banner.key])).rows[0]
  assert.equal(bannerRow.value, 'Fixture banner message')
  const faqRow = (await db.query('select value from public.website_text where key = $1', [faq.key])).rows[0]
  assert.equal(faqRow.value, null)

  await db.query("update public.website_text set value = 'Manual company override' where key = $1", [company.key])
  await db.exec(migration.slice(0, insertEnd))
  assert.equal(
    (await db.query('select value from public.website_text where key = $1', [company.key])).rows[0].value,
    'Manual company override',
  )
})
