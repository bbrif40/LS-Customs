// Apply an explicitly selected SQL migration to the local Supabase container.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { runLocalSql } from './scripts/local-postgres.ts'

const input = process.argv[2]
if (!input) throw new Error('Usage: node apply_migration.ts supabase/migrations/<file>.sql')
const migrations = path.resolve('supabase/migrations')
const target = path.resolve(input)
const relative = path.relative(migrations, target)
if (relative.startsWith('..') || path.isAbsolute(relative) || !target.endsWith('.sql')) throw new Error('Choose a SQL file inside supabase/migrations')
runLocalSql(await readFile(target, 'utf8'))
