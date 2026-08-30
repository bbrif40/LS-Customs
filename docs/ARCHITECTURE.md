# ARCHITECTURE.md — System Design

> This document explains how the pieces fit together: Ionic (frontend, future), Supabase (backend, current focus), and Vercel (deployment). It maps directly onto the five services identified in the SOA activity: **User Authentication & Account Management**, **Vehicle Rental & Mobile Mechanic Booking**, **Notification**, **Review & Recommendation**, and the **Application/UI layer** — with **Flow of Booking** as the orchestrating Enterprise Service.

---

## 1. High-Level Overview

```
┌─────────────────────────────┐
│   Ionic Frontend (later)    │   Web / iOS / Android (Capacitor)
│  Application Service (SOA)  │
└──────────────┬───────────────┘
               │ HTTPS (supabase-js client)
               ▼
┌──────────────────────────────────────────────────────────┐
│                     Supabase Platform                     │
│  ┌────────────┐  ┌───────────────┐  ┌───────────────────┐ │
│  │ Supabase   │  │ PostgreSQL +  │  │  Edge Functions    │ │
│  │ Auth       │  │ RLS (this repo)│ │  (Deno, TS)        │ │
│  │ (Infra Svc)│  │ (Business/     │  │  (Enterprise Svc:  │ │
│  │            │  │  Enterprise Svc)│ │  Flow of Booking)  │ │
│  └────────────┘  └───────────────┘  └─────────┬──────────┘ │
│                                                 │            │
│  ┌────────────┐                                │            │
│  │ Realtime    │◀── notifications table ────────┘            │
│  │ (Infra Svc) │                                              │
│  └────────────┘                                              │
└──────────────────────────────┬────────────────────────────────┘
                                │ webhook / REST
                                ▼
                  ┌───────────────────────────┐
                  │ Payment Provider (Stripe/  │
                  │ PayMongo) — external       │
                  └───────────────────────────┘

┌─────────────────────────────┐
│           Vercel            │   Hosts the Ionic web build (and any
│  (frontend hosting + API    │   server-side API routes/proxies the
│   routes if needed)         │   frontend needs beyond Supabase)
└─────────────────────────────┘
```

---

## 2. Component Responsibilities

### 2.1 Supabase Auth (Infrastructure Service)
- Issues and verifies JWTs for email/password (and future OAuth) sign-in.
- `auth.users` is the source of truth for identity; `public.profiles` is the app-facing extension (see `DATABASE.md`).
- The Ionic app never talks to Postgres directly with elevated privileges — it always authenticates first and gets a JWT scoped by RLS.

### 2.2 PostgreSQL + RLS (Business & Enterprise Services)
- Owns all durable state: vehicles, bookings, mechanics, reviews, payments, notifications.
- RLS is the **single source of authorization truth** — even if a bug in the frontend or an Edge Function forgets a filter, the database itself refuses unauthorized reads/writes. This is why `DATABASE.md` treats RLS as mandatory on every table, not optional hardening.
- Triggers implement the parts of the "Enterprise Service" (Flow of Booking) that must be transactionally atomic with the data change itself — e.g., "a new review always recalculates the rating in the same transaction," which an Edge Function calling back later could not guarantee.

### 2.3 Edge Functions (Enterprise Service — Flow of Booking orchestration)
- Anything that (a) needs the `service_role` key, (b) calls a third party (payment provider), or (c) requires non-trivial matching logic (nearest-mechanic search) lives here, not in the database or the frontend.
- Functions are **stateless** and **idempotent where possible** — they read/write Postgres but hold no memory between invocations, so they can be retried safely by webhooks.
- This is the direct implementation of the "Flow of Booking" enterprise service identified in the SOA exercise: it composes the Business Services (vehicle rental, mechanic booking, reviews) with the Infrastructure Services (auth, notifications) to fulfill one customer request.

### 2.4 Realtime / Notifications (Infrastructure Service)
- The frontend subscribes to `notifications` via Supabase Realtime (`postgres_changes` on `notifications` filtered by `user_id`), so status updates ("mechanic assigned," "en route") appear live without polling.
- This directly implements the SOA activity's **loose coupling** principle: the booking flow doesn't call the frontend directly — it writes a row, and whoever is listening (customer or mechanic app) picks it up independently.

