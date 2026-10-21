import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/** Local Supabase already supplies psql; no separate pg runtime is needed. */
export function runLocalSql(sql: string): void {
  const config = readFileSync('supabase/config.toml', 'utf8')
  const project = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1]
  if (!project) throw new Error('Local Supabase project_id is missing')
  const container = process.env.LOCAL_SUPABASE_DB_CONTAINER ?? `supabase_db_${project}`
  const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '--single-transaction', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], { input: sql, encoding: 'utf8' })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error('Local SQL failed. Start the Supabase Docker stack and check the SQL input.')
}
