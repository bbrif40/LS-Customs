# API.md — Data Access Layer, Edge Functions & Webhooks

> Two layers of API surface here: (1) **direct table access** via the Supabase JS client (PostgREST under the hood, protected entirely by RLS), and (2) **custom Edge Functions** for logic that can't/shouldn't live in a policy (matching, payments, notifications). The Ionic frontend will call both, but only Edge Functions are described with request/response contracts since direct table access follows standard PostgREST semantics.

---

## 1. Direct Table Access (PostgREST via `supabase-js`)

Standard pattern — no custom API needed, RLS does the enforcement. Frontend will use `@supabase/supabase-js`. Examples the frontend will eventually use (documented here so the schema is validated against real access patterns):

```js
// Browse active vehicles in a category
const { data } = await supabase
  .from('vehicles')
  .select('*')
  .eq('category', 'short_term')
  .eq('is_active', true);

// Customer's own bookings
const { data } = await supabase
  .from('service_bookings')
  .select('*, service_booking_items(*, mechanic_services(*))')
  .eq('customer_id', userId)
  .order('created_at', { ascending: false });

// Mark a notification read
await supabase
  .from('notifications')
  .update({ is_read: true })
  .eq('id', notificationId);
```

No REST endpoint documentation is needed for these — RLS is the contract. Edge Functions below cover everything that needs privileged (service-role) access or third-party calls.

---

## 2. Edge Functions

All functions live under `apps/backend/supabase/functions/<name>/index.ts`, written in TypeScript (Deno runtime). Each function:
- Validates the caller's JWT (via the `Authorization` header) unless explicitly public.
- Uses a `service_role` Supabase client **only inside the function**, never exposed to the client.
- Returns JSON with a consistent envelope: `{ data, error }`.

### 2.1 `assign-mechanic`

**Purpose:** Given a pending service booking, find and assign the nearest available mechanic.

**Trigger:** Called by the frontend immediately after a `service_bookings` row is created (or by a DB webhook on insert — see §3).

**Auth:** Requires authenticated customer JWT (function verifies the booking belongs to the caller, or accepts a service-role call from a DB webhook).

**Request:**
```json
POST /functions/v1/assign-mechanic
{
  "service_booking_id": "uuid"
}
```

**Logic:**
1. Fetch the booking; confirm `status = 'pending'`.
2. Fetch the pin location (`address_id` → `addresses.lat/lng`, or `pin_lat/pin_lng` directly).
3. Query `mechanic_profiles` where `is_available = true`, ordered by distance (Haversine calculation in SQL or PostGIS `<->` if `postgis` extension is enabled).
4. Assign the nearest mechanic: set `mechanic_id`, `status = 'assigned'`.
5. Insert a `notifications` row for both customer and mechanic (or rely on the `notify_on_status_change` trigger).

**Response (success):**
```json
{
  "data": {
    "service_booking_id": "uuid",
    "mechanic_id": "uuid",
    "mechanic_name": "Juan Dela Cruz",
    "status": "assigned"
  },
  "error": null
}
```

**Response (no mechanic available):**
```json
{
  "data": null,
  "error": { "code": "NO_MECHANIC_AVAILABLE", "message": "No available mechanic found near this location." }
}
```
HTTP status: `409 Conflict`.

---

### 2.2 `create-payment-intent`

**Purpose:** Create a payment intent with the configured provider for a rental or service booking, and record it.

The active provider is selected via the `PAYMENT_PROVIDER` env var:
- `"paymongo"` — PayMongo (Philippines) — **default for local dev**
- `"stripe"` — Stripe (backwards-compatible fallback)

Provider-specific secrets are read from dedicated env vars (`PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`) with a fallback to the generic `PAYMENT_PROVIDER_SECRET_KEY` / `PAYMENT_PROVIDER_WEBHOOK_SECRET`.

**Auth:** Requires authenticated customer JWT; verifies the booking belongs to the caller.

**Request:**
```json
POST /functions/v1/create-payment-intent
Headers: { "Authorization": "Bearer <jwt>", "Idempotency-Key": "<uuid>" (optional) }
{
  "booking_type": "vehicle",
  "booking_id": "uuid"
}
```

**Logic:**
1. Fetch the booking, confirm `total_price` and verify `customer_id` matches the JWT caller.
2. Convert `total_price` → cents (integer).
3. Call the payment provider's API:
   - **PayMongo:** `POST /v1/payment_intents` with Basic auth (`base64(secret:)`) and JSON body `{ data: { attributes: { amount, currency: "PHP", payment_method_allowed: [...] } } }`.
   - **Stripe:** `POST /payment_intents` with Bearer auth and URL-encoded body.
