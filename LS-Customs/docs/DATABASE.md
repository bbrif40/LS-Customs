so confusi# DATABASE.md — Supabase PostgreSQL Schema

> All tables live in the `public` schema unless noted. All primary keys are `uuid default gen_random_uuid()`. All tables have `created_at timestamptz default now()`; mutable tables also have `updated_at timestamptz default now()` maintained by trigger.

---

## 1. Enums

```sql
create type user_role as enum ('customer', 'mechanic', 'admin');

create type rental_category as enum ('short_term', 'extended', 'premium');

create type booking_status as enum (
  'pending',      -- created, awaiting confirmation/assignment
  'confirmed',    -- rental: payment/booking confirmed
  'assigned',     -- service: mechanic assigned
  'en_route',     -- service: mechanic traveling
  'in_progress',  -- service: work underway / rental: vehicle picked up
  'completed',
  'cancelled'
);

create type service_main_category as enum (
  'routine_fluid_service',
  'tire_wheel_care',
  'electrical_battery_care',
  'diagnostic_repair',
  'lighting_visibility',
  'quick_fixes'
);

create type payment_status as enum ('pending', 'succeeded', 'failed', 'refunded');

create type booking_type as enum ('vehicle', 'service');
```

---

## 2. Core Tables

### 2.1 `profiles`
Extends `auth.users` with app-specific fields. One row per user, created automatically (see §5 Triggers).

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, references `auth.users(id)` on delete cascade |
| `full_name` | text | not null |
| `phone` | text | |
| `avatar_url` | text | |
| `role` | user_role | not null, default `'customer'` |
| `created_at` | timestamptz | default now() |
| `updated_at` | timestamptz | default now() |

### 2.2 `addresses`
Customer-saved locations, used for mechanic dispatch.

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `customer_id` | uuid | not null, references `profiles(id)` on delete cascade |
| `label` | text | e.g. "Home", "Office" |
| `line1` | text | not null |
| `city` | text | not null |
| `lat` | double precision | not null |
| `lng` | double precision | not null |
| `is_default` | boolean | default false |
| `created_at` | timestamptz | default now() |

### 2.3 `vehicles`
Rental catalog. Matches business proposal categories (3 main × 3 sub-category names folded into `category` + free-text `sub_category`).

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `category` | rental_category | not null |
| `sub_category` | text | not null — e.g. "Short-term Rental" |
| `name` | text | not null — e.g. "Economy Compact" |
| `description` | text | |
| `seats` | int | |
| `transmission` | text | e.g. "Automatic" |
| `fuel_type` | text | |
| `price_per_day` | numeric(10,2) | not null, check (price_per_day > 0) |
| `image_url` | text | |
| `is_active` | boolean | default true |
| `rating_avg` | numeric(3,2) | default 0 |
| `rating_count` | int | default 0 |
| `created_at` | timestamptz | default now() |
| `updated_at` | timestamptz | default now() |

### 2.4 `vehicle_bookings`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `vehicle_id` | uuid | not null, references `vehicles(id)` |
| `customer_id` | uuid | not null, references `profiles(id)` |
| `start_date` | date | not null |
| `end_date` | date | not null, check (end_date > start_date) |
| `pickup_location` | text | |
| `status` | booking_status | not null, default `'pending'` |
| `total_price` | numeric(10,2) | not null |
| `created_at` | timestamptz | default now() |
| `updated_at` | timestamptz | default now() |

**No double-booking constraint:**
```sql
alter table vehicle_bookings
  add constraint no_overlapping_bookings
  exclude using gist (
    vehicle_id with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (status in ('pending', 'confirmed', 'in_progress'));
-- requires: create extension if not exists btree_gist;
```

### 2.5 `mechanic_profiles`
One-to-one extension of `profiles` for users with `role = 'mechanic'`.

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, references `profiles(id)` on delete cascade |
| `specialties` | text[] | |
| `is_available` | boolean | default false |
| `current_lat` | double precision | |
| `current_lng` | double precision | |
| `years_experience` | int | |
| `rating_avg` | numeric(3,2) | default 0 |
| `rating_count` | int | default 0 |
| `updated_at` | timestamptz | default now() |

### 2.6 `mechanic_services`
Mobile mechanic service catalog (6 sub-categories from the proposal).

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `main_category` | service_main_category | not null |
| `name` | text | not null — e.g. "Full Synthetic Oil Change" |
| `description` | text | |
| `base_price` | numeric(10,2) | not null, check (base_price > 0) |
| `estimated_duration_minutes` | int | not null default 30 |
| `is_active` | boolean | default true |
| `created_at` | timestamptz | default now() |
| `updated_at` | timestamptz | default now() |

