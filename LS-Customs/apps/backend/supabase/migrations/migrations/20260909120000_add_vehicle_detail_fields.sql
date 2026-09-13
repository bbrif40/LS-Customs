-- Add optional customer-facing detail fields for rental vehicle pages.
alter table public.vehicles
  add column if not exists gallery_urls text[] not null default '{}',
  add column if not exists location text,
  add column if not exists host_name text,
  add column if not exists host_rating numeric(3,2),
  add column if not exists features text[] not null default '{}',
  add column if not exists rental_rules text[] not null default '{}',
  add column if not exists mileage_policy text,
  add column if not exists max_trip text,
  add column if not exists delivery_methods text[] not null default '{}';
