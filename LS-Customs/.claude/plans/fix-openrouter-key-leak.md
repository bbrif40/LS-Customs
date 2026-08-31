# Fix: hardcoded OpenRouter API key in `chatbot` Edge Function

## Context

The OpenRouter key was hardcoded into `apps/backend/supabase/functions/chatbot/index.ts:21` instead of being read by name from the environment. Two consequences:

1. **The key was pasted into chat and is now in working-tree source** — treat it as compromised.
2. **`Deno.env.get("sk-or-…")` always returns `undefined`** because the first argument is the env-var *name*, not the value. The `?? ""` fallback fires, so the function runs with no key and the chatbot either falls through to the domain-fallback reply or errors out — which is why `npm run dev` shows the "connection issue" message.

The same leaked string also appears in `apps/backend/supabase/.env:44` (gitignored, not committed, but still on disk and being read by `supabase functions serve --env-file supabase/.env`).

The fix is to restore the original `Deno.env.get("OPENROUTER_API_KEY")` call, ensure the key lives only in the local `.env` file, and add a pre-commit guard so a future hardcoded key is rejected before it can be committed.

**Important user action required first:** the user must rotate the leaked key at https://openrouter.ai/keys — this plan only fixes the *next* leak; it cannot un-paste the old one.

## Changes

### 1. Restore `index.ts` to read the key by name
**File:** `apps/backend/supabase/functions/chatbot/index.ts:21`

Change:
```ts
const OPENROUTER_API_KEY = Deno.env.get("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") ?? "";
```
back to:
```ts
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
```

### 2. Replace the leaked key in the local env file
**File:** `apps/backend/supabase/.env:44`

Replace the value of `OPENROUTER_API_KEY=` with a placeholder that prompts the user to paste their *new* (rotated) key. Don't write the new key for them — they have to do it after rotation. Format:
```env
# OpenRouter API key — get one at https://openrouter.ai/keys (free tier available)
# IMPORTANT: rotate the previous key at https://openrouter.ai/keys before pasting a new one.
OPENROUTER_API_KEY=replace-me-with-rotated-key
```

This file is already covered by `apps/backend/supabase/.gitignore` (`.env`, `.env.*`), so it won't be committed. `supabase functions serve --env-file supabase/.env` (run by `npm run dev` in `apps/backend/package.json:7`) will read from it as before.

### 3. Add a pre-commit guard to block future secret leaks
**New file:** `apps/backend/scripts/check-secrets.mjs` (or `.js`)

A small Node script (no extra deps) that scans staged files for the common OpenRouter / Stripe / Supabase service-role / Google / Twilio / SendGrid / GitHub token patterns. Match the patterns the project actually uses — taken from `apps/backend/supabase/.env`:

| Provider | Pattern |
|---|---|
| OpenRouter | `sk-or-v1-[a-f0-9]{64}` |
| Stripe | `sk_(test\|live)_[A-Za-z0-9]{24,}` |
| Supabase service role | JWT with `"role":"service_role"` claim — match on header prefix `eyJ` + later `service_role` (use a simple `eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+` and then grep the decoded payload for `service_role` in the same file is too involved; instead just warn on any `service_role` string near a JWT) |
| Google OAuth secret | `GOCSPX-[A-Za-z0-9_-]{20,}` |
| Google Maps key | `AIza[A-Za-z0-9_-]{30,}` |
| SendGrid | `SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}` |
| Twilio | `SK[a-f0-9]{32}` or `AC[a-f0-9]{32}` |
| PayMongo | `sk_test_paymongo_[A-Za-z0-9]{16,}` |
| GitHub PAT | `ghp_[A-Za-z0-9]{36}` |
| Generic 32+ char hex inside `key=…` or `KEY=…` | fallback |

The script:
- Reads paths from `git diff --cached --name-only --diff-filter=ACMR`
- Excludes `**/node_modules/**`, `**/dist/**`, `**/build/**`, `**/.deno/**`
- Exits non-zero with a clear message: `❌ Possible secret in <file>:<line> — pattern matched '<provider>'. Move it to apps/backend/supabase/.env or supabase secrets.`
- Logs ✅ when clean

