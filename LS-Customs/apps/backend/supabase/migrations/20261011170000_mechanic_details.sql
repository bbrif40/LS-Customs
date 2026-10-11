alter table public.mechanic_profiles
  add column motorcycle_model text check (motorcycle_model is null or length(btrim(motorcycle_model)) between 1 and 100),
  add column motorcycle_plate text check (motorcycle_plate is null or length(btrim(motorcycle_plate)) between 1 and 20);

-- Invoker permissions and existing RLS still apply; the explicit check also
-- prevents customers/mechanics from using this administrative record browser.
create function public.get_admin_mechanic_records(p_mechanic_id uuid, p_section text, p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare result jsonb;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Administrator access required'; end if;
  if p_offset < 0 then raise exception 'Invalid offset'; end if;
  if p_section = 'activities' then
    select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into result from (
      select b.id, b.status, b.total_price, b.updated_at as created_at, p.full_name as customer_name
      from service_bookings b left join profiles p on p.id=b.customer_id
      where b.mechanic_id=p_mechanic_id order by b.updated_at desc, b.id limit 21 offset p_offset
    ) r;
  elsif p_section = 'reviews' then
    select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into result from (
      select v.id, v.rating, v.comment, v.created_at, p.full_name as customer_name
      from reviews v left join profiles p on p.id=v.customer_id
      where v.target_mechanic_id=p_mechanic_id order by v.created_at desc, v.id limit 21 offset p_offset
    ) r;
  elsif p_section = 'transactions' then
    select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into result from (
      select t.id, t.booking_id, t.amount, t.currency, t.status, t.provider_reference, t.created_at, p.full_name as customer_name
      from payments t join service_bookings b on t.booking_type='service' and b.id=t.booking_id
      left join profiles p on p.id=t.customer_id
      where b.mechanic_id=p_mechanic_id order by t.created_at desc, t.id limit 21 offset p_offset
    ) r;
  else raise exception 'Invalid section'; end if;
  return result;
end $$;
revoke all on function public.get_admin_mechanic_records(uuid,text,integer) from public, anon;
grant execute on function public.get_admin_mechanic_records(uuid,text,integer) to authenticated;
