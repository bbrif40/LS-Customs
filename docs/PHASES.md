# PHASES.md — Backend Development Roadmap

> Sequential phases. Do not start a phase until the previous phase's acceptance criteria are all met. Each phase should end in a git commit / migration that leaves the database in a working, testable state.

---

## Phase 0: Environment Bootstrap

**Goal:** A working local Supabase project linked to a remote project, with the repo structured for migrations.

**Tasks:**
- Install Supabase CLI; run `supabase init` in the project root.
- Create the remote Supabase project (Postgres + Auth + Storage enabled).
- Link local project: `supabase link --project-ref <ref>`.
- Set up `.env.local` (frontend-facing) and `.env` (server/Edge Function-facing) with placeholders — see `DOCUMENTATION.md`.
- Set up folder structure: `apps/backend/supabase/migrations/`, `apps/backend/supabase/functions/`, `apps/backend/supabase/seed.sql`.

**Acceptance Criteria:**
- [ ] `supabase start` runs cleanly and Studio is reachable at `localhost:54323`.
- [ ] `supabase db reset` applies zero migrations without error (empty baseline).
- [ ] Project is linked to a real Supabase cloud project (`supabase projects list` shows it).

---

## Phase 1: Database Schema & Row Level Security

**Goal:** All core tables exist, relationships are correct, and RLS locks down access exactly as defined in `DATABASE.md`.

**Tasks:**
- Write migration(s) creating: `profiles`, `addresses`, `vehicles`, `vehicle_bookings`, `mechanic_profiles`, `mechanic_services`, `service_bookings`, `service_booking_items`, `reviews`, `notifications`, `payments`.
- Create enums: `user_role`, `rental_category`, `booking_status`, `service_main_category`, `payment_status`.
- Add foreign keys, checks (e.g., `end_date > start_date`), and indexes on frequently filtered columns (`status`, `customer_id`, `mechanic_id`).
- Enable RLS on every table and write policies per role (see `DATABASE.md` §4).
- Write `updated_at` trigger function and attach to all mutable tables.

**Acceptance Criteria:**
- [ ] `supabase db reset` applies all migrations cleanly from empty.
- [ ] `select * from pg_tables where rowsecurity = false and schemaname = 'public'` returns **zero rows** (RLS is on everywhere).
- [ ] As an anonymous/unauthenticated role, querying `vehicles` and `mechanic_services` returns published rows only (public catalog is readable).
- [ ] As Customer A, querying `vehicle_bookings` returns **only** Customer A's rows, even though Customer B has bookings in the table.
- [ ] Attempting to insert a `vehicle_bookings` row for a date range that overlaps an existing confirmed booking on the same vehicle fails (constraint or trigger enforced).
- [ ] Attempting to set `service_bookings.status` directly from a disallowed role/transition (e.g., a customer marking their own booking `completed`) is rejected by policy.

---

## Phase 2: Auth, Profiles & Triggers

**Goal:** Signup creates a usable profile automatically; role-based helper functions exist for use in RLS policies; rating rollups work.

**Tasks:**
- Write `handle_new_user()` trigger function on `auth.users` (AFTER INSERT) that creates a matching `profiles` row, defaulting `role = 'customer'`.
- Write a `current_role()` / `is_admin()` / `is_mechanic()` SQL helper function (SECURITY DEFINER or based on `auth.uid()` + `profiles` lookup) for reuse across RLS policies.
- Write trigger(s) to recompute `mechanic_profiles.rating_avg` and `vehicles.rating_avg` whenever a row is inserted/updated in `reviews`.
- Write trigger to insert a `notifications` row whenever `service_bookings.status` or `vehicle_bookings.status` changes.
- Seed at least one `admin` and one `mechanic` profile manually for testing role-based policies.

**Acceptance Criteria:**
- [ ] Creating a user via `supabase.auth.signUp()` (or the Studio Auth panel) results in exactly one new `profiles` row within the same transaction/request cycle.
- [ ] Deleting a user cascades correctly (profile removed or soft-deleted, per policy defined in `DATABASE.md`).
- [ ] Inserting a review updates the target's `rating_avg` and `rating_count` correctly (verified with 2+ reviews).
- [ ] Updating a `service_bookings.status` row produces a corresponding `notifications` row for the correct `user_id`.
- [ ] `is_admin()` returns `true` only for the seeded admin session and `false` for customer/mechanic sessions.

