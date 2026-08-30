-- =============================================================================
-- LS Customs — Phase 1 Migration 2: Schema (Tables + RLS Enable)
-- =============================================================================
-- Creates all core tables from DATABASE.md §2.
-- Per RULES.md §2.3: RLS is enabled on every table in the same migration
-- that creates it — no table ships without RLS.
-- =============================================================================

-- Enable btree_gist for the no-overlap exclude constraint on vehicle_bookings.
create extension if not exists btree_gist;

-- -----------------------------------------------------------------------------
-- 2.1 profiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id           uuid         primary key references auth.users(id) on delete cascade,
  full_name    text         not null,
  phone        text,
  avatar_url   text,
  role         user_role    not null default 'customer',
  created_at   timestamptz  default now(),
  updated_at   timestamptz  default now()
);

alter table public.profiles enable row level security;

-- -----------------------------------------------------------------------------
-- 2.2 addresses
-- -----------------------------------------------------------------------------
create table public.addresses (
  id           uuid         primary key default gen_random_uuid(),
  customer_id  uuid         not null references public.profiles(id) on delete cascade,
  label        text,
  line1        text         not null,
  city         text         not null,
  lat          double precision not null,
  lng          double precision not null,
  is_default   boolean      default false,
  created_at   timestamptz  default now()
);

alter table public.addresses enable row level security;

-- -----------------------------------------------------------------------------
-- 2.3 vehicles
-- -----------------------------------------------------------------------------
create table public.vehicles (
  id             uuid           primary key default gen_random_uuid(),
  category       rental_category not null,
  sub_category   text           not null,
  name            text           not null,
  description     text,
  seats           int,
  transmission    text,
  fuel_type       text,
  price_per_day    numeric(10,2) not null check (price_per_day > 0),
  image_url       text,
  is_active       boolean        default true,
  rating_avg      numeric(3,2)   default 0,
  rating_count    int            default 0,
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now()
);

alter table public.vehicles enable row level security;

-- -----------------------------------------------------------------------------
-- 2.4 vehicle_bookings
-- -----------------------------------------------------------------------------
create table public.vehicle_bookings (
  id              uuid           primary key default gen_random_uuid(),
  vehicle_id      uuid           not null references public.vehicles(id),
  customer_id     uuid           not null references public.profiles(id),
  start_date      date           not null,
  end_date        date           not null check (end_date > start_date),
  pickup_location text,
  status          booking_status not null default 'pending',
  total_price     numeric(10,2)  not null,
  created_at      timestamptz    default now(),
  updated_at      timestamptz    default now()
);

