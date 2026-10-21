-- Auth owns OTP issuance. Forward its original payload through a private worker
-- credential; provider credentials remain exclusively in the Edge environment.
create or replace function public.custom_sms_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  worker_url text;
  worker_token text;
begin
  select decrypted_secret into worker_url from vault.decrypted_secrets
    where name = 'operations_worker_url' limit 1;
  select decrypted_secret into worker_token from vault.decrypted_secrets
    where name = 'operations_worker_token' limit 1;
  if coalesce(worker_token, '') = '' or worker_url is null
     or worker_url !~ '^https://[^/]+/functions/v1/operations-worker$' then
    raise exception 'SMS delivery is not configured';
  end if;
  perform net.http_post(
    url := regexp_replace(worker_url, '/operations-worker$', '/textbee-sms-hook'),
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || worker_token),
    body := event,
    timeout_milliseconds := 20000
  );
  return '{}'::jsonb;
end;
$$;
revoke all on function public.custom_sms_hook(jsonb) from public, anon, authenticated;
grant execute on function public.custom_sms_hook(jsonb) to supabase_auth_admin;
