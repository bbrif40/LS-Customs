# LS Customs — Project Overview

> **A narrative guide to the entire LS Customs system** — what it is, how the backend and frontend are built, how they talk to each other, and why every design decision was made. This document is written to be presented to a professor or stakeholder who needs to understand the full system at a glance.
>
> **Status:** Backend Phases 0–4 complete and verified (18/18 acceptance criteria pass). Frontend is a working MVP with Ionic + React + Vite, actively built alongside backend verification.
>
> ---

---

## 1. What Is LS Customs?

LS Customs is a two-sided marketplace that combines two automotive services into a single app:

1. **Vehicle Rental** — customers browse and book cars (short-term daily, extended weekly/monthly, or premium/luxury) for self-drive use.
2. **Mobile Mechanic Services** — customers request a vetted mechanic to come to their location (home, office, roadside) for maintenance, diagnostics, or repairs.

**The unifying idea:** "automotive help that comes to you" — renting a vehicle or getting one fixed should both feel as easy as booking a ride-hail trip.

### User Personas

| Persona | Role | What They Can Do |
|---|---|---|
| **Customer** | Regular app user | Browse vehicles/services, book rentals, request mechanics, track status, pay, leave reviews |
| **Mechanic** | Service provider | See assigned jobs, update availability/location, progress job status, view rating |
| **Admin** | Platform operator | Manage vehicles, services, users, mechanics; view all bookings and payments |

### The Big Picture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Ionic Frontend                          │
│     (React + Ionic UI, Vite build, browser / native app)         │
│                                                                 │
│  Direct DB access via supabase-js (PostgREST)                   │
│    ─ browse vehicles / services (public, no auth)               │
│    ─ read own bookings, addresses, notifications (JWT + RLS)     │
│    ─ update own bookings, mark notifications read               │
│                                                                 │
│  Edge Function calls via supabase.functions.invoke()            │
│    ─ assign-mechanic  (dispatch a nearby mechanic)              │
│    ─ create-payment-intent  (create a Stripe/PayMongo payment)   │
│    ─ geocode-address  (turn address text into lat/lng)           │
│    ─ chatbot  (AI customer support)                             │
│                                                                 │
│  Realtime subscription via supabase.realtime                        │
│    ─ live notification updates on booking status changes          │
└──────────┬──────────────────────────────────────────────┬──────┘
           │ HTTPS (supabase-js)                          │
           ▼                                              │
┌─────────────────────────────────────────────────────────┴──────┐
│                   Supabase Platform (Backend)                   │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Supabase │  │ PostgreSQL   │  │    Edge Functions        │  │
│  │ Auth     │  │ + RLS        │  │  (Deno / TypeScript)     │  │
│  │ (JWT)    │  │  (database   │  │  ─ assign-mechanic       │  │
│  │          │  │   source of   │  │  ─ create-payment-intent │  │
│  │          │  │   truth)     │  │  ─ payment-webhook       │  │
│  │          │  │              │  │  ─ dispatch-notification  │  │
│  │          │  │              │  │  ─ geocode-address        │  │
│  │          │  │              │  │  ─ chatbot                 │  │
│  └──────────┘  └──────┬───────┘  └──────────┬───────────────┘  │
│                       │ triggers /              │ webhook / REST  │
│  ┌──────────────────────────┐◄─────────────────┘               │
│  │ Realtime (notify_on_   │                                       │
│  │  status_change trigger)│                                       │
│  └──────────────────────────┘                                       │
└───────────────────────────────────────────────────────────────────┘
           │ webhook / REST                                               
           ▼                                                               
