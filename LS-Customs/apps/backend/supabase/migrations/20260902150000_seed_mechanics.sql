-- Seed three real mobile-mechanic accounts so the admin dashboard's
-- "Mechanics" list is populated and the booking flow has assignable staff.
--
-- Idempotent: every INSERT is ON CONFLICT DO NOTHING keyed on the auth
-- user email (unique) and the profile id (the FK target for both
-- profiles and mechanic_profiles).
--
-- ponytail: three is enough to exercise the admin list, the "assigned
-- to me" mechanic dashboard, and round-robin dispatch. Add more when
-- load-testing needs them.

do $$
declare
  -- Deterministic UUIDs so re-running the seed is a no-op.
  uid_rico   constant uuid := 'b1111111-0000-0000-0000-000000000001';
  uid_marco  constant uuid := 'b1111111-0000-0000-0000-000000000002';
  uid_andre  constant uuid := 'b1111111-0000-0000-0000-000000000003';

  email_rico   constant text := 'mechanic.rico@lscustoms.local';
  email_marco  constant text := 'mechanic.marco@lscustoms.local';
  email_andre  constant text := 'mechanic.andre@lscustoms.local';
begin
  -- 1. auth.users — encrypted_password is the bcrypt hash of a
  --    throwaway dev password. Real onboarding uses the sign-up API.
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  values
    -- ponytail: encrypted_password is a hash of an empty string, so the
    -- seeded mechanics are NOT sign-in-able from this file alone. A real
    -- onboarding flow (supabase.auth.signUp) sets a real password at
    -- creation time; this seed only exists to populate the admin list.
    (uid_rico,  '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', email_rico,  crypt('', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
    (uid_marco, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', email_marco, crypt('', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
    (uid_andre, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', email_andre, crypt('', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '')
  on conflict (id) do nothing;

  -- Identities — required by Supabase auth so the account is
  -- sign-inable rather than just a row in users. `email` is a generated
  -- column on this table (derived from user_id → auth.users.email), so
  -- we don't set it explicitly.
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values
    (uid_rico,  uid_rico,  email_rico,  jsonb_build_object('sub', uid_rico::text,  'email', email_rico,  'email_verified', true, 'phone_verified', false), 'email', now(), now(), now()),
    (uid_marco, uid_marco, email_marco, jsonb_build_object('sub', uid_marco::text, 'email', email_marco, 'email_verified', true, 'phone_verified', false), 'email', now(), now(), now()),
    (uid_andre, uid_andre, email_andre, jsonb_build_object('sub', uid_andre::text, 'email', email_andre, 'email_verified', true, 'phone_verified', false), 'email', now(), now(), now())
  on conflict (id) do nothing;

  -- 2. profiles — the auth.users trigger (handle_new_user) already
  --    inserted a 'customer' row, so we UPDATE role + full_name + phone
  --    in place rather than trying to conflict-insert.
  update public.profiles p
     set full_name = v.full_name,
         phone     = v.phone,
         role      = 'mechanic'::public.user_role
    from (values
      (uid_rico,  'Rico Hernandez',  '+63 917 555 0101'),
      (uid_marco, 'Marco dela Cruz', '+63 917 555 0102'),
      (uid_andre, 'Andre Villanueva','+63 917 555 0103')
    ) as v(id, full_name, phone)
   where p.id = v.id;

  -- 3. mechanic_profiles — full detail: specialties, availability,
  --    live location, experience, rating. Everything the admin list
  --    and the dispatcher look at.
  insert into public.mechanic_profiles
    (id, specialties, is_available, current_lat, current_lng, years_experience, rating_avg, rating_count)
  values
    (uid_rico,
     array['engine_diagnostics','brake_services','tire_wheel_care'],
     true, 14.5995, 120.9842, 8, 4.7, 42),
    (uid_marco,
     array['electrical_battery_care','lighting_visibility','quick_fixes'],
     true, 14.6760, 121.0437, 5, 4.5, 28),
    (uid_andre,
     array['routine_fluid_service','tire_wheel_care','diagnostic_repair'],
     false, 14.5547, 121.0244, 12, 4.9, 67)
  on conflict (id) do nothing;
end $$;