4. Insert a `payments` row: `status = 'pending'`, `provider = <provider>`, `provider_reference = <intent id>`.
5. Return `client_secret` (normalized from PayMongo's `client_key`) for the frontend SDK to complete payment.

**Response:**
```json
{
  "data": {
    "payment_id": "uuid",
    "client_secret": "pi_xxx_client_key_yyy",
    "amount": 7500.00,
    "currency": "PHP",
    "provider": "paymongo"
  },
  "error": null
}
```

---

### 2.3 `payment-webhook`

**Purpose:** Receive asynchronous payment status updates from the configured provider.

The active provider is selected via the `PAYMENT_PROVIDER` env var:
- `"paymongo"` — verifies `Paymongo-Signature` header (format: `t=<timestamp>,te=<test_sig>,li=<live_sig>`)
- `"stripe"` — verifies `stripe-signature` header (format: `t=<timestamp>,v1=<signature>`)

Both use HMAC-SHA256(secret, `${timestamp}.${raw_body}`) with a 5-minute timestamp tolerance for replay protection.

**Auth:** None (public endpoint) — instead verifies the provider's signature header against the webhook secret stored in Supabase secrets. **Any request that fails signature verification is rejected before touching the database.**

**Request:** Raw provider payload (varies by provider), e.g. for PayMongo:
```json
POST /functions/v1/payment-webhook
Headers: { "Paymongo-Signature": "t=...,te=...,li=..." }
{
  "data": {
    "id": "evt_xxx",
    "type": "payment_intent.succeeded",
    "attributes": {
      "payment_intent_id": "pi_xxx",
      "status": "succeeded",
      "amount": 750000,
      "currency": "PHP"
    }
  }
}
```

Or for Stripe:
```json
POST /functions/v1/payment-webhook
Headers: { "Stripe-Signature": "t=...,v1=..." }
{
  "type": "payment_intent.succeeded",
  "data": { "object": { "id": "pi_xxx", "status": "succeeded" } }
}
```

**Logic:**
1. Read raw body (bytes) BEFORE parsing — signature is computed on raw bytes.
2. Verify signature using the raw body + webhook secret.
3. Normalize the provider-specific event payload into a common shape (via `paymentProvider.ts`).
4. Look up the `payments` row by `provider_reference`.
5. Update `payments.status` accordingly (`succeeded` / `failed`).
6. On success, update the parent booking's `status` (rental → `confirmed`; service → leave as-is, payment success unlocks but doesn't change service workflow status).
7. Return `200 OK` with `{ "received": true }` — providers require a fast, simple ack.

---

### 2.4 `dispatch-notification`

**Purpose:** Deliver unsent notification rows to external channels (email via SendGrid, SMS via Twilio) beyond the in-app `notifications` table.

The function reads recipient contact info from `profiles` (phone) and `auth.users` (email via GoTrue admin API). It sends to each available channel and records the dispatch result in the notification's `metadata` JSONB field for idempotency.

**Trigger:** Invoked by the `notify_on_status_change` trigger via DB webhook on `notifications` INSERT, or scheduled (Supabase Cron / pg_net) for batch dispatch.

**Auth:** None (public endpoint) — `verify_jwt = false`. The function is server-to-server; it receives only a `notification_id` and fetches everything else from the database using `service_role`.

**Request:**
```json
POST /functions/v1/dispatch-notification
{ "notification_id": "uuid" }
```

**Logic:**
1. Fetch the notification row (id, user_id, type, title, body, metadata).
2. If `metadata.dispatched === true` → return early (idempotency).
3. Fetch recipient profile (`profiles.full_name`, `profiles.phone`) and email (`auth.users` via GoTrue admin API).
4. **Email via SendGrid:** If `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` are set, send an email with the notification title as subject and body as content.
5. **SMS via Twilio:** If `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` are set, and the recipient has a phone number, send an SMS.
6. Update `notifications.metadata` with `dispatched`, `dispatched_at`, `channels_dispatched`, and any errors.

**Response:**
```json
{
  "data": {
    "notification_id": "uuid",
    "dispatched": true,
    "channels": ["email", "sms"],
    "reason": "success"
  },
  "error": null
}
```

When no contact info or provider is configured:
```json
{
  "data": {
    "notification_id": "uuid",
    "dispatched": false,
    "channels": [],
    "reason": "no_contact_info"
  },
  "error": null
}
```