┌─────────────────────────────────────────┐                                  
│ Payment Provider (PayMongo / Stripe)    │  — external, Philippines-focused   
└─────────────────────────────────────────┘                                 
```

---

## 2. Repository Structure (Monorepo)

The project is a **single npm-workspaces monorepo** managed with **Turborepo** for task orchestration:

```
ls-customs/                          ← git repo root
├── apps/
│   ├── backend/                      # Everything Supabase-related
│   │   ├── supabase/
│   │   │   ├── config.toml           # Local dev config (ports, auth, function JWT settings)
│   │   │   ├── migrations/           # 7 SQL files — the database is built from these
│   │   │   ├── functions/            # 6 Edge Functions (TypeScript, Deno runtime)
│   │   │   │   ├── assign-mechanic/
│   │   │   │   ├── create-payment-intent/
│   │   │   │   ├── payment-webhook/
│   │   │   │   ├── dispatch-notification/
│   │   │   │   ├── geocode-address/
│   │   │   │   ├── chatbot/
│   │   │   │   └── _shared/          # Shared utilities (CORS, Supabase client, payment provider)
│   │   │   ├── seed.sql              # Demo data for local dev
│   │   │   └── gen_jwt.mjs           # Generates test JWTs locally
│   │   ├── tests/                    # Test scripts per PHASES.md acceptance criteria
│   │   ├── package.json              # Backend-specific scripts & deps
│   │   └── tsconfig.json             # TypeScript config (strict mode)
│   └── web/                          # Ionic + React frontend
│       ├── public/
│       ├── src/
│       │   ├── App.tsx              # Root component (85-line orchestrator)
│       │   ├── supabaseClient.ts    # Client singleton (anon key only)
│       │   ├── hooks/useAuth.ts     # Session management + identity resolution
│       │   ├── data/                # Static demo data (vehicles, services, nav)
│       │   ├── types/               # Frontend type definitions
│       │   ├── components/            # 16 components split by concern
│       │   └── styles.css           # All styling (no CSS-in-JS)
│       ├── package.json             # Frontend deps (Ionic, React, Vite, lucide-react)
│       ├── vite.config.ts           # Vite build config
│       └── .env.local               # VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (gitignored)
├── packages/
│   ├── shared-types/                 # Single source of truth for types
│   │   └── src/
│   │       ├── index.ts             # Re-exports database.types + domain.types
│   │       ├── database.types.ts    # Generated from Postgres (placeholder for now)
│   │       └── domain.types.ts      # Hand-written domain enums + interfaces
│   └── config/                       # Shared tooling config
│       ├── tsconfig.base.json       # Base TS config (strict, ES2022)
│       └── eslint-preset.js         # Shared ESLint rules
├── docs/                             # Specification & build documents
│   ├── SPEC.md                      # Product requirements & scope
│   ├── PHASES.md                    # Sequential build roadmap with acceptance tests
│   ├── DATABASE.md                  # Schema, RLS policies, triggers — the contract
│   ├── API.md                       # Edge Function contracts & error conventions
│   ├── ARCHITECTURE.md              # High-level architecture rationale
│   ├── DOCUMENTATION.md             # Setup, migration, deployment CLI guide
│   ├── RULES.md                     # Non-negotiable coding & security standards
│   ├── BUILD_SUMMARY.txt            # Senior-dev walkthrough of what was implemented
│   ├── CLEANUP_REPORT.md            # Post-build audit report
│   ├── BUILD_PROMPT.md              # Orchestration prompt for AI coding agents
│   └── PROJECT_OVERVIEW.md           # ← This file (readable project guide)
├── .github/workflows/ci.yml          # CI: lint, typecheck, migration dry-run
├── .env.example                      # Documents all required env vars (no real values)
├── package.json                      # Workspace root + convenience scripts
├── turbo.json                         # Turbo task pipeline definition
├── .gitignore
└── README.md                          # Top-level orientation
```

### Why a Monorepo?

The monorepo enforces a **one-directional dependency flow**: `packages/shared-types` → `apps/backend` → `apps/web`. Shared code (types, configs) lives in `packages/` and flows outward. The backend never depends on the frontend. This means:

- **Schema changes** propagate types from the database all the way to the frontend automatically.
- **CI runs independently** on each workspace — a frontend lint failure doesn't block a backend migration.
- **Single git history** — migrations, functions, frontend components, and documentation all share commits, making it easy to trace "what changed and why."

---

## 3. Backend: The Supabase Stack

### 3.1 Why Supabase?

Supabase is chosen because it collapses four backend infrastructure concerns into one managed platform:

| Concern | Supabase Provides | Why It Matters |
|---|---|---|
| Database | PostgreSQL 17 | Battle-tested relational DB with extensions (btree_gist, etc.) |
| Auth | GoTrue (JWT-based) | Email/password + Google OAuth, JWT tokens |
| Realtime | Built-in WebSocket | Live updates on table changes without polling |
| Compute | Edge Functions (Deno) | Serverless functions that run close to the user |

Instead of building and maintaining separate services for auth, database, and API routing, everything lives in one platform. This is the **backend-first** decision: the team built the database schema, Row-Level Security policies, and Edge Functions first, and the Ionic frontend was built to consume them.

### 3.2 The Database Schema (11 Tables)

The database is built from **7 sequential migration files**, applied in filename order. Each migration is pure SQL and represents one logical step in the schema's evolution. The full schema is documented in `docs/DATABASE.md`.

**Key design decisions in the schema:**

#### Enums for Status Fields
Instead of free-text strings, all status fields are PostgreSQL enums:
- `user_role`: `customer`, `mechanic`, `admin`
- `booking_status`: `pending`, `confirmed`, `assigned`, `en_route`, `in_progress`, `completed`, `cancelled`
- `rental_category`: `short_term`, `extended`, `premium`
- `service_main_category`: 6 categories (routine_fluid_service, tire_wheel_care, etc.)
- `payment_status`: `pending`, `succeeded`, `failed`, `refunded`
- `booking_type`: `vehicle`, `service` (polymorphic discriminator for reviews/payments)

**Why:** The database rejects invalid values at the lowest level. If code tries to set `status = "foo"`, PostgreSQL throws an error before a row is ever written.

#### The Exclusion Constraint (No Double-Booking)
```sql
alter table vehicle_bookings
  add constraint no_overlapping_bookings
  exclude using gist (
    vehicle_id with =,
    daterange(start_date, end_date, '[]') with &&  -- && = overlap
  ) where (status in ('pending', 'confirmed', 'in_progress'));
```

**Why:** This is the single most important business rule — "never double-book a vehicle." Instead of checking availability in application code (which could have race conditions), PostgreSQL's exclusion constraint uses a GiST index to make this an atomic database-level guarantee. If two requests try to book the same vehicle for overlapping dates simultaneously, one is rejected.

#### Foreign Keys and Cascades
Every relationship uses a foreign key with `ON DELETE CASCADE` where appropriate. For example:
- `profiles.id` → references `auth.users(id)` (cascade: deleting an auth user deletes their profile)
- `addresses.customer_id` → references `profiles(id)` (cascade)
- `service_bookings.mechanic_id` → references `mechanic_profiles(id)` (nullable until assigned)

**Why:** Data integrity is enforced by the database, not by application code. If a mechanic is deleted, their bookings remain but `mechanic_id` becomes NULL.

### 3.3 Row-Level Security (RLS) — The Security Backbone

**RLS is enabled on every single table.** The verification query `select tablename from pg_tables where schemaname = 'public' and rowsecurity = false` returns **zero rows** — meaning no table is accessible without a matching RLS policy.

#### How RLS Works

When the frontend connects with `supabase-js` using the **anon key**, Supabase attaches the caller's JWT to every request. PostgreSQL extracts the user ID from the JWT and makes it available as `auth.uid()`. RLS policies then filter rows based on that user ID.

Example — customer's own bookings:
```sql
create policy "vehicle_bookings select" on public.vehicle_bookings
  for select to authenticated
  using (customer_id = auth.uid() or public.is_admin());