### 2.5 Ionic Frontend (Application Service) — *future phase*
- Talks to Supabase exclusively through `supabase-js` (anon key) for direct table access, and via `fetch`/`supabase.functions.invoke()` for Edge Functions.
- Never holds the `service_role` key. Ever.
- Will be built as an Ionic + Capacitor app producing web, iOS, and Android targets from one codebase, matching the "dedicated mobile app" future-growth item in the business proposal.

### 2.6 Vercel
- Hosts the built Ionic web app (static/SPA output) and, if needed later, any lightweight Node/Edge API routes that don't belong in Supabase (e.g., a BFF layer for third-party services that shouldn't be called directly from the client).
- Environment variables on Vercel hold only client-safe values (`SUPABASE_URL`, `SUPABASE_ANON_KEY`); anything requiring the service-role key runs in Supabase Edge Functions, not Vercel, to keep the privileged surface in one place.
- Deployment is triggered from the same monorepo/git flow as the backend, but the backend (Supabase project) is deployed independently via the Supabase CLI — the two are not coupled in a single deploy step.

---

## 3. Authentication Flow

```
1. User submits email/password in Ionic app
2. supabase-js: supabase.auth.signUp() / signInWithPassword()
3. Supabase Auth validates, returns { access_token, refresh_token }
4. supabase-js stores session (Capacitor Preferences on mobile, localStorage on web)
5. auth.users row created (on signup) → handle_new_user trigger fires →
   profiles row created with role = 'customer'
6. Every subsequent request includes the access_token as a Bearer JWT
7. PostgREST/RLS evaluates auth.uid() against policies on each query
8. Access token refreshes automatically via supabase-js before expiry
```

Role escalation (customer → mechanic, or granting admin) is **never** self-service — only an admin can update `profiles.role`, enforced by the RLS policy in `DATABASE.md` §4.1.

---

## 4. Booking Flow (Service/Mechanic Path — the "Flow of Booking" Enterprise Service)

```
1. Customer creates service_bookings row (status='pending') + service_booking_items
   — direct insert via supabase-js, protected by RLS (must be their own customer_id)
2. DB webhook fires on INSERT → calls assign-mechanic Edge Function
3. assign-mechanic finds nearest available mechanic → updates status='assigned',
   sets mechanic_id
4. notify_on_status_change trigger fires → inserts notifications row for
   customer + mechanic
5. Both apps receive the update via Realtime subscription
6. Mechanic updates status progressively (en_route → in_progress → completed)
   via direct update, restricted by RLS to forward-only transitions
7. Customer triggers create-payment-intent → pays via provider SDK
8. Provider sends payment-webhook → payments.status='succeeded' →
   booking marked payable/settled
9. Customer leaves a review → reviews insert → rating rollup trigger updates
   mechanic_profiles.rating_avg
```

This flow demonstrates **service composability** (checkout/booking composes matching, notification, and payment as one workflow) and **loose coupling** (each step reacts to a state change rather than being directly called by the previous step) — the two SOA principles emphasized in the design activity, plus **reusability**: the same `notifications` table and trigger mechanism serves both the rental and service booking flows.

---

## 5. Security Boundaries

| Key | Lives in | Exposed to client? |
|---|---|---|
| `SUPABASE_ANON_KEY` | Ionic app, Vercel env | Yes — safe, RLS-protected |
| `SUPABASE_URL` | Ionic app, Vercel env | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Edge Function secrets only | **Never** |
| Payment provider secret key | Supabase Edge Function secrets only | **Never** |
| Payment provider webhook secret | Supabase Edge Function secrets only | **Never** |

Any code path that would put a service-role or provider secret key into a bundle shipped to a browser or app is a hard failure per `RULES.md`.

---

## 6. Deployment Topology

- **Supabase project** (single environment for now — local dev via CLI, one hosted "production" project). A staging project is a natural Phase 5+ addition, out of scope for the initial backend build.
- **Vercel project** deploys the Ionic web build and points at the hosted Supabase project via environment variables (no separate backend deploy step required on Vercel's side).
- **Edge Functions** deploy independently via `supabase functions deploy`, versioned alongside database migrations in the same git repo, but on their own deploy command — schema and function changes are not atomically coupled, so `PHASES.md` Phase 4 explicitly checks both are in sync before sign-off.