### 2.7 `service_bookings`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `customer_id` | uuid | not null, references `profiles(id)` |
| `mechanic_id` | uuid | nullable, references `mechanic_profiles(id)` |
| `address_id` | uuid | nullable, references `addresses(id)` |
| `pin_lat` | double precision | nullable — used if not a saved address |
| `pin_lng` | double precision | nullable |
| `scheduled_at` | timestamptz | not null |
| `status` | booking_status | not null, default `'pending'` |
| `total_price` | numeric(10,2) | not null default 0 |
| `notes` | text | customer-provided context, e.g. "car won't start" |
| `created_at` | timestamptz | default now() |
| `updated_at` | timestamptz | default now() |

Check: exactly one of `address_id` / (`pin_lat`,`pin_lng`) must be set — enforced via `check` constraint or application-level validation in the Edge Function.

### 2.8 `service_booking_items`
Line items — a booking can include multiple services (e.g., oil change + battery test).

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `service_booking_id` | uuid | not null, references `service_bookings(id)` on delete cascade |
| `mechanic_service_id` | uuid | not null, references `mechanic_services(id)` |
| `quantity` | int | not null default 1 |
| `price_at_booking` | numeric(10,2) | not null — snapshot, catalog price may change later |

### 2.9 `reviews`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `booking_type` | booking_type | not null |
| `booking_id` | uuid | not null — polymorphic reference, validated in app/trigger layer |
| `customer_id` | uuid | not null, references `profiles(id)` |
| `target_vehicle_id` | uuid | nullable, references `vehicles(id)` |
| `target_mechanic_id` | uuid | nullable, references `mechanic_profiles(id)` |
| `rating` | smallint | not null, check (rating between 1 and 5) |
| `comment` | text | |
| `created_at` | timestamptz | default now() |

Unique constraint: `unique (booking_type, booking_id, customer_id)` — one review per booking.

### 2.10 `notifications`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | not null, references `profiles(id)` on delete cascade |
| `type` | text | e.g. `'booking_status_changed'` |
| `title` | text | not null |
| `body` | text | |
| `metadata` | jsonb | default `'{}'` |
| `is_read` | boolean | default false |
| `created_at` | timestamptz | default now() |

### 2.11 `payments`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `booking_type` | booking_type | not null |
| `booking_id` | uuid | not null |
| `customer_id` | uuid | not null, references `profiles(id)` |
| `amount` | numeric(10,2) | not null |
| `currency` | text | default `'PHP'` |
| `provider` | text | e.g. `'stripe'`, `'paymongo'` |
| `provider_reference` | text | payment intent / charge ID |
| `status` | payment_status | not null, default `'pending'` |
| `created_at` | timestamptz | default now() |
| `updated_at` | timestamptz | default now() |

---

## 3. Entity Relationship Summary

```
auth.users (1) ──▶ (1) profiles ──▶ (0..1) mechanic_profiles
profiles (1) ──▶ (0..n) addresses
profiles (1) ──▶ (0..n) vehicle_bookings ◀── (1) vehicles
profiles (1) ──▶ (0..n) service_bookings ◀── (0..1) mechanic_profiles
service_bookings (1) ──▶ (1..n) service_booking_items ◀── (1) mechanic_services
vehicle_bookings / service_bookings (1) ──▶ (0..1) reviews
vehicle_bookings / service_bookings (1) ──▶ (0..n) payments
profiles (1) ──▶ (0..n) notifications
```

---

## 4. Row Level Security (RLS) Policies

RLS is **enabled on every table**. Policies rely on two helper functions created in Phase 2:

```sql
create or replace function public.current_role()
returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function public.is_admin() returns boolean
language sql stable as $$ select current_role() = 'admin'; $$;

create or replace function public.is_mechanic() returns boolean
language sql stable as $$ select current_role() = 'mechanic'; $$;
```

### 4.1 `profiles`
- **Select:** a user can read their own row; admins can read all.
- **Update:** a user can update their own row (except `role`); admins can update any row including `role`.
- **Insert:** blocked from client — only the `handle_new_user` trigger inserts (runs as `security definer`).

### 4.2 `addresses`
- **Select/Insert/Update/Delete:** only the owning `customer_id`; admins can read all.

### 4.3 `vehicles` / `mechanic_services` (public catalogs)
- **Select:** anyone (including `anon`) can read rows where `is_active = true`.
- **Insert/Update/Delete:** admins only.