---

## Phase 3: Edge Functions & Webhooks

**Goal:** Server-side business logic (matching, payments, notifications) runs as Supabase Edge Functions, deployable independently of the database.

**Tasks:**
- `assign-mechanic`: given a `service_bookings.id`, find the nearest available mechanic (using stored `mechanic_profiles.current_lat/lng`) and assign them; update status to `assigned`.
- `create-payment-intent`: given a booking type + id, create a payment intent with the configured provider and store the reference in `payments`.
- `payment-webhook`: receives provider callbacks (e.g., Stripe/PayMongo webhook), verifies signature, updates `payments.status` and the parent booking's status.
- `dispatch-notification`: delivers unsent `notifications` via email (SendGrid) and SMS (Twilio), reading recipient contact info from `profiles` and `auth.users`.
- Configure `apps/backend/supabase/functions/<name>/index.ts` per function with shared `_shared/` utilities (CORS headers, Supabase client factory, auth check, payment provider abstraction).
- Document required secrets via `supabase secrets set`.

**Acceptance Criteria:**
- [ ] `supabase functions serve` runs all functions locally without error.
- [ ] Calling `assign-mechanic` with a valid pending `service_bookings.id` and at least one available mechanic seeded nearby results in `status = 'assigned'` and `mechanic_id` populated.
- [ ] Calling `assign-mechanic` with no available mechanics returns a clear 409/error response and leaves status as `pending`.
- [ ] `create-payment-intent` returns a client secret/reference and a `payments` row is created with `status = 'pending'`.
- [ ] A simulated webhook payload (signed with the test secret) correctly flips `payments.status` to `succeeded` and the parent booking accordingly.
- [ ] An unsigned/invalid webhook payload is rejected with 401/400 and makes no DB changes.

---

## Phase 4: Testing, Hardening & Deployment

**Goal:** The backend is verified end-to-end and deployed, ready for the Ionic frontend to consume.

**Tasks:**
- Write a seed script (`apps/backend/supabase/seed.sql`) covering: sample profiles per role, the full vehicle catalog (3 main × 3 sub × 5 products), the full mechanic service catalog (3 main × 3 sub × 5 services), a handful of sample bookings in different statuses.
- Write integration test scripts (SQL or a small Node/Deno test runner) covering every acceptance criterion above.
- Run `supabase db lint` / `supabase db diff` to confirm migrations match the live schema with no drift.
- Review every RLS policy for the "authenticated but wrong owner" and "anonymous" cases explicitly (a checklist per table).
- Deploy Edge Functions: `supabase functions deploy <name>` for each function; confirm secrets are set on the hosted project.
- Set up the Vercel project: environment variables for `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-side only), and any payment provider keys.
- Confirm Vercel deploy succeeds with a placeholder/minimal Ionic build (or a health-check API route) that can reach Supabase.

**Acceptance Criteria:**
- [ ] `supabase db reset && supabase db seed` reproduces a full, demo-ready dataset from scratch.
- [ ] All Phase 1–3 acceptance criteria still pass after seeding (no test relies on manually-created data only).
- [ ] `supabase db diff` shows no uncommitted schema drift between local and remote.
- [ ] All Edge Functions are live on the hosted Supabase project and respond correctly to a real (non-local) request.
- [ ] Vercel deployment succeeds and a deployed health-check endpoint successfully queries Supabase using the anon key.
- [ ] `RULES.md` compliance check: no secret keys committed to git, no service-role key referenced from any client-side code path.

---

## Summary Timeline

| Phase | Focus | Primary Deliverable |
|---|---|---|
| 0 | Environment | Linked local + remote Supabase project |
| 1 | Schema & RLS | Full schema, locked down per role |
| 2 | Auth & Triggers | Auto-profile creation, rollups, notification triggers |
| 3 | Edge Functions | Mechanic matching, payments, webhooks |
| 4 | Test & Deploy | Seeded, tested, deployed backend ready for frontend |
