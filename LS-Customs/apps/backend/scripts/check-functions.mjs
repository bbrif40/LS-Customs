import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const localDeno = join(homedir(), '.deno', 'bin', process.platform === 'win32' ? 'deno.exe' : 'deno')
const executable = process.env.DENO_PATH || (existsSync(localDeno) ? localDeno : 'deno')
const mode = process.argv[2] ?? 'check'
const endpoints = readdirSync('supabase/functions', { withFileTypes: true })
  .filter(entry => entry.isDirectory() && !entry.name.startsWith('_'))
  .map(entry => `supabase/functions/${entry.name}/index.ts`).filter(existsSync)
const args = mode === 'test'
  ? ['test', '--allow-env', '--allow-read=supabase/functions', 'supabase/functions/_shared/qa_test.ts', 'supabase/functions/_shared/edge_contract_test.ts', 'supabase/functions/_shared/customer_phone_otp_test.ts']
  : mode === 'lint'
    ? ['lint', '--rules-exclude=no-explicit-any,no-unused-vars,require-await,no-empty', ...endpoints]
    : ['check', ...endpoints]
const result = spawnSync(executable, args, { stdio: 'inherit' })
if (result.error) console.error('Install Deno 2 or set DENO_PATH to run backend checks:', result.error.message)
process.exit(result.status ?? 1)