### 2.5 `geocode-address`

**Purpose:** Convert a human-readable address to geographic coordinates (`lat`, `lng`) using the Google Maps Geocoding API. Server-side wrapper so the Google Maps API key never reaches the client bundle.

**Auth:** Requires authenticated customer JWT; addresses are user-scoped.

**Request:**
```json
POST /functions/v1/geocode-address
{
  "address": "123 Main St",
  "city": "Quezon City"
}
```

**Logic:**
1. Validate the caller's JWT.
2. Read `GOOGLE_MAPS_API_KEY` from environment (never from the client).
3. Call Google Maps Geocoding API with the address string.
4. Return the first result's `lat`/`lng` and the formatted address string.

**Response (success):**
```json
{
  "data": {
    "lat": 14.6769,
    "lng": 121.0437,
    "formatted_address": "123 Main St, Quezon City, Metro Manila, Philippines"
  },
  "error": null
}
```

**Response (no API key configured):**
```json
{
  "data": null,
  "error": { "code": "PROVIDER_ERROR", "message": "Geocoding provider is not configured" }
}
```

---

### 2.6 `create-ticket`

**Purpose:** Submit a structured support ticket. Replaces the old "free-text in chat" flow with an explicit form that captures category, priority, description, and an optional subject. Returns a human-readable tracking number (`TKT-YYYYMMDD-XXXX`).

**Auth:** Requires authenticated customer JWT. `customer_id` is taken from `auth.uid()` — never trusted from the request body.

**Request:**
```json
POST /functions/v1/create-ticket
{
  "category": "billing",
  "priority": "high",
  "description": "I was charged twice for the same rental",
  "subject": "Double charge on recent booking"
}
```

**Logic:**
1. Validate the caller's JWT; extract `customer_id` from `auth.uid()`.
2. Validate `category` against `ticket_category` enum (`general`, `rental`, `billing`, `bug`, `mechanic`, `other`).
3. Validate `priority` against `ticket_priority` enum (`low`, `medium`, `high`, `critical`).
4. Validate description length (5–4000 characters).
5. Generate a unique `tracking_number` in the format `TKT-YYYYMMDD-XXXX` (FNV-1a hash-based 4-char suffix). If a collision occurs (extremely rare), retry once with a perturbed timestamp.
6. Prefix the subject with the category (e.g., `[BILLING] Double charge...`).
7. Insert the `support_tickets` row and return the result.

**Response (success):**
```json
{
  "data": {
    "id": "uuid",
    "tracking_number": "TKT-20260913-ABCD",
    "category": "billing",
    "priority": "high",
    "status": "open",
    "subject": "[BILLING] Double charge on recent booking",
    "created_at": "2026-09-13T10:00:00Z"
  },
  "error": null
}
```

**Response (validation error):**
```json
{
  "data": null,
  "error": { "code": "VALIDATION_ERROR", "message": "Invalid category. Must be one of: general, rental, billing, bug, mechanic, other" }
}
```

---

### 2.7 `flag-user`

**Purpose:** Admin-only action to permanently ban a user and remove their profile row. Used by admins to handle abusive or fraudulent users.

**Effect:**
1. Sets `auth.users.banned_until` to `9999-12-31T23:59:59.999Z` so the user can never sign in again. The only way to lift this is to clear `banned_until` in the Supabase dashboard.
2. Deletes the `profiles` row. `ON DELETE CASCADE` cleans up dependent rows (addresses, vehicle_bookings, service_bookings, support_tickets, etc.) so the user has no residual data.
3. The `auth.users` row itself is kept (Supabase does not allow deleting `auth.users` from a regular service-role client). This means the same email cannot re-register.

**Auth:** Requires authenticated admin JWT. An admin cannot ban themselves.

**Request:**
```json
POST /functions/v1/flag-user
{
  "user_id": "uuid"
}
```

**Logic:**
1. Verify the caller's JWT and confirm the caller's `profiles.role = 'admin'`.
2. Validate `user_id` is a valid UUID v4.
3. Reject if the target is the admin themselves (`INVALID_STATE`, 409).
4. Call Supabase Admin Auth API to set `ban_duration = "876000h"` (100 years).
5. Delete the `profiles` row.
6. Return the ban result. If profile deletion fails after the ban succeeds, return a `207 Multi-Status` with `PARTIAL_SUCCESS`.