**New file:** `apps/backend/package.json` script — add `"precommit:check": "node scripts/check-secrets.mjs"`.

**New file:** `apps/backend/.husky/pre-commit` — a one-liner:
```sh
#!/usr/bin/env sh
node scripts/check-secrets.mjs
```

**Note:** Husky is not yet installed in this repo (no `.husky/` dir, no `husky` dep in `package.json`). Two options:

- **(a) Lightweight, no extra dep** — write a plain `.git/hooks/pre-commit` (which is per-clone, not committed) is wrong. Better: add a `pre-commit` script directly in the **root** `package.json` and use `git config core.hooksPath .githooks` plus a `.githooks/pre-commit` file. This needs no extra npm deps and works cross-platform.
- **(b) Add `husky` + `lint-staged`** as devDependencies — more standard, but adds ~30MB of node_modules and requires `npx husky install` on first clone.

**Going with (a)** — the project is small and the existing CI is light. The guard runs via the standard git hook mechanism with no extra tooling.

**New file:** `.githooks/pre-commit` (executable):
```sh
#!/usr/bin/env sh
node apps/backend/scripts/check-secrets.mjs
```

**New file:** `package.json` (root) — add a `postinstall` or `prepare` script so the hooks path is configured automatically:
```json
"scripts": {
  ...existing...,
  "prepare": "git config core.hooksPath .githooks"
}
```

### 4. Document the rotation step in `.env.example`
**File:** `.env.example:42`

The existing comment already points to https://openrouter.ai/keys. Add one line above `OPENROUTER_API_KEY=`:
```
# If this key was ever committed to git, rotate it at https://openrouter.ai/keys first.
```

## Files modified / created

| File | Action |
|---|---|
| `apps/backend/supabase/functions/chatbot/index.ts` | edit line 21 (restore `Deno.env.get("OPENROUTER_API_KEY")`) |
| `apps/backend/supabase/.env` | replace line 44 value with `replace-me-with-rotated-key` + comment about rotation |
| `apps/backend/scripts/check-secrets.mjs` | **new** — secret-pattern scanner |
| `apps/backend/package.json` | add `"precommit:check": "node scripts/check-secrets.mjs"` script |
| `.githooks/pre-commit` | **new** — invokes the scanner |
| `package.json` (root) | add `"prepare": "git config core.hooksPath .githooks"` |
| `.env.example` | add rotation warning above `OPENROUTER_API_KEY` |

## Verification

1. **The fix is mechanical, no runtime check needed** — restore line 21, confirm it matches the pre-leak version (`Deno.env.get("OPENROUTER_API_KEY")`).
2. **Pre-commit guard works:**
   - Stage a file containing a fake `sk-or-v1-` + 64 hex chars → `git commit` should fail with the scanner's red ❌ message.
   - Stage a clean file → commit should succeed.
3. **End-to-end chatbot flow (user's original problem):**
   - User rotates the key on OpenRouter.
   - User pastes the new key into `apps/backend/supabase/.env` replacing `replace-me-with-rotated-key`.
   - User runs `npm run dev` (which runs `supabase start && supabase functions serve --env-file supabase/.env`).
   - User signs in, opens the chatbot, sends a message.
   - Expected: a real AI reply (not the "connection issue" fallback). If still failing, the next debug step is `supabase functions logs chatbot` to inspect the server-side error.

## Out of scope (called out so we don't forget)

- **Purging the leaked key from git history.** It only exists in the working tree (`index.ts` modification) — `git log` shows no commit yet. Once this fix is committed, the key will be in the diff. The user should treat any commit containing it as still leaked, even after the file is fixed. If they want a clean history, they need `git filter-repo` to strip the file from the next commit before pushing. I'll flag this in the report but not do it automatically (it's a destructive history rewrite).
- **Rotating other keys that may be on the user's local disk** (Stripe test keys, Twilio placeholders, etc.) — those are already placeholders in `.env`, not live keys, so no action needed.
