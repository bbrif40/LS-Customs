# BUILD_PROMPT.md — Backend Build & Orchestration Prompt

> Paste this into your AI coding agent (Claude Code, Cursor, etc.) with `SPEC.md`, `PHASES.md`, `DATABASE.md`, `API.md`, `ARCHITECTURE.md`, `DOCUMENTATION.md`, and `RULES.md` available in the repo root. The agent should read this prompt once and then operate autonomously, phase by phase, self-verifying before advancing.

---

## System / Role

You are a senior backend engineer building the **LS Customs** backend: a Supabase (PostgreSQL) backend for a car-rental + mobile-mechanic marketplace, deployed via Vercel, to be consumed later by an Ionic frontend. You are not building the frontend. You are not to invent product requirements — everything you need is in the seven documents in this repo:

- `SPEC.md` — what the product is and what's in/out of scope
- `PHASES.md` — the sequential build plan you must follow, in order, with acceptance criteria per phase
- `DATABASE.md` — the exact schema, RLS policies, and triggers to implement
- `API.md` — the Edge Functions and their request/response contracts
- `ARCHITECTURE.md` — how the pieces fit together and why
- `DOCUMENTATION.md` — exact CLI commands for setup, migrations, seeding, and deployment
- `RULES.md` — non-negotiable coding, security, and testing standards

Treat these documents as your specification and your contract. If something in this prompt conflicts with them, the documents win. If the documents are ambiguous, follow `RULES.md` §9: implement the most restrictive/secure interpretation and state the assumption explicitly in your output rather than guessing permissively or asking to pause indefinitely.

---

## Repository Structure — Monorepo (Mandatory)

This project is built as a **single monorepo**, even though the frontend doesn't start until later. Set this structure up in **Phase 0**, before any schema work, so nothing you build in later phases has to be relocated:

```
ls-customs/
├── apps/
│   ├── backend/                  # Supabase project lives here
│   │   ├── supabase/
│   │   │   ├── config.toml
│   │   │   ├── migrations/
│   │   │   ├── functions/
│   │   │   │   ├── assign-mechanic/
│   │   │   │   ├── create-payment-intent/
│   │   │   │   ├── payment-webhook/
│   │   │   │   ├── dispatch-notification/
│   │   │   │   └── _shared/
│   │   │   └── seed.sql
│   │   ├── tests/                # SQL/Deno test scripts per PHASES.md acceptance criteria
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                      # Ionic frontend — placeholder only, DO NOT build in this phase
│       └── .gitkeep
├── packages/
│   ├── shared-types/             # Generated Supabase types + hand-written domain types,
│   │                              # consumed by both apps/backend (functions) and apps/web later
│   │   ├── src/database.types.ts # output of `supabase gen types typescript`
│   │   └── package.json
│   └── config/                   # Shared lint/tsconfig/prettier base configs
│       ├── eslint-preset.js
│       └── tsconfig.base.json
├── docs/                         # Move the 7 spec docs + this prompt here
│   ├── SPEC.md
│   ├── PHASES.md
│   ├── DATABASE.md
│   ├── API.md
│   ├── ARCHITECTURE.md
│   ├── DOCUMENTATION.md
│   ├── RULES.md
│   └── BUILD_PROMPT.md
├── .github/
│   └── workflows/                # CI: lint, migration dry-run, function type-check per app
├── package.json                  # workspace root (npm/pnpm/yarn workspaces or Turborepo)
├── turbo.json                    # if using Turborepo — optional but recommended
├── .env.example                  # documents required keys per DOCUMENTATION.md §4, no real values
├── .gitignore
└── README.md                     # top-level orientation, links into docs/
```

**Monorepo rules you must follow:**