**Response (success):**
```json
{
  "data": {
    "user_id": "uuid",
    "banned_until": "9999-12-31T23:59:59.999Z",
    "deleted_profile": true
  },
  "error": null
}
```

**Response (admin only):**
```json
{
  "data": null,
  "error": { "code": "FORBIDDEN", "message": "Admin privileges required" }
}
```
HTTP status: `403`.

---

### 2.8 `chatbot` *(Phase 5+ — out of scope for v1 per `SPEC.md` §6)*

> **Note:** This function is implemented in the codebase but explicitly marked as out of scope in `SPEC.md` §6 ("AI-powered vehicle diagnostics / chatbot triage... not v1"). It is documented here for reference and should not be deployed or maintained until a future phase authorizes it.

**Purpose:** AI customer support assistant for LS Customs' car rental & mobile mechanic services, powered by OpenRouter. Handles FAQ, rental inquiries, booking lookups, and mechanic service scheduling.

Includes topic guardrails that intercept out-of-scope requests (e.g., general conversation, non-LS-Customs questions) and redirect them to LS Customs services.

Provider is configured via `OPENROUTER_API_KEY` (required), `OPENROUTER_MODEL` (optional, defaults to `google/gemma-4-31b-it:free`), and `OPENROUTER_BASE_URL` (optional, defaults to `https://openrouter.ai/api/v1`). The base URL can be overridden to point to any OpenAI-compatible endpoint (e.g., Ollama, local LLM, Together.ai).

**Auth:** None (public) — `verify_jwt = false`. Customer support must be accessible to anonymous visitors.

**Request:**
```json
POST /functions/v1/chatbot
{
  "message": "What are your business hours?",
  "conversation_id": "optional-uuid",
  "user_id": "optional-uuid"
}
```

**Logic:**
1. Validate `message` is non-empty.
2. If `user_id` is provided, look up the user's 3 most recent `vehicle_bookings` for context.
3. If `OPENROUTER_API_KEY` is not configured, return `PROVIDER_ERROR` (500) with setup instructions.
4. Call the provider's `/chat/completions` endpoint with the system prompt + user message (optionally enriched with booking context).
5. Return the AI reply in the standard `{ data, error }` envelope.

**Response (success):**
```json
{
  "data": {
    "conversation_id": "uuid",
    "reply": "We're open Monday–Friday 8am–6pm...",
    "context_used": false,
    "model": "gpt-3.5-turbo"
  },
  "error": null
}
```

**Response (no API key configured):**
```json
{
  "data": null,
  "error": {
    "code": "PROVIDER_ERROR",
    "message": "OPENROUTER_API_KEY not configured. Set it via `supabase secrets set OPENROUTER_API_KEY=...`."
  }
}
```
HTTP status: `500`.

**Response (out-of-scope guardrail — e.g., "tell me a joke about quantum physics"):**
```json
{
  "data": {
    "conversation_id": "uuid",
    "reply": "I'm here to help with LS Customs car rental and mechanic services only. Would you like assistance with a booking, pricing, or service schedule?",
    "context_used": false,
    "model": "guardrail"
  },
  "error": null
}
```
No call to the AI provider is made — the guardrail intercepts pre-emptively.

**Response (validation error — empty message):**
```json
{
  "data": null,
  "error": { "code": "VALIDATION_ERROR", "message": "Message is required" }
}
```
HTTP status: `400`.

---

### 2.9 Shared Utilities (`_shared/`)

All Edge Functions share three utility modules under `apps/backend/supabase/functions/_shared/`:

### `supabaseClient.ts`
Creates and exports a Supabase client instance using the `service_role` key from `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`. Every function imports this to interact with Postgres. Also exports `extractJwt(req)` for parsing the `Authorization: Bearer <jwt>` header and `createServiceClient` for the admin-facing client.

### `cors.ts`
Exports `corsHeaders` (CORS configuration) and `jsonResponse(data, error, status)` — the standard JSON envelope responder every function uses. Also exports the `EdgeFunctionError` type for consistent error shapes.

### `paymentProvider.ts`
Abstracts the active payment provider (PayMongo default for local dev, Stripe fallback). Exports functions to:
- Create a payment intent (`createPaymentIntent`)
- Verify a webhook signature (`verifyWebhookSignature`)
- Normalize provider-specific event payloads into a common shape (`normalizePaymentEvent`)

Reads `PAYMENT_PROVIDER`, `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` from `Deno.env`.

**Purpose:** AI customer support assistant for LS Customs' car rental & mobile mechanic services, powered by OpenRouter. Handles FAQ, rental inquiries, booking lookups, and mechanic service scheduling.

