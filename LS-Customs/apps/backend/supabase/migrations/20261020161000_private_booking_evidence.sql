insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('booking-evidence','booking-evidence',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create function public.can_access_booking_evidence(p_name text) returns boolean language plpgsql security definer set search_path=public as $$
declare parts text[]:=string_to_array(p_name,'/');
begin
  if auth.uid() is null or cardinality(parts)<>3 or parts[2]!~'^[0-9a-f-]{36}$' then return false; end if;
  if public.is_admin() then return true; end if;
  if parts[1]='vehicle' then return exists(select 1 from vehicle_bookings where id=parts[2]::uuid and customer_id=auth.uid()); end if;
  if parts[1]='service' then return exists(select 1 from service_bookings where id=parts[2]::uuid and (customer_id=auth.uid() or mechanic_id=auth.uid())); end if;
  return false;
exception when invalid_text_representation then return false;
end $$;
revoke all on function public.can_access_booking_evidence(text) from public,anon;
grant execute on function public.can_access_booking_evidence(text) to authenticated;
create policy booking_evidence_read on storage.objects for select to authenticated using(bucket_id='booking-evidence' and public.can_access_booking_evidence(name));
create policy booking_evidence_insert on storage.objects for insert to authenticated with check(bucket_id='booking-evidence' and public.can_access_booking_evidence(name));