```

#### Role-Based Helper Functions
```sql
create or replace function public.current_role() returns user_role
  language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;
```

Three helper functions (`current_role()`, `is_admin()`, `is_mechanic()`) are defined as `SECURITY DEFINER` so they can be used inside RLS policies. Every policy references them instead of duplicating role-checking logic.

#### The Critical Security Rule
Per `RULES.md §3`, the **service_role key** (which bypasses ALL RLS) is:
- Never committed to git
- Never bundled in the frontend
- Never logged
- Only available to Edge Functions via `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`

This means the frontend **cannot** accidentally read another user's data, even if there's a bug in the application code. The database itself refuses.

#### A Security Gotcha — Admin UPDATE Policies
The `DATABASE.md` file includes a prominent warning about a subtle Postgres RLS behavior:

```sql
-- WRONG — would let ANY authenticated user update ANY visible row to ANY value:
create policy "bad admin update" on service_bookings for update
  to authenticated using (public.is_admin())
  with check (true);  -- ← DANGER: no admin check in WITH CHECK

-- CORRECT:
create policy "service_bookings update admin" on service_bookings
  for update to authenticated using (public.is_admin())
  with check (public.is_admin());
```

**Why this matters:** In PostgreSQL, the `USING` clause controls *which rows can be seen*, and `WITH CHECK` controls *what values can be written*. If you only protect the `USING` clause but leave `WITH CHECK` open, any authenticated user can change any visible row — including changing another user's booking to `completed`.

### 3.4 Triggers — Automation at the Data Layer

Triggers implement business logic that must be **transactionally atomic** with the data change itself. There are 5 trigger functions:

| Trigger | Fires On | Purpose |
|---|---|---|
| `handle_new_user` | `auth.users` INSERT | Auto-creates a `profiles` row when someone signs up |
| `set_updated_at` | All mutable tables UPDATE | Auto-updates `updated_at` column |
| `recalculate_vehicle_rating` | `reviews` INSERT/UPDATE/DELETE | Recomputes `vehicles.rating_avg` and `rating_count` |
| `recalculate_mechanic_rating` | `reviews` INSERT/UPDATE/DELETE | Recomputes `mechanic_profiles.rating_avg` and `rating_count` |
| `notify_on_status_change` | `vehicle_bookings`/`service_bookings` UPDATE | Inserts a `notifications` row for the customer (and mechanic if applicable) |
| `enforce_service_status_transition` | `service_bookings` UPDATE | Rejects illegal status jumps (e.g., `pending → completed` directly) |

**Why triggers instead of Edge Functions?** Consider the rating rollup: if a customer leaves a review, the mechanic's average rating must update in the same transaction. If this were done in an Edge Function called after the insert, there's a window where the review exists but the rating hasn't updated yet — and a concurrent read would show stale data. The trigger guarantees atomicity.

#### Status Transition Enforcement
The `enforce_service_status_transition` trigger is a **second line of defense** behind RLS:
- RLS policy `using` clauses check *who* can update (the assigned mechanic)
- The trigger checks *whether the transition is legal* (forward-only: `assigned → en_route → in_progress → completed`)

A customer might be able to SELECT a row (RLS allows it), but the trigger blocks them from setting `status = 'completed'` directly.

#### Service Role Bypass
The trigger includes a special case for service-role calls (from Edge Functions):
```sql
if COALESCE(current_setting('request.jwt.claims', true), '{}')::jsonb ->> 'role' = 'service_role' then
  return new;  -- bypass status transition checks