Includes topic guardrails that intercept out-of-scope requests (e.g., general conversation, non-LS-Customs questions) and redirect them to LS Customs services.

Provider is configured via `OPENROUTER_API_KEY` (required), `OPENROUTER_MODEL` (optional, defaults to `google/gemma-4-31b-it:free`), and `OPENROUTER_BASE_URL` (optional, defaults to `https://openrouter.ai/api/v1`). The base URL can be overridden to point to any OpenAI-compatible endpoint (e.g., Ollama, local LLM, Together.ai).

**Auth:** None (public) — `verify_jwt = false`. Customer support must be accessible to anonymous visitors.

**Request:**
```json
POST /functions/v1/chatbot
{
  "message": "What are your business hours?",
  "conversation_id": "optional-uuid",
  "user_id": "optional-uuid"
}
```

**Logic:**
1. Validate `message` is non-empty.
2. If `user_id` is provided, look up the user's 3 most recent `vehicle_bookings` for context.
3. If `OPENROUTER_API_KEY` is not configured, return `PROVIDER_ERROR` (500) with setup instructions.
4. Call the provider's `/chat/completions` endpoint with the system prompt + user message (optionally enriched with booking context).
5. Return the AI reply in the standard `{ data, error }` envelope.

**Response (success):**
```json
{
  "data": {
    "conversation_id": "uuid",
    "reply": "We're open Monday–Friday 8am–6pm...",
    "context_used": false,
    "model": "gpt-3.5-turbo"
  },
  "error": null
}
```

**Response (no API key configured):**
```json
{
  "data": null,
  "error": {
    "code": "PROVIDER_ERROR",
    "message": "OPENROUTER_API_KEY not configured. Set it via `supabase secrets set OPENROUTER_API_KEY=...`."
  }
}
```
HTTP status: `500`.

**Response (out-of-scope guardrail — e.g., "tell me a joke about quantum physics"):**
```json
{
  "data": {
    "conversation_id": "uuid",
    "reply": "I'm here to help with LS Customs car rental and mechanic services only. Would you like assistance with a booking, pricing, or service schedule?",
    "context_used": false,
    "model": "guardrail"
  },
  "error": null
}
```
No call to the AI provider is made — the guardrail intercepts pre-emptively.

**Response (validation error — empty message):**
```json
{
  "data": null,
  "error": { "code": "VALIDATION_ERROR", "message": "Message is required" }
}
```
HTTP status: `400`.

---

## 3. Database Webhooks

Configured in Supabase Dashboard → Database → Webhooks (or via `pg_net`/`supabase_functions.http_request` trigger):

| Webhook | Table/Event | Calls |
|---|---|---|
| `on-service-booking-created` | `service_bookings` INSERT | `assign-mechanic` |
| `on-payment-status-changed` | `payments` UPDATE OF `status` | (internal — updates parent booking, handled in-function, no external call needed) |
| `on-notification-created` | `notifications` INSERT | `dispatch-notification` |

These decouple "a row changed" from "something needs to happen as a result," keeping Edge Functions independently testable and retriable.

---

## 4. Error Conventions

All Edge Functions return errors in the same shape:

```json
{ "data": null, "error": { "code": "STRING_CODE", "message": "Human-readable message" } }
```

| Code | HTTP Status | Meaning |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Missing/invalid JWT |
| `FORBIDDEN` | 403 | Authenticated but not allowed to act on this resource |
| `NOT_FOUND` | 404 | Booking/resource doesn't exist |
| `INVALID_STATE` | 409 | Action not valid for current booking status |
| `NO_MECHANIC_AVAILABLE` | 409 | No mechanic could be matched |
| `METHOD_NOT_ALLOWED` | 405 | HTTP method not supported by this endpoint |
| `VALIDATION_ERROR` | 400 | Malformed request payload |
| `PROVIDER_ERROR` | 500 / 502 | Downstream provider failed (500 = not configured, 502 = provider rejected request) |

---

## 5. Rate Limiting & Idempotency

- `create-payment-intent` accepts an optional `Idempotency-Key` header, forwarded to the payment provider, to prevent duplicate intents on client retry.
- `assign-mechanic` is safe to call repeatedly — it's a no-op (returns current state) if `status` is already past `pending`.
- Supabase's built-in rate limiting on Auth endpoints is left at defaults for v1; Edge Function-level rate limiting is deferred (documented as a Phase 5+ concern, out of scope per `SPEC.md`).
