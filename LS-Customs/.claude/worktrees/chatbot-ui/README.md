# LS Customs

**Backend-first build**: a Supabase (PostgreSQL) backend for a car-rental + mobile-mechanic marketplace, deployed via Vercel, to be consumed later by an Ionic frontend.

> **Status:** Backend Phase 0 (Environment Bootstrap) — see [docs/PHASES.md](docs/PHASES.md) for the sequential build plan.

## Architecture Overview

```
┌──────────────────────────┐
│  Ionic Frontend (future)  │
│  — web / iOS / Android   │
└──────────┬───────────────┘
           │ HTTPS (supabase-js)
           ▼
┌─────────────────────────────────────────┐
│              Supabase Platform          │
│  ┌─────────┐  ┌─────────┐  ┌──────────┐ │
│  │  Auth   │  │ PostgreSQL │  │ Edge Funcs │ │
│  │ (JWT)   │  │  + RLS   │  │  (Deno)   │ │
└─────────────────────────────────────────┘
│  ┌──────────────┐  ┌──────────────┐     │
│  │   Realtime   │◄─ notifications │     │
└─────────────────────────────────────────┘
           │ webhook / REST
           ▼
┌──────────────────────────┐
│ Payment Provider (Stripe/ │
│ PayMongo) — external      │
└──────────────────────────┘
```

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

## Prerequisites

- [Node.js 18+](https://nodejs.org/)
- [Docker Desktop](https://docs.docker.com/desktop/) (required by Supabase CLI)
- [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) (`npm install -g supabase`)
- A Supabase account for the hosted project

See [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md) for full setup instructions.