### 4.4 `vehicle_bookings`
- **Select:** the owning `customer_id`; admins; no mechanic access (rentals aren't mechanic-facing).
- **Insert:** authenticated customers, inserting only with their own `customer_id`.
- **Update:** customer may update/cancel their own row only while `status = 'pending'`; admins may update any row/any status.
- **Delete:** not permitted from client (cancellation is a status update, not a delete).

### 4.5 `mechanic_profiles`
- **Select:** the mechanic themself; admins; customers may read a **limited public view** (name, rating, specialties) — implemented via a `select` policy restricted to non-sensitive columns using a view (`public_mechanics`) rather than exposing `current_lat/lng` directly.
- **Update:** the mechanic themself (availability, location); admins (any field, e.g. deactivation).

### 4.6 `service_bookings`
- **Select:** the owning `customer_id`; the assigned `mechanic_id`; admins.
- **Insert:** authenticated customers, inserting only with their own `customer_id`, `status` forced to `'pending'`.
- **Update:**
  - Customer: may only update their own row, and only to cancel (`status = 'cancelled'`) while `status = 'pending'`.
  - Mechanic: may only update the row where they are `mechanic_id`, and only to advance status forward (`assigned → en_route → in_progress → completed`), never backward, never to `cancelled` on behalf of the customer.
  - Admin: unrestricted.
- Status-transition legality is enforced by a trigger/check function, not just RLS, since RLS alone can't validate *which* transition is happening.

### 4.7 `service_booking_items`
- **Select:** inherited access — allowed if the caller can select the parent `service_bookings` row (via `exists` subquery policy).
- **Insert:** allowed at booking-creation time by the owning customer (as part of the same transaction as the parent booking).
- **Update/Delete:** admins only (line items are immutable once booked; corrections go through admin).

### 4.8 `reviews`
- **Select:** anyone can read reviews (public trust signal), **except** the free-text `comment` is always joined with rating for public display — no restriction needed since reviews contain no PII by design.
- **Insert:** the owning `customer_id`, only if the referenced booking (`booking_id`) is `completed` and belongs to them, and only once per booking (unique constraint backs this up).
- **Update/Delete:** the owning customer within a short edit window (e.g., 24h) — optional; otherwise admins only.

### 4.9 `notifications`
- **Select/Update (mark as read):** the owning `user_id` only.
- **Insert:** system/trigger only (`security definer`), never directly from client.

### 4.10 `payments`
- **Select:** the owning `customer_id`; admins.
- **Insert/Update:** service role only (Edge Functions use the service-role key server-side) — **no client-side insert/update policy exists at all**. This is intentional: payment state must never be writable by a user session.

---

## 5. Triggers

| Trigger | On | Timing | Purpose |
|---|---|---|---|
| `handle_new_user` | `auth.users` | AFTER INSERT | Creates matching `profiles` row |
| `set_updated_at` | all mutable tables | BEFORE UPDATE | Maintains `updated_at = now()` |
| `recalculate_vehicle_rating` | `reviews` | AFTER INSERT/UPDATE/DELETE (where `target_vehicle_id` is not null) | Recomputes `vehicles.rating_avg` / `rating_count` |
| `recalculate_mechanic_rating` | `reviews` | AFTER INSERT/UPDATE/DELETE (where `target_mechanic_id` is not null) | Recomputes `mechanic_profiles.rating_avg` / `rating_count` |
| `notify_on_status_change` | `vehicle_bookings`, `service_bookings` | AFTER UPDATE OF `status` | Inserts a `notifications` row for the customer (and mechanic, if applicable) |
| `enforce_service_status_transition` | `service_bookings` | BEFORE UPDATE OF `status` | Rejects illegal status jumps (e.g., `pending → completed` directly) based on caller role |

Example trigger function skeleton:

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', 'New User'), 'customer');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

---

## 6. Indexes

```sql
create index idx_vehicle_bookings_customer on vehicle_bookings(customer_id);
create index idx_vehicle_bookings_vehicle_status on vehicle_bookings(vehicle_id, status);
create index idx_service_bookings_customer on service_bookings(customer_id);
create index idx_service_bookings_mechanic on service_bookings(mechanic_id);
create index idx_service_bookings_status on service_bookings(status);
create index idx_notifications_user_unread on notifications(user_id) where is_read = false;
create index idx_mechanic_profiles_available on mechanic_profiles(is_available) where is_available = true;
```
