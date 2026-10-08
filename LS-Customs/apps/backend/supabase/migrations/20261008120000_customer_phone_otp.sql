-- Private, short-lived challenges for SMS login to an existing email account.
-- Profile contact numbers must be proved by OTP before a session is issued.
create table public.customer_phone_otp_challenges (
  id uuid primary key,
  contact_hash text not null check (contact_hash ~ '^[a-f0-9]{64}$'),
  phone text not null,
  user_id uuid references auth.users(id) on delete cascade,
  code_digest text not null check (code_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  attempts integer not null default 0,
  consumed_at timestamptz
);
alter table public.customer_phone_otp_challenges enable row level security;
revoke all on public.customer_phone_otp_challenges from public, anon, authenticated;
grant all on public.customer_phone_otp_challenges to service_role;
create index customer_phone_otp_contact_time on public.customer_phone_otp_challenges(contact_hash, created_at);

create function public.normalize_login_phone(value text)
returns text language sql immutable set search_path = '' as $$
  select case
    when digits ~ '^09[0-9]{9}$' then '+63' || substr(digits, 2)
    when digits ~ '^9[0-9]{9}$' then '+63' || digits
    when digits ~ '^[1-9][0-9]{7,14}$' then '+' || digits
    else null
  end from (select regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g') as digits) phone;
$$;
revoke all on function public.normalize_login_phone(text) from public, anon, authenticated;
grant execute on function public.normalize_login_phone(text) to service_role;

create function public.reserve_customer_phone_otp(
  p_phone text, p_id uuid, p_contact_hash text, p_code_digest text, p_create_user boolean
) returns table (challenge_id uuid, delivery text)
language plpgsql security definer set search_path = '' as $$
declare
  profile_owners uuid[];
  phone_owner uuid;
  profile_owner uuid;
  target_user uuid;
  route text := 'profile';
begin
  if public.normalize_login_phone(p_phone) is distinct from p_phone then
    raise exception 'Invalid phone number';
  end if;
  -- Serialize quota checks and inserts for a contact, including concurrent sends.
  perform pg_advisory_xact_lock(hashtextextended(p_contact_hash, 0));
  if exists(select 1 from public.customer_phone_otp_challenges
    where contact_hash = p_contact_hash and created_at > now() - interval '60 seconds')
    or (select count(*) from public.customer_phone_otp_challenges
      where contact_hash = p_contact_hash and created_at > now() - interval '1 hour') >= 3 then
    return query select p_id, 'rate_limited'::text;
    return;
  end if;
  delete from public.customer_phone_otp_challenges where created_at < now() - interval '1 day';

  select array_agg(p.id) into profile_owners from public.profiles p
    where public.normalize_login_phone(p.phone) = p_phone;
  select u.id into phone_owner from auth.users u
    where public.normalize_login_phone(u.phone) = p_phone;
  profile_owner := profile_owners[1];

  -- Do not guess an owner or merge accounts when contacts are duplicated.
  if coalesce(cardinality(profile_owners), 0) > 1
    or (phone_owner is not null and profile_owner is not null and phone_owner <> profile_owner) then
    route := 'conflict';
  elsif phone_owner is not null then
    route := 'supabase';
  elsif profile_owner is not null then
    select u.id into target_user from auth.users u join public.profiles p on p.id = u.id
      where u.id = profile_owner and p.role = 'customer'
      and nullif(u.email, '') is not null and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until < now())
      and nullif(u.phone, '') is null;
    -- Missing/ineligible accounts produce an indistinguishable unused challenge.
  elsif p_create_user then
    route := 'supabase';
  end if;

  insert into public.customer_phone_otp_challenges(id, contact_hash, phone, user_id, code_digest, consumed_at)
    values(p_id, p_contact_hash, p_phone, target_user, p_code_digest,
      case when route = 'supabase' then now() else null end);
  return query select p_id, route;
end;
$$;
revoke all on function public.reserve_customer_phone_otp(text, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.reserve_customer_phone_otp(text, uuid, text, text, boolean) to service_role;

create function public.consume_customer_phone_otp(p_id uuid, p_code_digest text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  challenge public.customer_phone_otp_challenges%rowtype;
begin
  select * into challenge from public.customer_phone_otp_challenges where id = p_id for update;
  if not found or challenge.consumed_at is not null or challenge.expires_at <= now()
    or challenge.attempts >= 5 then return null; end if;
  update public.customer_phone_otp_challenges set attempts = attempts + 1 where id = p_id;
  if challenge.user_id is null or challenge.code_digest <> p_code_digest then return null; end if;
  -- A removed, reassigned, or ambiguous phone must invalidate an outstanding code.
  if not exists(select 1 from public.profiles p where p.id = challenge.user_id and p.role = 'customer'
      and public.normalize_login_phone(p.phone) = challenge.phone)
    or (select count(*) from public.profiles p where public.normalize_login_phone(p.phone) = challenge.phone) <> 1
    or exists(select 1 from auth.users u where public.normalize_login_phone(u.phone) = challenge.phone
      and u.id <> challenge.user_id) then return null; end if;
  update public.customer_phone_otp_challenges set consumed_at = now() where id = p_id;
  return challenge.user_id;
end;
$$;
revoke all on function public.consume_customer_phone_otp(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_customer_phone_otp(uuid, text) to service_role;

-- Repair historical missing profiles using the original auth ID, preserving existing rows.
insert into public.profiles(id, full_name, role, phone)
select u.id, coalesce(nullif(u.raw_user_meta_data->>'full_name', ''),
  nullif(u.raw_user_meta_data->>'name', ''), nullif(u.email, ''), nullif(u.phone, ''), 'LS Customs user'),
  'customer'::public.user_role, nullif(u.phone, '')
from auth.users u where not exists(select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
