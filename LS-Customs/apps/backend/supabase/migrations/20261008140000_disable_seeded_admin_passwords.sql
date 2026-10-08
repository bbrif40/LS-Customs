-- Disable only passwords previously published in historical seed migrations.
-- Rotated passwords and their admin roles/sessions are preserved.
-- Historical migrations remain unchanged; these literal values are already public.
do $$
declare compromised record;
begin
  for compromised in
    select u.id from auth.users u
    join (values
    ('admin@lscustoms.local','admin123'),
    ('sarah.admin@lscustoms.local','AdminSarah2026!'),
    ('marcus.admin@lscustoms.local','AdminMarcus2026!')
    ) as exposed(email,password) on lower(u.email)=exposed.email
    where coalesce(u.encrypted_password,'')<>''
      and u.encrypted_password=extensions.crypt(exposed.password,u.encrypted_password)
  loop
    update auth.users set encrypted_password='',updated_at=now() where id=compromised.id;
    update public.profiles set role='customer',updated_at=now() where id=compromised.id and role='admin';
    delete from auth.refresh_tokens where user_id=compromised.id::text;
    delete from auth.sessions where user_id=compromised.id;
  end loop;
end;
$$;