-- Prevent double-booking: no overlapping confirmed bookings for the same vehicle.
-- Excludes rows where status is in ('pending', 'confirmed', 'in_progress').
alter table public.vehicle_bookings
  add constraint no_overlapping_bookings
  exclude using gist (
    vehicle_id with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (status in ('pending', 'confirmed', 'in_progress'));

alter table public.vehicle_bookings enable row level security;

-- -----------------------------------------------------------------------------
-- 2.5 mechanic_profiles
-- -----------------------------------------------------------------------------
create table public.mechanic_profiles (
  id              uuid           primary key references public.profiles(id) on delete cascade,
  specialties     text[],
  is_available    boolean        default false,
  current_lat     double precision,
  current_lng     double precision,
  years_experience int,
  rating_avg      numeric(3,2)   default 0,
  rating_count    int            default 0,
  created_at      timestamptz   default now(),
  updated_at      timestamptz   default now()
);

alter table public.mechanic_profiles enable row level security;

-- Public access path for customers: a SECURITY DEFINER function
-- bypasses RLS (owned by postgres, which has BYPASSRLS) and returns
-- only non-sensitive columns. Created in the policies migration.
-- See 20260819120524_rls_policies.sql for get_public_mechanics().

-- -----------------------------------------------------------------------------
-- 2.6 mechanic_services
-- -----------------------------------------------------------------------------
create table public.mechanic_services (
  id            uuid                   primary key default gen_random_uuid(),
  main_category service_main_category not null,
  name           text                   not null,
  description    text,
  base_price     numeric(10,2)         not null check (base_price > 0),
  estimated_duration_minutes int       not null default 30,
  is_active      boolean               default true,
  created_at     timestamptz           default now(),
  updated_at     timestamptz           default now()
);

alter table public.mechanic_services enable row level security;

-- -----------------------------------------------------------------------------
-- 2.7 service_bookings
-- -----------------------------------------------------------------------------
create table public.service_bookings (
  id           uuid           primary key default gen_random_uuid(),
  customer_id  uuid           not null references public.profiles(id),
  mechanic_id  uuid           references public.mechanic_profiles(id),
  address_id   uuid           references public.addresses(id),
  pin_lat      double precision,
  pin_lng      double precision,
  scheduled_at timestamptz   not null,
  status       booking_status not null default 'pending',
  total_price  numeric(10,2)  default 0,
  notes        text,
  created_at   timestamptz   default now(),
  updated_at   timestamptz   default now()
);

-- Constraint: exactly one of address_id or (pin_lat, pin_lng) must be set.
-- Per DATABASE.md §2.7, enforced at the data level via CHECK.
alter table public.service_bookings
  add constraint one_location_only
  check (
    (address_id is not null)::int
    + ((pin_lat is not null) and (pin_lng is not null))::int = 1
  );

alter table public.service_bookings enable row level security;

-- -----------------------------------------------------------------------------
-- 2.8 service_booking_items
-- -----------------------------------------------------------------------------
create table public.service_booking_items (
  id                uuid           primary key default gen_random_uuid(),
  service_booking_id uuid          not null references public.service_bookings(id) on delete cascade,
  mechanic_service_id uuid         not null references public.mechanic_services(id),
  quantity          int           not null default 1,
  price_at_booking   numeric(10,2) not null
);

alter table public.service_booking_items enable row level security;

-- -----------------------------------------------------------------------------
-- 2.9 reviews
-- -----------------------------------------------------------------------------
create table public.reviews (
  id               uuid          primary key default gen_random_uuid(),
  booking_type     booking_type  not null,
  booking_id       uuid          not null,
  customer_id      uuid          not null references public.profiles(id),
  target_vehicle_id  uuid        references public.vehicles(id),
  target_mechanic_id uuid        references public.mechanic_profiles(id),
  rating           smallint      not null check (rating between 1 and 5),
  comment          text,
  created_at       timestamptz   default now()
);

-- One review per booking (type + id + customer).
create unique index reviews_per_booking_idx
  on public.reviews (booking_type, booking_id, customer_id);

alter table public.reviews enable row level security;

-- -----------------------------------------------------------------------------
-- 2.10 notifications
-- -----------------------------------------------------------------------------
create table public.notifications (
  id          uuid          primary key default gen_random_uuid(),
  user_id     uuid          not null references public.profiles(id) on delete cascade,
  type        text,
  title       text          not null,
  body        text,
  metadata    jsonb         default '{}'::jsonb,
  is_read     boolean       default false,
  created_at  timestamptz   default now()
);

alter table public.notifications enable row level security;

-- -----------------------------------------------------------------------------
-- 2.11 payments
-- -----------------------------------------------------------------------------
create table public.payments (
  id                uuid           primary key default gen_random_uuid(),
  booking_type      booking_type   not null,
  booking_id        uuid           not null,
  customer_id       uuid           not null references public.profiles(id),
  amount            numeric(10,2)  not null,
  currency          text           default 'PHP',
  provider          text,
  provider_reference text,
  status            payment_status not null default 'pending',
  created_at        timestamptz   default now(),
  updated_at        timestamptz   default now()
);

alter table public.payments enable row level security;
