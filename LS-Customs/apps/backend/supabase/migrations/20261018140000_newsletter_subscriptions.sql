-- A write-only public endpoint: subscribers cannot enumerate the mailing list.
create table public.newsletter_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  consented_at timestamptz not null default now(),
  source text not null default 'website_footer',
  constraint newsletter_email_valid check (
    length(email) <= 254 and email = lower(btrim(email))
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  )
);

alter table public.newsletter_subscriptions enable row level security;
revoke all on public.newsletter_subscriptions from anon, authenticated;
grant all on public.newsletter_subscriptions to service_role;

create function public.subscribe_newsletter(subscriber_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(subscriber_email));
begin
  if normalized_email is null or length(normalized_email) > 254
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;

  insert into public.newsletter_subscriptions (email)
  values (normalized_email)
  on conflict (email) do nothing;
end;
$$;

revoke all on function public.subscribe_newsletter(text) from public;
grant execute on function public.subscribe_newsletter(text) to anon, authenticated;
