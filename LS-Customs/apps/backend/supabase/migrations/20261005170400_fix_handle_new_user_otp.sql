create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Insert into profiles
  insert into public.profiles (id, full_name, role, phone)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      new.email,
      new.phone,
      'Unknown User'
    ),
    'customer'::public.user_role,
    new.phone
  );

  -- Insert dummy address if provided in meta data
  if new.raw_user_meta_data->>'address' is not null then
    insert into public.addresses (customer_id, label, line1, city, lat, lng, is_default)
    values (
      new.id,
      'Home',
      new.raw_user_meta_data->>'address',
      'Unknown',
      0,
      0,
      true
    );
  end if;

  return new;
end;
$$;
