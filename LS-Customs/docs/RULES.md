# RULES.md — Backend Coding Standards

> Binding rules for anyone (human or AI) writing backend code for LS Customs. When in doubt, prefer the stricter interpretation.

---

## 1. Language & Style

- **TypeScript everywhere** for Edge Functions — no plain JavaScript. `strict: true` in `tsconfig.json`, no `any` without a `// eslint-disable-next-line` comment explaining why.
- SQL migrations are lower-case for keywords (`select`, `create table`) per Supabase community convention, matching the style used in `DATABASE.md`.
- File naming: `kebab-case` for Edge Function directories (`assign-mechanic/`), `snake_case` for SQL identifiers (`vehicle_bookings`, `is_available`).
- One Edge Function = one responsibility. Do not add unrelated logic to `assign-mechanic` because it's convenient — create a new function.
- Every exported function has a explicit return type; no implicit `any` returns.

## 2. Database Query Rules

- **Never** construct SQL via string concatenation with user input, anywhere — not in Edge Functions, not in scripts. Always use parameterized queries or the Supabase client's query builder.
- All Edge Functions accessing Postgres directly (rather than via the client library) must use the `postgres` or `@supabase/supabase-js` client with parameter binding — no raw template-literal SQL with interpolated variables.
- Every new table **must** ship with RLS enabled in the same migration that creates it. A table with RLS disabled is a merge-blocking issue, no exceptions, including "temporary" or "internal" tables.
- Every new RLS policy must be paired with a written test case (see `PHASES.md` acceptance criteria pattern) before merge — an untested policy is treated as an unverified policy, i.e., broken until proven otherwise.
- Prefer `check` constraints and `exclude` constraints over trigger-based validation when the rule is purely about the data itself (e.g., date ranges, no-overlap) — triggers are reserved for cross-table side effects (notifications, rollups).
- Migrations are additive and forward-only in shared/deployed environments. Never edit a migration file that has already been pushed to the remote project — write a new migration to correct it.

## 3. Secrets & Credentials

- The `service_role` key **never** appears in:
  - Any file committed to git
  - Any client-side bundle (Ionic app, Vercel static output)
  - Any log statement (`console.log`) — redact before logging request context
- Secrets live in `supabase secrets set` (Edge Functions) or Vercel's encrypted env vars (frontend-safe keys only). `.env` and `.env.local` are git-ignored from day one (`DOCUMENTATION.md` §4).
- Payment provider secret keys and webhook signing secrets follow the same rule as `service_role` — server-only, never bundled.
- Rotate any secret immediately if it is ever accidentally committed, even to a private repo, even if the commit is later removed from history.

## 4. Authentication & Authorization

- Authorization decisions are made in **Postgres RLS policies**, not in application code, wherever a query touches the database directly. Edge Functions may add *additional* business-rule checks (e.g., "is this booking still pending") on top of RLS, but never rely on Edge Function logic as the *only* gate for row access.
- Every Edge Function that isn't explicitly public (like `payment-webhook`, which is authenticated by signature instead of JWT) must validate the caller's JWT and re-derive the user's identity from `auth.uid()` — never trust a `customer_id` or `user_id` passed in the request body as the source of authorization truth.
- Role checks use the shared `is_admin()` / `is_mechanic()` SQL helper functions (`DATABASE.md` §4) — do not duplicate role-checking logic ad hoc in individual policies or functions.

## 5. Error Handling

- Every Edge Function wraps its logic in a top-level `try/catch`; unhandled exceptions must never leak stack traces or internal error messages to the client. Return the structured error envelope defined in `API.md` §4 instead.
- Distinguish **expected** failures (no mechanic available, invalid booking state) from **unexpected** failures (provider timeout, DB connection error): expected failures return a clear `error.code`; unexpected failures are logged server-side with full detail and return a generic `INTERNAL_ERROR` to the client.
- Never swallow errors silently. A `catch` block with no logging and no rethrow is not permitted.
- Webhook handlers must be defensive: verify signature → parse payload → validate shape → act. Any step failing halts processing and returns an appropriate HTTP status; partial processing that leaves data in an inconsistent state is not acceptable — wrap multi-step writes in a transaction where possible.

## 6. Data Integrity

- Money values are `numeric(10,2)`, never `float`/`double precision`, anywhere in the schema or in Edge Function arithmetic (use integer cents or a decimal library if intermediate calculations are needed).
- Status fields are always enums, never free-text strings, so invalid states are rejected at the database level.
- Timestamps are always `timestamptz`, never naive `timestamp`, to avoid timezone ambiguity across customer/mechanic locations.
- Foreign keys are never nullable unless the relationship is genuinely optional (e.g., `service_bookings.mechanic_id` is null until assigned) — document *why* in a SQL comment when a nullable FK exists.

## 7. Testing Expectations

- Every Phase in `PHASES.md` ships with acceptance criteria that must be manually or programmatically verified before moving to the next phase — do not treat acceptance criteria as optional/aspirational.
- RLS policies are tested from the perspective of **every relevant role**, including the negative case (a customer attempting to read another customer's row must fail, not just "the happy path must succeed").
- Edge Functions are tested with both valid and invalid/malicious input (missing fields, wrong types, another user's resource ID) before being considered done.

## 8. Git & Change Management

- Migrations, seed data, and Edge Functions are committed together with the documentation updates they require — a schema change without an updated `DATABASE.md` is an incomplete PR.
- Commit messages describe the *behavioral* change, not the mechanical one: `"Add no-overlap constraint on vehicle_bookings"`, not `"update schema"`.
- No direct schema edits against the hosted/production Supabase project through the dashboard UI outside of `supabase db push` — the migration files are the source of truth, always.

## 9. AI-Coder-Specific Notes

Since these documents are written to be executed by an AI coding agent as well as humans:
- Treat every "Acceptance Criteria" checklist in `PHASES.md` as a literal test plan to run, not prose to summarize.
- When a rule here conflicts with speed/convenience (e.g., "just disable RLS to get it working faster"), the rule wins — flag the tension to the user instead of silently violating it.
- If a requirement in `SPEC.md` is ambiguous when it's time to implement it, implement the most restrictive/secure interpretation and note the assumption in the PR/commit description rather than guessing permissively.
