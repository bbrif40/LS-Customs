-- =============================================================================
-- LS Customs — Seed Additional Admin Accounts
-- =============================================================================
-- Seeds two new dedicated admin accounts with profiles.role = 'admin':
--   1. Sarah Connor:  sarah.admin@lscustoms.local  / AdminSarah2026!
--   2. Marcus Vance:   marcus.admin@lscustoms.local / AdminMarcus2026!
--
-- Idempotent: safe to run multiple times without duplication.
-- =============================================================================

do $$
declare
  uid_sarah constant uuid := 'aaaaaaaa-0000-0000-0000-000000000002';
  email_sarah constant text := 'sarah.admin@lscustoms.local';
  pwd_sarah constant text := 'AdminSarah2026!';

  uid_marcus constant uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  email_marcus constant text := 'marcus.admin@lscustoms.local';
  pwd_marcus constant text := 'AdminMarcus2026!';
begin
  -- ── 1. Admin Sarah Connor ─────────────────────────────────────────────────
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  )
  values (
    uid_sarah,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    email_sarah,
    extensions.crypt(pwd_sarah, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Sarah Connor","name":"Sarah Connor"}'::jsonb,
    now(),
    now(),
    '', '', '', ''
  )
  on conflict (id) do update
    set encrypted_password = extensions.crypt(pwd_sarah, extensions.gen_salt('bf')),
        email = email_sarah,
        raw_user_meta_data = '{"full_name":"Sarah Connor","name":"Sarah Connor"}'::jsonb,
        updated_at = now();

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    uid_sarah,
    uid_sarah,
    email_sarah,
    jsonb_build_object('sub', uid_sarah::text, 'email', email_sarah, 'email_verified', true, 'phone_verified', false),
    'email',
    now(), now(), now()
  )
  on conflict (id) do nothing;

  update public.profiles
     set full_name = 'Sarah Connor',
         phone     = '+63 917 000 0002',
         role      = 'admin'::public.user_role,
         updated_at = now()
   where id = uid_sarah;

  insert into public.profiles (id, full_name, phone, role, created_at, updated_at)
  values (uid_sarah, 'Sarah Connor', '+63 917 000 0002', 'admin', now(), now())
  on conflict (id) do update
    set full_name = 'Sarah Connor',
        role = 'admin'::public.user_role,
        updated_at = now();


  -- ── 2. Admin Marcus Vance ────────────────────────────────────────────────
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  )
  values (
    uid_marcus,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    email_marcus,
    extensions.crypt(pwd_marcus, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Marcus Vance","name":"Marcus Vance"}'::jsonb,
    now(),
    now(),
    '', '', '', ''
  )
  on conflict (id) do update
    set encrypted_password = extensions.crypt(pwd_marcus, extensions.gen_salt('bf')),
        email = email_marcus,
        raw_user_meta_data = '{"full_name":"Marcus Vance","name":"Marcus Vance"}'::jsonb,
        updated_at = now();

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    uid_marcus,
    uid_marcus,
    email_marcus,
    jsonb_build_object('sub', uid_marcus::text, 'email', email_marcus, 'email_verified', true, 'phone_verified', false),
    'email',
    now(), now(), now()
  )
  on conflict (id) do nothing;

  update public.profiles
     set full_name = 'Marcus Vance',
         phone     = '+63 917 000 0003',
         role      = 'admin'::public.user_role,
         updated_at = now()
   where id = uid_marcus;

  insert into public.profiles (id, full_name, phone, role, created_at, updated_at)
  values (uid_marcus, 'Marcus Vance', '+63 917 000 0003', 'admin', now(), now())
  on conflict (id) do update
    set full_name = 'Marcus Vance',
        role = 'admin'::public.user_role,
        updated_at = now();
end $$;