end if;
```
This allows Edge Functions using the `createServiceClient()` (service-role) client to update booking status when processing webhook results, without being blocked by the trigger.

### 3.5 Indexes (Performance)

7 indexes on the most commonly filtered columns:
```sql
create index idx_vehicle_bookings_customer on vehicle_bookings(customer_id);
create index idx_vehicle_bookings_vehicle_status on vehicle_bookings(vehicle_id, status);
create index idx_service_bookings_customer on service_bookings(customer_id);
create index idx_service_bookings_mechanic on service_bookings(mechanic_id);
create index idx_service_bookings_status on service_bookings(status);
create index idx_notifications_user_unread on notifications(user_id) where is_read = false;
create index idx_mechanic_profiles_available on mechanic_profiles(is_available) where is_available = true;
```

**Why RLS-friendly indexing matters:** An RLS policy like `customer_id = auth.uid()` without an index on `customer_id` forces a full table scan on every request. The indexes are strategically placed on every column used in RLS `USING` clauses.

---

## 4. Edge Functions — Serverless Business Logic

Edge Functions run on Deno (not Node) inside the Supabase Edge Runtime. They are written in **TypeScript with `strict: true`**.

### Shared Utilities (`_shared/`)

Three shared files are imported by all functions:

| File | Provides |
|---|---|
| `cors.ts` | `corsHeaders` object + `jsonResponse()` helper (consistent `{ data, error }` envelope) |
| `supabaseClient.ts` | `createServiceClient()` (service-role), `createUserClient(jwt)` (anon-scoped), `extractJwt(req)` (reads Bearer header) |
| `paymentProvider.ts` | Provider-agnostic abstraction: `createPaymentIntent()`, `verifyWebhookSignature()`, `normalizeWebhookEvent()` |

### Function-by-Function

#### `assign-mechanic`
**Purpose:** Given a `service_bookings.id`, find the nearest available mechanic and assign them.

**Flow:**
1. Parse + validate `service_booking_id` (UUID regex check)
2. Determine caller identity — accepts either a customer JWT (verifies ownership) or a service-role call (trusted DB webhook)
3. Fetch the booking, confirm `status = 'pending'`
4. Resolve the pin location (from `address_id` → `addresses.lat/lng`, or direct `pin_lat`/`pin_lng`)
5. Query all available mechanics ordered by rating (Supabase client, parameterized — no SQL injection risk)
6. Compute Haversine distance from each mechanic to the booking location
7. Pick the nearest, update `mechanic_id` + `status = 'assigned'`
8. The `notify_on_status_change` trigger automatically creates notification rows

**Auth:** `verify_jwt = false` in config.toml — manual JWT check in code. This allows it to be called by either an authenticated customer (from the frontend) or a DB webhook (service-role, no JWT).

#### `create-payment-intent`
**Purpose:** Create a payment intent with the configured provider (Stripe or PayMongo) and record it in the `payments` table.

**Flow:**
1. Validate request body (`booking_type`, `booking_id`)
2. Verify caller JWT via GoTrue's `/auth/v1/user` endpoint
3. Fetch the booking, verify `customer_id` matches the JWT caller
4. Call the provider API (via `paymentProvider.ts`):
   - **PayMongo:** Basic auth (`base64(secret:)`), JSON body with `data.attributes` structure
   - **Stripe:** Bearer auth, URL-encoded body
5. Insert a `payments` row with `status = 'pending'` (service-role, since no client-side INSERT policy exists)
6. Return `client_secret` (normalized from PayMongo's `client_key`) for the frontend SDK

**Security:** Ownership is checked in the Edge Function **on top of** RLS. Even though the service-role client bypasses RLS, the function explicitly verifies that `booking.customer_id === user.id` before proceeding. This is **defense in depth** — two independent checks.

#### `payment-webhook`
**Purpose:** Receive asynchronous payment status updates from the provider.

**Flow:**
1. Read the **raw request body** as a string (signature is computed on raw bytes)
2. Verify the provider's webhook signature (HMAC-SHA256, 5-minute replay window, timing-safe comparison)
3. If signature fails → return 401, **no database changes**
4. Parse + normalize the provider-specific payload into a common shape
5. Look up the `payments` row by `provider_reference`
6. Update `payments.status` (`pending → succeeded` or `pending → failed`)
7. On success: update the parent booking status (`vehicle_bookings.status → 'confirmed'`)
8. Return `200 OK` with `{ received: true }`

**Critical design choice:** The function returns `200` even on errors (after signature verification passes) to prevent the payment provider from retrying indefinitely. Signature failures return `401`.

#### `dispatch-notification`
**Purpose:** Deliver notification rows to external channels (email via SendGrid, SMS via Twilio).

**Flow:**
1. Parse `notification_id`
2. Fetch the notification row
3. Check idempotency: if `metadata.dispatched === true`, return early
4. Fetch recipient profile (phone from `profiles`, email from `auth.users` via GoTrue admin API)
5. Send email via SendGrid (if API key configured)
6. Send SMS via Twilio (if configured + recipient has phone)
7. Update `notifications.metadata` with dispatch results (channels, timestamps, errors)

**Auth:** Service-role only (no JWT). Server-to-server function.

#### `geocode-address`
**Purpose:** Convert address text → lat/lng coordinates via Google Maps Geocoding API.

**Flow:**
1. Verify caller JWT
2. Call Google Maps Geocoding API server-side (API key never reaches the frontend)
3. Return `{ lat, lng, formatted_address }`

**Why server-side:** The Google Maps API key is a secret. If exposed to the frontend, anyone could use it and rack up charges on the LS Customs bill.

#### `chatbot`
**Purpose:** AI customer support assistant (OpenRouter-backed, with topic guardrails).

**Flow:**
1. Validate message is non-empty
2. **Guardrail check:** If the message doesn't contain any automotive/service-related keywords, return a redirect message *without* calling the AI provider (saves API costs, prevents off-topic conversations)
3. Optionally enrich context with the user's 3 most recent bookings (if `user_id` provided)
4. Call OpenRouter's `/chat/completions` endpoint with fallback models in priority order
5. Return the AI reply

**Provider switching:** The `PAYMENT_PROVIDER` env var selects between PayMongo and Stripe. The `OPENROUTER_MODEL` env var overrides the default model. The `OPENROUTER_BASE_URL` env var allows pointing to a self-hosted OpenAI-compatible endpoint.

### Error Handling Convention

All Edge Functions return a consistent JSON envelope:
```json
{ "data": null, "error": { "code": "STRING_CODE", "message": "Human-readable" } }
```

The function uses try/catch with specific handling for non-Error throws (extractJwt throws plain objects with `{ code, message, status }`), as documented in the BUILD_SUMMARY.txt bug report:

> **BUG-01 (Fixed):** `create-payment-intent` returned 500 instead of 401 when the Authorization header was missing. Root cause: `extractJwt()` throws a plain object (not an `Error` instance), but the catch block only checked `err instanceof Error`. Fix: catch block now checks for objects with a `status` property.

---

## 5. Frontend: Ionic + React + Vite

### 5.1 Why Ionic + React + Vite?

| Technology | Role | Why |
|---|---|---|
| **Ionic Framework** | UI component library | Provides pre-built, mobile-optimized components (`IonApp`, etc.) that render natively on web, iOS, and Android from one codebase |
| **React** | UI library | Component-based, handles the view routing and state management |
| **Vite** | Build tool | Fast dev server with hot-reload, optimized production builds |
| **TypeScript** | Type safety | Catches bugs at compile time; shares types with the backend via `packages/shared-types` |

### 5.2 Frontend Architecture

The frontend follows a **"thin orchestrator + dumb components"** pattern. `App.tsx` is 85 lines — it manages global state (current view, toast messages, cart count, sign-out confirmation) and delegates rendering to small, focused child components.

#### Component Breakdown

```
src/
├── App.tsx                          # Root orchestrator (state + routing)
├── main.tsx                         # React entry point (IonApp wrapper)
├── supabaseClient.ts              # Singleton client (anon key only, NEVER service_role)
├── hooks/
│   └── useAuth.ts                 # Session management + identity resolution
├── data/
│   ├── vehicles.ts                # Static vehicle catalog (demo data)
│   ├── services.ts                # Static service catalog (demo data)
│   └── navigation.ts              # Sidebar navigation items
├── types/
│   └── index.ts                   # Shared types (View, Vehicle, Service, UserIdentity)
├── components/
│   ├── auth/
│   │   └── AuthModal.tsx          # Sign-in / sign-up modal
│   ├── layout/
│   │   ├── Header.tsx             # Top navbar with view switcher
│   │   ├── Sidebar.tsx            # Docked navigation sidebar
│   │   ├── WorkspaceFooter.tsx    # Footer with quick links
│   │   └── SignOutConfirmation.tsx # Confirmation dialog
│   ├── views/
│   │   ├── Dashboard.tsx          # Home view (hero, featured rentals, trending services)
│   │   ├── Rentals.tsx            # Vehicle browsing with filters + search
│   │   ├── MechanicServices.tsx   # Service catalog with "add to cart"
│   │   ├── Bookings.tsx           # Booking history list
│   │   └── Profile.tsx            # User profile page
│   ├── common/
│   │   ├── VehicleCard.tsx        # Vehicle display card
│   │   ├── ServiceMini.tsx        # Compact service preview
│   │   ├── LocationCard.tsx       # Location selector
│   │   ├── PageHeading.tsx        # Section heading component
│   │   └── SettingsRow.tsx        # Settings toggle row
│   └── chat/
│       └── ChatBot.tsx            # Floating AI assistant widget
└── styles.css                     # All styling (CSS, not CSS-in-JS)
```

### 5.3 Authentication Flow (Frontend Perspective)

```typescript
// useAuth.ts — the hook behind every auth interaction
supabase.auth.getSession().then(({ data: { session } }) => {
  setSignedIn(Boolean(session))
  setUserId(session?.user?.id)
})

