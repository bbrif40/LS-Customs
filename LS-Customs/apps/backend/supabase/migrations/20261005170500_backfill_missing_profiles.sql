insert into public.profiles (id, full_name, role, phone)
select 
  id, 
  coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email, phone, 'Unknown User'),
  'customer'::public.user_role,
  phone
from auth.users
where not exists (
  select 1 from public.profiles where profiles.id = auth.users.id
);
