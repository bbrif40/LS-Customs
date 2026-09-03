// One-off script to apply a single migration to the local Supabase DB.
// Reads the SQL file and runs it as a single transaction. Idempotent —
// CREATE OR REPLACE FUNCTION / CREATE TRIGGER are no-ops on re-run; the
// only thing we'd duplicate is the GRANT line, which is also safe.

import { readFile } from 'node:fs/promises'
import { Client } from 'pg'
import path from 'node:path'

const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:55422/postgres'
const MIGRATION = path.resolve(
  'supabase/migrations/20260902120000_notification_triggers_tickets_payments.sql',
)

const sql = await readFile(MIGRATION, 'utf8')
console.log(`Migration: ${path.basename(MIGRATION)} (${sql.length} bytes)`)

const client = new Client({ connectionString: DB_URL })
try {
  await client.connect()
  console.log('Connected to local Postgres.')
  await client.query('begin')
  await client.query(sql)
  await client.query('commit')
  console.log('✅ Migration applied.')
} catch (err) {
  await client.query('rollback').catch(() => {})
  console.error('❌ Migration failed:', err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
