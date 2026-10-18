import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('newsletter validates, deduplicates, and keeps subscriber data private', async () => {
  const db = new PGlite()
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;')
    await db.exec(await readFile(new URL('../supabase/migrations/20261018140000_newsletter_subscriptions.sql', import.meta.url), 'utf8'))
    await db.exec("set role anon; select public.subscribe_newsletter('  Person@Example.com  '); select public.subscribe_newsletter('person@example.com');")
    await assert.rejects(db.query('select * from public.newsletter_subscriptions'), /permission denied/)
    await assert.rejects(db.query("insert into public.newsletter_subscriptions (email) values ('direct@example.com')"), /permission denied/)
    for (const email of ['', 'invalid', 'a@b', 'a b@example.com', null, `${'a'.repeat(250)}@example.com`]) {
      await assert.rejects(db.query('select public.subscribe_newsletter($1)', [email]), /valid email/)
    }
    await db.exec("reset role; set role authenticated; select public.subscribe_newsletter('member@example.com'); reset role;")
    const { rows } = await db.query('select email, source, consented_at from public.newsletter_subscriptions order by email')
    assert.deepEqual(rows.map(row => row.email), ['member@example.com', 'person@example.com'])
    assert.ok(rows.every(row => row.source === 'website_footer' && row.consented_at))
  } finally {
    await db.close()
  }
})
