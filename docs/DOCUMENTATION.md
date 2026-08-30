# DOCUMENTATION.md — Setup, Migrations, Seeding & Deployment

> Follow this document top to bottom for a fresh environment. Commands assume macOS/Linux shell; Windows users should use WSL.

---

## 1. Prerequisites

- Node.js 18+ and npm
- Docker Desktop (required by the Supabase CLI to run Postgres/Auth/Studio locally)
- Supabase CLI: `npm install -g supabase`
- A Supabase account and a new project created at [supabase.com](https://supabase.com)
- (Later, for deployment) A [Vercel](https://vercel.com) account
- (Later, for payments) A test account with your chosen provider (Stripe or PayMongo)

---

## 2. Repository Structure

```
/
├── apps/backend/
│   ├── supabase/
│   │   ├── config.toml
│   │   ├── .env
│   │   ├── migrations/
│   │   │   ├── 20260819120516_init_enums.sql
│   │   │   ├── 20260819120520_init_schema.sql
│   │   │   ├── 20260819120524_rls_policies.sql
│   │   │   ├── 20260819120527_triggers.sql
│   │   │   ├── 20260819120531_indexes.sql
│   │   │   ├── 20260819120535_grants.sql
│   │   │   └── 20260819120540_phase2_triggers.sql
│   │   ├── functions/
│   │   │   ├── assign-mechanic/index.ts
│   │   │   ├── create-payment-intent/index.ts
│   │   │   ├── payment-webhook/index.ts
│   │   │   ├── dispatch-notification/index.ts
│   │   │   ├── geocode-address/index.ts
│   │   │   ├── _shared/ (cors.ts, supabaseClient.ts, paymentProvider.ts)
│   │   └── seed.sql
│   └── tests/
│       ├── test_phase1_schema_rls_isolation.sql
│       ├── test_phase2_auth_triggers_ratings.sql
│       ├── seed_phase3_edge_functions.sql
│       └── test_phase3_edge_functions.js
├── .env.local          (frontend env — created later, ignored by git)
├── .env                (local server/functions env — ignored by git)
├── SPEC.md
├── PHASES.md
├── DATABASE.md
├── API.md
├── ARCHITECTURE.md
├── DOCUMENTATION.md
└── RULES.md
```

---

## 3. Local Environment Setup

### 3.1 Initialize Supabase locally

```bash
supabase init
supabase start
```

`supabase start` boots local Postgres, Auth, Storage, Realtime, and Studio in Docker. On success it prints local URLs and keys:

```
API URL: http://127.0.0.1:54321
DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
Studio URL: http://127.0.0.1:54323
anon key: eyJ...
service_role key: eyJ...
```

### 3.2 Link to your remote project

```bash
supabase login
supabase link --project-ref <your-project-ref>
```

Find `<your-project-ref>` in your Supabase project's dashboard URL or Settings → General.

---

## 4. Environment Variables

Create `.env.local` (frontend-safe — will be consumed by the Ionic app later) and `.env` (local server-side use, e.g., seed scripts):

**`.env.local`** (safe to expose to the client bundle)
```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<anon key from supabase start>
```

**`.env`** (never commit, never ship to a client bundle)
```
SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase start>
SUPABASE_URL=http://127.0.0.1:54321

# Payment Provider (set to PAYMONGO or STRIPE)
PAYMENT_PROVIDER=PAYMONGO
PAYMONGO_SECRET_KEY=<paymongo secret key>
PAYMONGO_WEBHOOK_SECRET=<paymongo webhook signing secret>
PAYMONGO_BASE_URL=http://host.docker.internal:8090
STRIPE_SECRET_KEY=<stripe secret key>
STRIPE_WEBHOOK_SECRET=<stripe webhook signing secret>
STRIPE_BASE_URL=https://api.stripe.com

# Google OAuth
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=<google client id>
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=<google client secret>

# SendGrid (email notifications)
SENDGRID_API_KEY=<sendgrid api key>
SENDGRID_FROM_EMAIL=noreply@ls-customs.ph

# Twilio (SMS notifications)
TWILIO_ACCOUNT_SID=<twilio sid>
TWILIO_AUTH_TOKEN=<twilio auth token>
TWILIO_FROM_NUMBER=<twilio phone number>

# Google Maps (geocoding)
GOOGLE_MAPS_API_KEY=<google maps api key>
```

Add both files to `.gitignore` immediately:
```
.env
.env.local
```

For the **hosted** project, set the real values via:
```bash
supabase secrets set PAYMENT_PROVIDER=PAYMONGO
supabase secrets set PAYMONGO_SECRET_KEY=sk_live_xxx
supabase secrets set PAYMONGO_WEBHOOK_SECRET=whsec_xxx
supabase secrets set SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
supabase secrets set SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=xxx
supabase secrets set SENDGRID_API_KEY=SG.xxx
supabase secrets set TWILIO_ACCOUNT_SID=ACxxx
supabase secrets set TWILIO_AUTH_TOKEN=xxx
supabase secrets set GOOGLE_MAPS_API_KEY=xxx
```
Edge Functions read these with `Deno.env.get(...)`. See `supabase/.env` for all available variables.

---

## 5. Running Migrations

Migrations are plain SQL files in `apps/backend/supabase/migrations/`, applied in filename order.

```bash
# Create a new migration file
supabase migration new <descriptive_name>

# Apply all migrations to the local DB (drops and rebuilds from scratch)
supabase db reset

# Push local migrations to the linked remote project
supabase db push

# Check for drift between local migration files and the live remote schema
supabase db diff --linked
```

**Rule of thumb:** never hand-edit the schema in Studio for anything that should persist — always write a migration file, even for a one-line column addition, so the remote and every teammate's local DB stay reproducible.

---

## 6. Seeding Test Data

`apps/backend/supabase/seed.sql` is run automatically by `supabase db reset` (and can be re-run manually with `supabase db reset` again, or `psql -f apps/backend/supabase/seed.sql` against the local DB URL).

Seed data should include, per `PHASES.md` Phase 4:
- 1 admin profile, 2–3 mechanic profiles (with varied `current_lat/lng` around a test city center), 3–5 customer profiles.
- Full vehicle catalog: 3 main categories × 3 sub-categories × 5 products = 45 vehicles.
- Full mechanic service catalog: 6 sub-categories × 5 services = 30 services.
- A handful of bookings in different statuses (`pending`, `assigned`, `completed`, `cancelled`) so every RLS/UI state can be tested without manual setup.

Example snippet:
```sql
insert into public.vehicles (category, sub_category, name, price_per_day, seats, transmission)
values
  ('short_term', 'Short-term Rental', 'Economy Compact', 1500.00, 4, 'Automatic'),
  ('short_term', 'Short-term Rental', 'Standard Sedan', 1800.00, 5, 'Automatic');
  -- ... continue for full catalog
```

> Note: seeding rows into `auth.users` directly is unsupported by normal SQL inserts (Supabase manages that table). Create seed users via `supabase.auth.admin.createUser()` in a small Node/Deno script, or via the Studio Auth panel, then let the `handle_new_user` trigger create their `profiles` row — do not hand-insert into `profiles` for real auth-backed test users.

---

## 7. Running Edge Functions Locally

```bash
supabase functions serve --env-file apps/backend/supabase/.env
```

Invoke a function locally:
```bash
curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/assign-mechanic' \
  --header 'Authorization: Bearer <a valid user JWT>' \
  --header 'Content-Type: application/json' \
  --data '{"service_booking_id":"<uuid>"}'
```

Get a test JWT quickly by signing in via the Studio Auth panel or `supabase.auth.signInWithPassword()` in a scratch script, then copying `access_token` from the response.

---

## 8. Deploying

### 8.1 Deploy database changes
```bash
supabase db push
```

### 8.2 Deploy Edge Functions
```bash
supabase functions deploy assign-mechanic
supabase functions deploy create-payment-intent
supabase functions deploy payment-webhook
supabase functions deploy dispatch-notification
supabase functions deploy geocode-address
```
Or deploy all at once: `supabase functions deploy`.

### 8.3 Configure the payment provider webhook
Point your provider's webhook (Stripe/PayMongo dashboard) at:
```
https://<project-ref>.supabase.co/functions/v1/payment-webhook
```
Copy the signing secret it gives you into `supabase secrets set PAYMENT_PROVIDER_WEBHOOK_SECRET=...`.

### 8.4 Deploy the frontend to Vercel *(when the Ionic app exists)*
1. Import the repo into Vercel.
2. Set environment variables in Vercel Project Settings → Environment Variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - *(never add `SUPABASE_SERVICE_ROLE_KEY` here — it does not belong on Vercel)*
3. Build command / output directory follow Ionic's standard Vercel deployment guide for the chosen framework (Angular/React/Vue) — to be finalized when the frontend phase starts.
4. Confirm the deployed app can reach Supabase by checking a simple authenticated query in the browser console or a health-check page.

---

## 9. Day-to-Day Developer Workflow

```bash
# Start your day
supabase start

# Make a schema change
supabase migration new add_promo_codes_table
# ...edit the generated SQL file...
supabase db reset          # rebuild local DB from all migrations + seed

# Verify RLS still behaves (see PHASES.md acceptance criteria)
# ...run test scripts...

# When ready
supabase db push           # ship schema to remote
git add supabase/migrations/*.sql
git commit -m "Add promo codes table"
```

---

## 10. Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| `supabase start` hangs | Docker not running | Start Docker Desktop, retry |
| RLS blocks a query you expect to work | Testing with `anon` key instead of a signed-in user's JWT | Sign in first, use the resulting `access_token` |
| Migration fails with "type already exists" | Ran a migration twice without `db reset` | Use `supabase db reset` for local iteration, not re-running the same file |
| Edge Function can't find env var | Forgot `--env-file .env` locally, or forgot `supabase secrets set` remotely | Check both local and remote secret sources separately |
| Webhook signature verification fails | Using the wrong secret (test vs. live, or local vs. deployed function URL) | Confirm the webhook is pointed at the right environment's secret |
