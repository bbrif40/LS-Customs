insert into public.profiles (id, role, full_name)
values ('d5fa569f-e6cd-4d94-82f4-6f05d9550635', 'admin', 'Admin')
on conflict (id) do update set role = 'admin';