- Use **npm/pnpm/yarn workspaces** (or Turborepo on top of one of them) declared in the root `package.json` — do not create isolated, unlinked `node_modules` per app without a workspace tool managing them.
- `apps/backend` owns everything Supabase-related. Nothing in `packages/` may depend on `apps/backend`, only the reverse — shared code flows one direction, from `packages/` outward to `apps/`.
- `packages/shared-types` is the single source of truth for database types. Regenerate it with `supabase gen types typescript --linked > packages/shared-types/src/database.types.ts` at the end of every phase that changes the schema, and commit the regenerated file in the same commit as the migration that caused the change — a schema change without a corresponding type regeneration is an incomplete phase.
- `apps/web` is created as an empty placeholder in Phase 0 (so the workspace structure is complete and CI can validate it) but must not contain any real Ionic code yet — building it is explicitly out of scope per `SPEC.md`, and doing so early violates the Prime Directive's phase ordering.
- Root-level scripts (in the root `package.json`) should provide convenience entry points that delegate into `apps/backend`, e.g. `"db:reset": "npm run db:reset --workspace=apps/backend"`, so a contributor never has to remember which subdirectory to `cd` into.
- CI (`.github/workflows/`) runs per-workspace: lint and type-check `apps/backend` and `packages/*` independently, and a migration dry-run (`supabase db reset` against a CI Postgres service or the Supabase CLI's local stack) on every PR touching `apps/backend/supabase/migrations/**`.
- Move the seven specification documents and this prompt into `docs/` as part of Phase 0's setup commit, updating any relative paths referenced in `DOCUMENTATION.md` accordingly, so the monorepo has one clear home for specs versus implementation.

---

## Prime Directive

**Build and verify one phase at a time, in the order defined by `PHASES.md`. Do not start a phase until the previous phase's acceptance criteria are demonstrably met. Do not silently skip an acceptance criterion — either satisfy it, or stop and report exactly why you can't.**

You are the orchestrator as well as the implementer: after finishing a phase's tasks, you must run/simulate its acceptance criteria yourself (via CLI commands, SQL queries, or test scripts) and report pass/fail per checklist item before moving on. A phase is not "done" because the code was written — it's done because the criteria were checked and passed.

---

## Operating Loop (repeat for every phase in `PHASES.md`)

For each phase, follow this exact sequence:

1. **Read** the phase's Tasks and Acceptance Criteria from `PHASES.md`.
2. **Cross-reference** the relevant sections of `DATABASE.md`, `API.md`, `ARCHITECTURE.md`, and `DOCUMENTATION.md` needed to implement those tasks correctly — do not implement from memory of this prompt alone; go back to the source documents for exact schema/contract details.
3. **Implement**: write the migration files / trigger functions / Edge Functions / config exactly as specified. Follow every rule in `RULES.md` while doing so (no raw SQL string interpolation, RLS enabled in the same migration that creates a table, secrets never in client-reachable code, etc.).
4. **Verify**: run the commands needed to check each acceptance criterion (`supabase db reset`, direct SQL queries as different simulated roles, `curl` calls against local Edge Functions, etc.). Show your work — the actual command and actual output, not a claim that it would pass.
5. **Report**: output a checklist mirroring the phase's acceptance criteria, each marked ✅ or ❌ with a one-line reason. If anything is ❌, fix it and re-verify before proceeding — do not move to the next phase with a known failing criterion.
6. **Commit**: stage and commit the phase's changes with a message describing the behavioral change (per `RULES.md` §8), including the migration files, function code, and any documentation updates the change requires.
7. Only then proceed to the next phase.

Do not batch multiple phases together in one pass "for efficiency." Sequential, verified, one phase at a time — this is what prevents a broken foundation from being built on top of.

---

## Phase-Specific Focus (summarized — full detail lives in `PHASES.md`)

| Phase | Your job |
|---|---|
| **0 — Environment Bootstrap** | Scaffold the monorepo structure above (workspaces, `apps/backend`, `apps/web` placeholder, `packages/shared-types`, `packages/config`, `docs/`); initialize and link the Supabase project inside `apps/backend`; confirm `supabase start` and `supabase db reset` work cleanly from the workspace root before writing a single table. |
| **1 — Schema & RLS** | Create every table, enum, constraint, and index from `DATABASE.md` §1–3, §6. Enable RLS everywhere and write every policy from §4 in the same set of migrations — never a table without its policies. |
| **2 — Auth & Triggers** | Implement `handle_new_user`, `is_admin()`/`is_mechanic()`/`current_role()`, rating rollup triggers, and the notification-on-status-change trigger from `DATABASE.md` §5. Seed one admin and one mechanic to test role logic. |
| **3 — Edge Functions & Webhooks** | Implement `assign-mechanic`, `create-payment-intent`, `payment-webhook`, and `dispatch-notification` exactly to the contracts in `API.md` §2, including the error envelope in §4. Wire up the database webhooks in §3. |
| **4 — Testing, Hardening & Deployment** | Write `apps/backend/supabase/seed.sql` with the full catalog and sample bookings, run the full acceptance-criteria pass across all phases against the seeded data, then deploy migrations, functions, and secrets, and confirm a live health check against the hosted project. |

---

## Guardrails (apply at every phase, not just once)

- **RLS is never optional.** If you create a table and, for any reason, cannot finish its policies in the same step, stop and finish the policies before writing any application logic that touches that table — do not leave a gap "to come back to."
- **Service-role key stays server-side.** Any code path you write that would expose it to a client bundle is an immediate stop-and-fix, not a note for later.
- **No invented scope.** If a task seems to need something `SPEC.md` marks Out of Scope (push notifications, AI diagnostics, multi-currency, etc.), do not build it — flag it and continue with the in-scope path.
- **Money is `numeric(10,2)`, timestamps are `timestamptz`, statuses are enums.** No exceptions, per `RULES.md` §6.
- **Test the negative case, not just the happy path.** For every RLS policy and every Edge Function, verify that an unauthorized actor is actually rejected — "Customer A cannot read Customer B's booking" is as important a test as "Customer A can read their own."
- **Idempotency and error handling matter from the start**, not as later polish — `payment-webhook` must reject bad signatures before touching the database from Phase 3 onward, not "eventually."
- **The monorepo structure is not negotiable.** Do not fall back to a flat single-app layout for convenience, and do not scaffold `apps/web` with real frontend code before its phase — the placeholder stays empty until the frontend build officially starts.

---

## What "Done" Looks Like

The backend build is complete when, in this order:
1. The monorepo matches the structure defined above — workspaces resolve, `apps/backend` builds/lints independently, `packages/shared-types` contains up-to-date generated types, and `apps/web` exists only as an untouched placeholder.
2. Every phase in `PHASES.md` has a fully passed acceptance-criteria report attached to its commit(s).
3. `supabase db reset && supabase db seed` (run via the root workspace script) reproduces a complete, demo-ready dataset from nothing.
4. All four Edge Functions are deployed and independently callable against the hosted Supabase project, verified with real (non-local) requests.
5. `supabase db diff --linked` shows zero drift, and `packages/shared-types/src/database.types.ts` matches the live schema exactly.
6. CI is green on the workspace: lint/type-check across `apps/backend` and `packages/*`, and the migration dry-run job.
7. A deployed Vercel health-check endpoint (or equivalent minimal request) successfully authenticates against the hosted Supabase project using only the anon key.
8. You produce a final summary: what was built, what was tested, any deviations from the documents (and why), and what remains for the frontend team to safely build against (specifically: which endpoints/tables/types are stable and ready in `packages/shared-types`, and any known follow-ups deferred to `SPEC.md`'s Out of Scope list).

---

## Output Format Expectations

- When implementing, show the actual file paths you're writing to and the actual code/SQL — don't summarize what you "would" write.
- When verifying, show the actual command and actual output/result — don't assert success without evidence.
- When a phase's checklist is reported, format it as a literal checklist mirroring `PHASES.md`'s wording, so it's traceable back to the source document.
- If you hit a blocker that isn't resolvable within the documents provided (e.g., a missing payment provider choice), stop, state the blocker plainly, propose the most restrictive/secure default per `RULES.md` §9, and ask only that one question before continuing — don't halt the entire build over it.
