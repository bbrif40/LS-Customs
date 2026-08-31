#!/usr/bin/env node
/**
 * check-secrets.mjs
 *
 * Pre-commit guard: scans staged files for common secret patterns
 * (OpenRouter, Stripe, Supabase service-role JWTs, Google, Twilio,
 *  SendGrid, PayMongo, GitHub PATs, generic high-entropy KEY=… values).
 *
 * Scans only the staged portion of files (lines that are part of the
 * staged diff) so already-tracked secrets in the working tree don't
 * cause every commit to fail.
 *
 * Run directly:    node apps/backend/scripts/check-secrets.mjs
 * Run via hook:    .githooks/pre-commit invokes this automatically
 *
 * Exits 0 if clean, 1 if any match found.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import process from 'node:process';

// Each pattern: { name, regex, description }
// Order matters — most specific providers first so a real key is reported
// with the right label, not a generic fallback.
const PATTERNS = [
  { name: 'OpenRouter',         regex: /sk-or-v1-[a-f0-9]{64}\b/,                 desc: 'OpenRouter API key' },
  { name: 'OpenRouter (alt)',   regex: /sk-or-[A-Za-z0-9_-]{20,}/,                desc: 'OpenRouter key (older format)' },
  { name: 'Stripe live',        regex: /sk_live_[A-Za-z0-9]{20,}/,               desc: 'Stripe LIVE secret key — do not commit' },
  { name: 'Stripe test',        regex: /sk_test_[A-Za-z0-9]{20,}/,               desc: 'Stripe test secret key' },
  { name: 'Stripe restricted',  regex: /rk_live_[A-Za-z0-9]{20,}/,               desc: 'Stripe restricted key' },
  { name: 'Supabase service role JWT', regex: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, desc: 'Supabase JWT — verify it is anon, not service_role' },
  { name: 'Google OAuth secret', regex: /GOCSPX-[A-Za-z0-9_-]{20,}/,              desc: 'Google OAuth client secret' },
  { name: 'Google Maps API key', regex: /AIza[A-Za-z0-9_-]{30,}/,                 desc: 'Google Maps API key' },
  { name: 'SendGrid',            regex: /SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/, desc: 'SendGrid API key' },
  { name: 'Twilio SID',          regex: /\bSK[abcdef0-9]{32}\b/,                  desc: 'Twilio API key SID' },
  { name: 'Twilio Account SID',  regex: /\bAC[abcdef0-9]{32}\b/,                  desc: 'Twilio Account SID' },
  { name: 'PayMongo',            regex: /sk_(?:test|live)_paymongo_[A-Za-z0-9]{16,}/, desc: 'PayMongo secret key' },
  { name: 'GitHub PAT',          regex: /ghp_[A-Za-z0-9]{36}\b/,                  desc: 'GitHub personal access token' },
  { name: 'GitHub fine-grained', regex: /github_pat_[A-Za-z0-9_]{82}\b/,          desc: 'GitHub fine-grained PAT' },
  // Generic fallback: a 40+ char value assigned to KEY/TOKEN/SECRET
  { name: 'Generic long KEY value', regex: /(?:KEY|TOKEN|SECRET|PASSWORD)\s*=\s*["']?([A-Za-z0-9_\-]{40,})["']?/i, desc: 'Long random-looking value assigned to a secret-ish variable' },
];

// Paths we never scan — these contain test fixtures, lock files, or
// generated artifacts where patterns can legitimately appear.
const IGNORE_PATH_PATTERNS = [
  /node_modules\//,
  /\.git\//,
  /dist\//,
  /build\//,
  /\.deno\//,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /\.claude\//,            // internal session scratch
  /\.worktrees?\//,
  /apps\/backend\/scripts\/check-secrets\.mjs$/, // self-reference
  /\.env\.example$/,       // documentation only, values are empty
];

// Per-line exemptions: short placeholders that look like secrets but
// are actually safe (e.g. the placeholder I just wrote into .env).
// Matched as a *case-insensitive contains* against the line.
const ALLOWED_LINE_FRAGMENTS = [
  'replace-me-with-rotated-key',
  'your-sendgrid-api-key-here',
  'your-twilio-account-sid',
  'your-twilio-auth-token',
  'your-google-api-key',
  'sk_test_local_development_placeholder',
  'whsec_test_local_development_placeholder',
  'sk_test_paymongo_local_dev',
];

function repoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch {
    return process.cwd();
  }
}

function listStagedFiles() {
  // --diff-filter=ACMR: Added, Copied, Modified, Renamed
  // -z: NUL-separated so filenames with spaces are safe
  const out = execFileSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
    { encoding: 'utf8', cwd: repoRoot() },
  );
  return out.split('\0').filter(Boolean);
}

function getStagedLinesForFile(file, repoRootPath) {
  // For each staged file, fetch the *added* lines (lines starting with '+'
  // in the unified diff) and return them as 1-indexed line numbers of the
  // new file. This is the standard "pre-commit secrets" pattern — only
  // newly added content is scanned, so already-tracked secrets don't
  // permanently block every commit.
  const abs = isAbsolute(file) ? file : resolve(repoRootPath, file);
  if (!existsSync(abs)) return []; // deleted file, skip
  try {
    const diff = execFileSync(
      'git',
      ['diff', '--cached', '--unified=0', '--', file],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, cwd: repoRootPath },
    );
    const lines = diff.split('\n');
    const out = [];
    let newLineNum = 0;
    for (const line of lines) {
      if (line.startsWith('@@')) {
        // Hunk header: @@ -oldStart,oldCount +newStart,newCount @@
        const m = /\+(\d+)(?:,(\d+))?/.exec(line);
        if (m) newLineNum = parseInt(m[1], 10) - 1;
        continue;
      }
      if (line.startsWith('+++') || line.startsWith('---')) continue;
      if (line.startsWith('+')) {
        newLineNum += 1;
        out.push({ lineNum: newLineNum, content: line.slice(1) });
      } else if (line.startsWith('-')) {
        // deletions don't advance newLineNum
      } else if (line.startsWith(' ')) {
        newLineNum += 1;
      }
    }
    return out;
  } catch {
    // Untracked file staged for the first time — fall back to scanning whole file
    try {
      const content = readFileSync(abs, 'utf8');
      return content.split('\n').map((content, i) => ({ lineNum: i + 1, content }));
    } catch {
      return [];
    }
  }
}

function lineHasAllowedFragment(line) {
  const lower = line.toLowerCase();
  return ALLOWED_LINE_FRAGMENTS.some((frag) => lower.includes(frag.toLowerCase()));
}

function isAllowedLine(pattern, line) {
  // Generic long KEY value pattern: don't trigger on common test fixtures
  if (pattern.name === 'Generic long KEY value') {
    return lineHasAllowedFragment(line);
  }
  return lineHasAllowedFragment(line);
}

function main() {
  const root = repoRoot();
  let staged;
  try {
    staged = listStagedFiles();
  } catch (err) {
    console.error('check-secrets: could not read staged files from git:', err.message);
    process.exit(2);
  }

  if (staged.length === 0) {
    process.exit(0); // nothing to scan
  }

  const findings = [];
  for (const file of staged) {
    if (IGNORE_PATH_PATTERNS.some((re) => re.test(file))) continue;
    const lines = getStagedLinesForFile(file, root);
    for (const { lineNum, content } of lines) {
      for (const pattern of PATTERNS) {
        const m = pattern.regex.exec(content);
        if (!m) continue;
        if (isAllowedLine(pattern, content)) continue;
        findings.push({ file, lineNum, pattern: pattern.name, desc: pattern.desc, snippet: content.trim().slice(0, 120) });
        // Only report the first matching pattern per line, so a 60-line
        // OpenRouter key dump doesn't spam 5 different provider labels.
        break;
      }
    }
  }

  if (findings.length === 0) {
    console.log('✅ check-secrets: no secrets found in staged changes');
    process.exit(0);
  }

  console.error('❌ check-secrets: found possible secret(s) in staged changes');
  console.error('');
  for (const f of findings) {
    console.error(`  ${f.file}:${f.lineNum}  [${f.pattern}] ${f.desc}`);
    console.error(`    > ${f.snippet}`);
  }
  console.error('');
  console.error('Move these values to apps/backend/supabase/.env (gitignored) or to a');
  console.error('Supabase secret via `supabase secrets set <NAME>=<value>`. Then re-stage.');
  console.error('If the match is a known-safe placeholder, add it to ALLOWED_LINE_FRAGMENTS');
  console.error('in apps/backend/scripts/check-secrets.mjs.');
  process.exit(1);
}

main();
