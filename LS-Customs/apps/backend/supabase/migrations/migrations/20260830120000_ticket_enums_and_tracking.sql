-- Ticket enums alignment + tracking number
-- Renames ticket_category values to match the public wording
-- (general / billing / bug / mechanic / other) and adds 'critical'
-- to ticket_priority. Adds a short human-readable tracking number
-- column to support_tickets.
--
-- Existing rows in the dev DB are seed data and can be transformed
-- in place. The transform is safe because the column values come
-- from a closed enum (no user-supplied strings).

-- ── 1. Replace the category enum with the new value set ────────
-- Postgres won't let us ALTER TYPE … RENAME VALUE on a value still
-- referenced by other in-flight rows, so we add a new enum, switch
-- the column to text, switch the column to the new enum, then drop
-- the old enum. Cheaper and works for both directions.

create type ticket_category_v2 as enum (
  'general',
  'rental',
  'billing',
  'bug',
  'mechanic',
  'other'
);

-- Drop the default on the existing category column. Postgres won't
-- auto-cast a default string to a new enum, so we strip it first,
-- re-apply the column type change, then re-add the default.
alter table public.support_tickets
  alter column category drop default;

-- Map old → new (booking → rental, technical → bug; rest unchanged).
alter table public.support_tickets
  alter column category type text using category::text;

alter table public.support_tickets
  alter column category type ticket_category_v2 using (
    case category
      when 'booking' then 'rental'::ticket_category_v2
      when 'technical' then 'bug'::ticket_category_v2
      else category::ticket_category_v2
    end
  );

-- Restore the default against the new enum.
alter table public.support_tickets
  alter column category set default 'general'::ticket_category_v2;

drop type ticket_category;
alter type ticket_category_v2 rename to ticket_category;

-- ── 2. Add 'critical' to the priority enum ─────────────────────
alter type ticket_priority add value if not exists 'critical';

-- ── 3. Tracking number column ──────────────────────────────────
-- Short human-readable id like TKT-20260830-A3F9. Generated in the
-- edge function from date + a 4-char hash of customer+timestamp+desc.
-- Unique across the table; safe to show to the user.

alter table public.support_tickets
  add column if not exists tracking_number text;

-- Backfill any pre-existing rows so the unique index can be built.
update public.support_tickets
  set tracking_number = 'TKT-' || to_char(created_at, 'YYYYMMDD') || '-' ||
    upper(substr(md5(coalesce(customer_id::text, '') || extract(epoch from created_at)::text), 1, 4))
  where tracking_number is null;

alter table public.support_tickets
  alter column tracking_number set not null;

create unique index if not exists uq_support_tickets_tracking
  on public.support_tickets(tracking_number);

create index if not exists idx_support_tickets_tracking
  on public.support_tickets(tracking_number);

-- ── 4. Re-grant service_role on support_tickets ───────────────
-- The original grant (20260819120535_grants.sql) was made before
-- support_tickets existed. service_role is mapped to the JWT role
-- that Edge Functions use, so the create-ticket function would
-- 403 without this. Belt and suspenders — the original ticket
-- migration should have included it.
grant all on public.support_tickets to service_role;
