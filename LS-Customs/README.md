# LS Customs

**Backend-first build**: a Supabase (PostgreSQL) backend for a car-rental + mobile-mechanic marketplace, deployed via Vercel, to be consumed later by an Ionic frontend.

> **Status:** Backend Phase 0 (Environment Bootstrap) — see [docs/PHASES.md](docs/PHASES.md) for the sequential build plan.


## Repository Structure

```
ls-customs/
├── apps/
│   ├── backend/            # Supabase project (schema, functions, seed)
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
│   │   ├── tests/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                # Ionic frontend placeholder — DO NOT BUILD YET
│       └── .gitkeep
├── packages/
│   ├── shared-types/       # Generated Supabase types + domain types
│   │   └── src/
│   └── config/             # Shared tsconfig / eslint base configs
├── docs/                   # Specification & build documents
│   ├── SPEC.md
│   ├── PHASES.md
│   ├── DATABASE.md
│   ├── API.md
│   ├── ARCHITECTURE.md
│   ├── DOCUMENTATION.md
│   ├── RULES.md
│   └── BUILD_PROMPT.md
├── .github/workflows/      # CI: lint, type-check, migration dry-run
├── .env.example
├── .gitignore
├── package.json            # Workspace root
├── turbo.json
└── README.md
```

## Quick Start

```bash
# Install dependencies
npm install

# Start local Supabase stack (Postgres, Auth, Studio)
npm run db:start
# → Studio: http://localhost:54323

# Reset database from migrations + seed
npm run db:reset

# Serve Edge Functions locally
npm run functions:serve

# Generate shared types from schema
npm run db:types
```


## Quick Start (1)

open docker setup
cd LS-Customs
npm run db:start
npm run dev

QUICK TROUBLESHOOT
npm run db:stop
npm run db:start

IF CHATBOT NEEDS RESTART:
docker_restart
supabase_edge_runtime_LS-Customs

- [Node.js 18+](https://nodejs.org/)
- [Docker Desktop](https://docs.docker.com/desktop/) (required by Supabase CLI)
- [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) (`npm install -g supabase`)
- A Supabase account for the hosted project

See [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md) for full setup instructions.

## Local Setup Tutorial

A step-by-step walkthrough to get the project running on a fresh laptop.

### Prerequisites

Install these first:

| Tool | Version | Why |
|---|---|---|
| **Node.js** | 18+ | Runs the JS/TS tooling |
| **npm** | comes with Node | Package manager (workspace-aware) |
| **Docker Desktop** | latest | Supabase local stack runs in containers |
| **Git** | latest | Clone the repo |

Optional but recommended:
- **VS Code** (or your editor of choice)
- **Supabase CLI** as a global tool: `npm install -g supabase` (the project also has it locally, so not strictly required)

> **Important:** Docker Desktop must be **running** (whale icon in system tray) before you start the Supabase stack. On Windows, enable WSL 2 backend in Docker settings.

### 1. Clone the repository

```bash
git clone <your-repo-url> "LS Customs"
cd "LS Customs"
```

The project has a `package.json` at the root **and** an inner `LS-Customs/` folder. **All commands below are run from inside `LS-Customs/`** — that's the working copy.

```bash
cd LS-Customs
```

### 2. Install dependencies

```bash
npm install
```

This installs root dev tools (Turbo, Supabase CLI, Concurrently) and all workspace packages (backend, web, shared-types, config). Takes a few minutes the first time.

### 3. Set up environment variables

```bash
# From LS-Customs/
cp .env.example apps/backend/supabase/.env
```

Then **open `apps/backend/supabase/.env`** in your editor and fill in:

- **`SUPABASE_ANON_KEY`** and **`SUPABASE_SERVICE_ROLE_KEY`** — get them after `npm run db:start` (see step 4) from the printed output, or from Supabase Studio at `http://localhost:54323` → *Project Settings → API*.
- **`OPENROUTER_API_KEY`** — chatbot support (free tier works: https://openrouter.ai/keys).
- **`PAYMONGO_SECRET_KEY`** / **`STRIPE_SECRET_KEY`** — only if testing payments.
- **SendGrid / Twilio / Google Maps / OAuth** — leave blank for now if you're just exploring; features that need them will gracefully degrade.

> ⚠️ Never commit `apps/backend/supabase/.env` — it's already in `.gitignore`.

### 4. Start the local Supabase stack

Make sure Docker Desktop is running, then:

```bash
npm run db:start
```

This spins up Postgres, GoTrue (auth), PostgREST, Edge Functions runtime, and Supabase Studio. First run downloads Docker images — give it a few minutes.

Look for output like:
```
API URL:    http://127.0.0.1:54321
Studio URL: http://127.0.0.1:54323
DB URL:     postgresql://postgres:postgres@127.0.0.1:54322/postgres
anon key:   eyJhbGciOi...
service_role key: eyJhbGciOi...
```

Copy `anon key` and `service_role key` into your `.env` file, then stop & restart so the new env is picked up:

```bash
npm run db:stop
npm run db:start
```

To wipe and re-seed the database (run migrations + seed.sql from scratch):

```bash
npm run db:reset
```

### 5. Start the Edge Functions + Web app

In one terminal (from `LS-Customs/`):

```bash
npm run dev
```

This runs (via `concurrently`):
- **FNS** → Supabase Edge Functions on `http://127.0.0.1:54321/functions/v1/<name>`
- **WEB** → Vite dev server (Ionic React) on `http://localhost:5173`

Open `http://localhost:5173` in your browser — the customer-facing app should load.

### 6. Open Supabase Studio

Visit `http://localhost:54323` to browse tables, view auth users, run SQL, and inspect Edge Function logs.

### 7. (Optional) Generate TypeScript types from schema

After schema changes:

```bash
npm run db:types
```

Regenerates `packages/shared-types/src/database.types.ts` so the frontend gets autocompletion for your tables.

### Common commands cheat sheet

All from inside the `LS-Customs/` folder:

| Command | What it does |
|---|---|
| `npm install` | Install all workspace deps |
| `npm run db:start` | Boot local Supabase (Docker) |
| `npm run db:stop` | Shut down local Supabase |
| `npm run db:reset` | Wipe DB + re-apply migrations + seed |
| `npm run dev` | Run Edge Functions + Vite dev server together |
| `npm run functions:serve` | Edge Functions only |
| `npm run web:dev` | Web app only |
| `npm run db:types` | Regenerate TS types from Postgres schema |
| `npm run typecheck` | TypeScript check across the monorepo |
| `npm run lint` | Lint Edge Functions |
| `npm run test` | Run backend tests |

### Troubleshooting

**Docker not running / port conflicts**
```bash
npm run db:stop
npm run db:start
```

**Edge Functions acting up / stale container**
Restart the Edge Functions container in Docker Desktop: `supabase_edge_runtime_LS-Customs`.

**`EADDRINUSE` on a port**
Another process is holding the port. On Windows:
```bash
netstat -ano | findstr :54321
taskkill /PID <pid> /F
```

**`@supabase/supabase-js` / workspace errors after pulling new code**
```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules
npm install
```

**Hooks not firing on commit**
The repo uses git hooks via `core.hooksPath`. After `npm install`, the `prepare` script wires it up automatically. If you skip install, run:
```bash
git config core.hooksPath LS-Customs/.githooks
```

**Windows path / line-ending weirdness**
Set `git config --global core.autocrlf input` before cloning to avoid CRLF/LF mismatches in Supabase configs.