supabase.auth.onAuthStateChange((_event, session) => {
  setSignedIn(Boolean(session))
})
```

**Key points:**
- The hook uses `supabase.auth.onAuthStateChange()` to listen for session changes (sign-in, sign-out, token refresh).
- `resolveIdentity()` fetches the user's `profiles` row to get `full_name` (stored separately from `auth.users`). If the profile doesn't exist, it falls back to JWT metadata or the email prefix.
- `supabase.auth.signOut()` invalidates the session locally and on the server.
- The JWT is stored in `localStorage` (web) or `Capacitor Preferences` (mobile) by `supabase-js` — it persists across page reloads.
- The JWT automatically refreshes before expiry (Supabase handles this internally).

### 5.4 The ChatBot Widget — A Case Study in Frontend↔Backend Integration

The `ChatBot` component is a floating widget that demonstrates the full frontend-backend communication stack:

```
User types message →
  supabase.functions.invoke('chatbot', { body: { message, messages, user_id } }) →
    Edge Function (Deno) →
      1. Guardrail check (is the message about cars/services?)
      2. Context enrichment (fetch user's recent bookings from Postgres)
      3. Call OpenRouter /chat/completions
      4. Return { data: { reply, conversation_id, model } } →
  Frontend receives envelope →
  Displays reply in chat bubble with markdown formatting
```

**Notable details:**
- The widget manages its own conversation state (`messages`, `conversation_id`, `loading`)
- It sends conversation history with each request so the AI has context
- The `FormattedMessage` sub-component safely renders markdown-like text (bold, bullets)
- It has quick-suggestion chips for common queries ("Help me rent a car", "Need a mobile mechanic")
- It gracefully degrades: if the Edge Function is down, it shows a fallback message
- The response envelope is unwrapped: `supabase.functions.invoke()` returns `{ data: { data: {...} } }` — the double `data` is because `invoke` wraps the function's own `{ data, error }` response

---

## 6. How Frontend and Backend Communicate

There are **four distinct communication channels**, each with a different purpose:

### Channel 1: Direct Database Access (PostgREST via supabase-js)

The frontend talks to PostgreSQL directly through Supabase's PostgREST auto-generated API, using the **anon key** (which is safe because RLS enforces access control).

```javascript
// Example: Customer reads their own bookings
const { data, error } = await supabase
  .from('service_bookings')
  .select('*, service_booking_items(*, mechanic_services(*))')
  .eq('customer_id', userId)  // ← RLS uses auth.uid() internally
  .order('created_at', { ascending: false })
```

**What happens behind the scenes:**
1. The `supabase-js` client attaches the JWT as a Bearer token
2. PostgREST (Supabase's REST layer) receives the request and sets `auth.uid()` from the JWT
3. PostgreSQL evaluates all applicable RLS policies
4. Only rows where `customer_id = auth.uid()` are returned
5. The result comes back to the frontend

**This is the primary channel for CRUD operations** — browsing vehicles, reading bookings, updating notification read status, etc. No custom API endpoints needed.

### Channel 2: Edge Function Calls

For logic that can't live in an RLS policy (matching, payment provider API calls, geocoding), the frontend calls Edge Functions:

```javascript
// Example: Trigger AI chatbot
const { data, error } = await supabase.functions.invoke('chatbot', {
  body: {
    message: textToSend,
    messages: chatHistory,
    conversation_id: conversationId,
    user_id: userId,
  },
})
```

**What happens behind the scenes:**
1. `supabase.functions.invoke()` makes an HTTPS POST to `https://<project>.supabase.co/functions/v1/chatbot`
2. The Edge Function (Deno runtime) executes the TypeScript code
3. For auth-required functions, the JWT is verified by calling GoTrue's `/auth/v1/user` endpoint
4. For service-role operations, the function uses `createServiceClient()` (which reads the service_role key from the function's environment)
5. The result is returned in the `{ data, error }` envelope

### Channel 3: Database Webhooks → Edge Functions

Some Edge Functions are triggered automatically by database changes, not by the frontend:

```
service_bookings.INSERT → DB webhook → assign-mechanic Edge Function
notifications.INSERT → DB webhook → dispatch-notification Edge Function
payments.UPDATE → webhook → payment-webhook Edge Function (from provider)
```

**Why:** These represent business workflows that must happen regardless of who made the change. When a customer creates a service booking, the system must automatically assign a mechanic — this shouldn't depend on the frontend remembering to call the API.

### Channel 4: Payment Provider Webhooks → Edge Functions

The payment provider (Stripe/PayMongo) calls `payment-webhook` directly when a payment status changes:

```
Customer pays → Provider → POST /functions/v1/payment-webhook (signed) → update payment + booking status
```

**Why server-to-server:** This is asynchronous and outside the user's request lifecycle. The customer might close the app after paying, but the backend must still receive the webhook and update the booking status.

### Channel 5: Realtime Subscriptions

The frontend subscribes to database changes for live updates:

```javascript
// Subscribe to status changes (future — defined in spec)
supabase
  .channel('public:notifications:user_id=eq.<userId>')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
    // Show toast notification
  })
  .subscribe()
```

**How it works:**
1. The frontend subscribes to changes on the `notifications` table, filtered by `user_id = auth.uid()`
2. When the `notify_on_status_change` trigger fires (after a booking status update), it inserts a `notifications` row
3. Supabase Realtime broadcasts this change to all subscribed clients over WebSocket
4. The frontend receives it instantly — no polling needed

### The Communication Decision Tree

```
Does this operation need:           ┌── Direct table access (supabase-js) ──→ RLS enforced
  - Just create/read/update data?   └── Is the user authorized? (via auth.uid())
                                       Yes → data flows to frontend
                                       No  → empty result (never an error)

Does it need:                       ┌── Edge Function call
  - service_role key?               ├── Third-party API call?
  - Business logic?                 ├── Matching algorithm?
                                    └── Not expressible in RLS?   ──→ supabase.functions.invoke()

Does it need to happen:             ┌── DB Webhook → Edge Function
  - Automatically when data       →
    changes?                      ├── Provider callback?
                                    └── External event?           ──→ webhook endpoint
```

---

## 7. Security Model — The Defense in Depth Strategy

### 7.1 Secret Management

| Secret | Where It Lives | Exposed to Client? |
|---|---|---|
| `SUPABASE_ANON_KEY` | `.env.local` (frontend) + Vercel env | ✅ Yes — safe, RLS-protected |
| `SUPABASE_URL` | `.env.local` (frontend) + Vercel env | ✅ Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | `supabase/.env` + `supabase secrets set` | ❌ NEVER |
| Payment provider secret key | `supabase secrets set` (Edge Function env) | ❌ NEVER |
| Payment webhook signing secret | `supabase secrets set` | ❌ NEVER |
| Google Maps API key | `supabase secrets set` | ❌ NEVER |
| OpenRouter API key | `supabase secrets set` | ❌ NEVER |
| SendGrid / Twilio keys | `supabase secrets set` | ❌ NEVER |

The `.env.example` at the repo root documents all required variables with descriptions but no real values. `.env` and `.env.*` are gitignored.

### 7.2 The Three-Layer Security Model

```
Layer 1: Frontend (what the user sees)
  │
  │ supabase-js (anon key)
  ▼
Layer 2: Edge Functions (server-side logic)
  │
  │ service_role key (bypasses RLS, calls any table)
  ▼
Layer 3: PostgreSQL + RLS (the database itself)
  │
  │ auth.uid() from JWT → RLS policies → row-level access
  ▼
  Data is returned (or rejected)
```

Each layer is independently secure:
- **Frontend** can't bypass Layer 3 — it only has the anon key, which RLS restricts
- **Edge Functions** use the service_role key, but ownership is still verified in code (defense in depth)
- **RLS** is the last line of defense — even if code has a bug, the database refuses unauthorized access

### 7.3 JWT Authentication

```
1. User signs in → supabase.auth.signInWithPassword()
2. GoTrue validates credentials → returns { access_token, refresh_token }
3. supabase-js stores the session (localStorage / Capacitor Preferences)
4. Every subsequent request includes access_token as Bearer JWT
5. PostgREST extracts auth.uid() from the JWT
6. RLS policies evaluate auth.uid() against row ownership
7. Before expiry, supabase-js auto-refreshes the token
```

The JWT contains claims like `{ sub: "user-uuid", role: "authenticated", app_metadata: { role: "customer" } }`. The `current_role()` SQL function reads `profiles.role` (not the JWT `app_metadata.role`) to determine the user's application role.

### 7.4 Input Validation

Every Edge Function validates its inputs:
- UUID format checking (regex: `/^[0-9a-f]{8}-...]/`)
- Field presence checks
- Booking ownership verification (even though service_role bypasses RLS)
- Webhook signature verification (HMAC-SHA256 with timing-safe comparison)

---

## 8. Development Workflow

### 8.1 Local Development

```bash
# 1. Start the Supabase stack (Postgres, Auth, Studio, Realtime, Functions)
npm run db:start

# 2. Reset database from migrations + seed
npm run db:reset

# 3. Serve Edge Functions locally (with secrets from .env)
npm run functions:serve

# 4. Start the frontend dev server
npm run dev
```

This brings up:
- **PostgreSQL** at `localhost:54322` (database)
- **GoTrue** at `localhost:54321` (auth API)
- **Studio** at `localhost:54323` (web-based DB admin)
- **Edge Functions** at `localhost:54321/functions/v1/`

### 8.2 The Phase-Based Build Process

The project was built using a **sequential phase model** defined in `PHASES.md`:

| Phase | Goal | Key Deliverable | Status |
|---|---|---|---|
| **0** | Environment Bootstrap | Linked local + remote Supabase, monorepo structure | ✅ Complete |
| **1** | Schema & RLS | All tables, constraints, policies, indexes | ✅ Complete (6/6 tests pass) |
| **2** | Auth & Triggers | Auto-profile creation, rating rollups, notification triggers | ✅ Complete (5/5 tests pass) |
| **3** | Edge Functions | assign-mechanic, payment, webhook, notification dispatch | ✅ Complete (7/7 tests pass) |
| **4** | Testing & Deployment | Seed data, full test pass, deployment, API integrations | ✅ Complete |

**18/18 acceptance criteria pass** across all phases. Each phase was verified before moving to the next — no phase was "built" without being "tested."

### 8.3 Testing Strategy

Two test approaches:

1. **SQL-based integration tests** (`tests/test_phase1_schema_rls_isolation.sql`, `tests/test_phase2_auth_triggers_ratings.sql`)
   - Run directly against the Postgres database
   - Test RLS isolation (Customer A can't see Customer B's data)
   - Test constraint enforcement (double-booking blocked)
   - Test trigger behavior (rating rollups, notifications)
   - Use `TRUNCATE` for idempotency, `ON_ERROR_STOP off` for expected-error tests

2. **Node.js Edge Function tests** (`tests/test_phase3_edge_functions.js`)
   - Spin up a mock payment provider server on port 8090
   - Sign up a test user via GoTrue → extract JWT
   - Insert a test booking via `psql` (docker exec)
   - Call `create-payment-intent` → verify payment row created
   - Send signed webhook → verify `payments.status = succeeded` + `booking.status = confirmed`
   - Send unsigned/invalid webhook → verify 401 + no DB changes

### 8.4 CI/CD

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every PR:

| Job | What It Does |
|---|---|
| **lint** | Type-checks `apps/backend` and `packages/shared-types` via `tsc --noEmit` |
| **migration-test** | Validates all migration SQL files parse and apply against a fresh Postgres 17 container |
| **function-typecheck** | Type-checks all Edge Function TypeScript against Deno module resolution |

Deployment is manual (not auto-deployed on push):
```bash
supabase db push          # Deploy migrations
supabase functions deploy # Deploy all Edge Functions
supabase secrets set ...  # Set environment secrets
```

---

## 9. API Integrations Completed (Phase 4)

Five external API integrations have been implemented and verified:

| Integration | Function | Status |
|---|---|---|
| **Google Sign-In** | Supabase Auth (`auth.external.google` in config.toml) | ✅ Verified (OAuth redirect to Google works) |
| **Google Maps Geocoding** | `geocode-address` Edge Function | ✅ Implemented (API key server-side only) |
| **AI Chatbot (OpenRouter)** | `chatbot` Edge Function | ✅ Deployed & responding (with rate-limit 429 on free model) |
| **Email/SMS Notifications** | `dispatch-notification` Edge Function | ✅ Upgraded from stub to real SendGrid + Twilio |
| **PayMongo Payments** | `create-payment-intent` + `payment-webhook` | ✅ Fully implemented (Stripe kept as fallback) |

---

## 10. What's Done vs. What's Planned

### ✅ Completed

- **Database:** 11 tables, 6 enums, exclusion constraint (no double-booking), 7 indexes
- **RLS:** Policies on every table, tested per-role (customer/mechanic/admin/anon)
- **Triggers:** 6 trigger functions (auto-profile, updated_at, rating rollups, notifications, status enforcement)
- **Edge Functions:** 6 functions (assign-mechanic, create-payment-intent, payment-webhook, dispatch-notification, geocode-address, chatbot)
- **Shared utilities:** CORS helper, Supabase client factory, payment provider abstraction
- **Tests:** 18 acceptance criteria across SQL + Node.js test suites
- **Frontend:** Ionic + React + Vite app with 16 components, auth hook, chat widget, static data
- **CI:** GitHub Actions workflow (lint, migration validation, function typecheck)
- **Documentation:** 10 docs files covering spec, architecture, schema, API, setup, rules, phases, build summary, cleanup report

### 📋 In the Spec But Not Yet Started

- **Full seed data:** The spec calls for 45 vehicles (3 categories × 3 sub × 5 products) and 30 services (6 categories × 5 services) with 5 sample users in various roles. The current `seed.sql` has 3 vehicles and 3 services (minimal demo).
- **Real-time subscription in frontend:** The `notifications` Realtime subscription is defined in the architecture but not yet wired into the React components.
- **Vercel deployment:** The Vercel project is documented but the actual deploy step hasn't been executed.
- **Admin UI:** A web interface for admins to manage vehicles, services, and users is not yet built (the frontend is a customer-facing MVP).

### ❌ Out of Scope (Explicitly Deferred per SPEC.md)

- Native push notifications (APNs/FCM) — v1 ships in-app notifications + Realtime only
- AI-powered vehicle diagnostics — roadmap item, not v1
- Multi-currency/multi-region support
- Loyalty programs, promo codes, referrals
- Admin analytics dashboards
- Automated payroll/payout system for mechanics (payment *records* are tracked; payout automation is not)
- Partner/dealer portals
- Full GPS tracking map rendering (backend stores lat/lng; map UI is frontend-future)

---

## 11. Quick Reference: Key Files

| File | What You Need to Know |
|---|---|
| `apps/backend/supabase/migrations/*.sql` | The **source of truth** for the database schema. 7 files, applied in order. |
| `apps/backend/supabase/functions/_shared/supabaseClient.ts` | `createServiceClient()` (service-role) and `createUserClient(jwt)` (anon) — used by every function. |
| `apps/backend/supabase/functions/_shared/paymentProvider.ts` | Provider-agnostic payment abstraction — Swap Stripe ↔ PayMongo via env var. |
| `apps/backend/supabase/config.toml` | Local dev config: `[functions.*]` `verify_jwt = false` (manual JWT check in code). |
| `apps/web/src/supabaseClient.ts` | **The only place the anon key lives in the frontend.** Never the service-role key. |
| `apps/web/src/hooks/useAuth.ts` | Session management + identity resolution (fetches `profiles` for `full_name`). |
| `packages/shared-types/src/domain.types.ts` | Hand-written domain types (enums, interfaces, error codes) shared across backend + frontend. |
| `docs/PHASES.md` | The sequential build plan with acceptance criteria — if you implement a new feature, add a phase here. |
| `docs/RULES.md` | Non-negotiable coding & security standards — **read before writing any backend code.** |

---

## 12. How to Explain This System to Others

### For a Product Manager
> "LS Customs is a two-sided marketplace: customers rent vehicles or book mobile mechanics, and the backend is entirely on Supabase. The database enforces all business rules — you can't double-book a car (it's a PostgreSQL exclusion constraint), you can't see another customer's data (it's RLS), and rating updates happen atomically (it's a trigger). Edge Functions handle the stuff that can't be SQL — finding the nearest mechanic, talking to payment providers, geocodifying addresses. The frontend is an Ionic app that calls everything via `supabase-js`."

### For a Backend Engineer
> "Seven migrations build the schema. Every table has RLS enabled (verified: zero rows with rowsecurity=false). Triggers handle auto-profile creation, updated_at, rating rollups, notifications, and status-transition enforcement. Six Edge Functions (Deno/TypeScript, strict mode) handle matching, payments (Stripe + PayMongo), notification dispatch, geocoding, and AI chatbot. All secrets are in `supabase secrets set`, never in git. The service_role key is only used inside Edge Functions for privileged writes — ownership is still checked in code (defense in depth)."

### For a Frontend Engineer
> "The frontend is an Ionic + React + Vite app. Auth is handled by the `useAuth` hook (session state via `supabase.auth.onAuthStateChange`). All data access goes through the `supabaseClient` singleton (anon key only). Most CRUD is direct PostgREST — no custom API needed because RLS is the contract. Edge Functions are called via `supabase.functions.invoke()` for matching, payments, and chatbot. The ChatBot component is the best example of the full stack in action."

---

## 13. Lessons Learned (From the Cleanup Audit)

The `CLEANUP_REPORT.md` and `BUILD_SUMMARY.txt` documents capture several hard-won lessons:

1. **Consolidate migrations aggressively when there's no remote project.** The original 9 migrations were consolidated to 7 by merging patch files into their parents. This keeps the migration history clean. Once a remote project exists, migrations are append-only — no edits.

2. **Test non-Error throws in catch blocks.** The `extractJwt()` function throws a plain object (not an `Error` instance), which broke the catch blocks until they were patched to check for `typeof err === "object" && "status" in err`.

3. **Postgres `with check` clauses in RLS are subtle.** For multi-policy UPDATE, PostgreSQL evaluates the `WITH CHECK` clause of ANY applicable policy independently. An admin UPDATE policy with `with check (true)` would let ANY authenticated user update ANY visible row to ANY value. Every admin UPDATE policy MUST include `with check (public.is_admin())`.

4. **Triggers can't reference OLD in INSERT WHEN clauses.** PostgreSQL INSERT triggers can't reference `OLD` in the `WHEN` clause, so insert vs update vs delete triggers for the same function must be separate trigger definitions (the rating rollup triggers are split into 3 separate triggers).

5. **Service-role JWT has no `sub` claim.** The `enforce_service_status_transition` trigger checks `request.jwt.claims ->> 'role' = 'service_role'` to bypass transition validation for Edge Function calls, because service-role JWTs don't have a `sub` (user ID) and `current_role()` returns NULL for them.
```

---