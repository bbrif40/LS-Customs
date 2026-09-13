-- =============================================================================
-- LS Customs — Seed admin account for admin portal access
-- =============================================================================
-- Creates a single admin user (email/password) with profiles.role = 'admin'.
-- Login credentials: email / admin123
-- Idempotent: ON CONFLICT DO NOTHING. Re-running is a no-op.
-- =============================================================================

do $$
declare
  uid_admin constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  email_admin constant text := 'admin@lscustoms.local';
begin
  -- 1. auth.users — admin account with role 'authenticated'
  --    encrypted_password is bcrypt hash of "admin123"
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  values
    (uid_admin, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', email_admin, crypt('admin123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"LS Admin","name":"LS Admin"}'::jsonb, now(), now(), '', '', '', '')
  on conflict (id) do nothing;

  -- 2. auth.identities — required for email-based sign-in
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values
    (uid_admin, uid_admin, email_admin, jsonb_build_object('sub', uid_admin::text, 'email', email_admin, 'email_verified', true, 'phone_verified', false), 'email', now(), now(), now())
  on conflict (id) do nothing;

  -- 3. profiles — set role = 'admin' (update if profile already exists from handle_new_user trigger)
  update public.profiles p
     set full_name = 'LS Admin',
         phone     = '+63 917 000 0001',
         role      = 'admin'::public.user_role,
         updated_at = now()
    where p.id = uid_admin;

  -- Insert profile row if it doesn't exist yet
  insert into public.profiles (id, full_name, phone, role, created_at, updated_at)
  values (uid_admin, 'LS Admin', '+63 917 000 0001', 'admin', now(), now())
  on conflict (id) do nothing;
end $$;
