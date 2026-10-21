insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('driver-licenses','driver-licenses',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy license_object_owner_insert on storage.objects for insert to authenticated with check(
  bucket_id='driver-licenses' and (storage.foldername(name))[1]=auth.uid()::text);
create policy license_object_private_read on storage.objects for select to authenticated using(
  bucket_id='driver-licenses' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
-- Replacements use new object paths: reviewed evidence cannot be overwritten.
