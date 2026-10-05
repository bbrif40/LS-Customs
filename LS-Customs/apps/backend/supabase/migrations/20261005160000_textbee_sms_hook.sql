-- Enable pg_net if not already enabled
create extension if not exists pg_net with schema extensions;

-- Create the function for the Send SMS Auth Hook
create or replace function public.custom_sms_hook(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  payload jsonb;
  req_id bigint;
  api_key text := 'txb_jfix8jTR3TnL5K6AcXtjUDMhGH17CH4M';
  device_id text := '6ab3c4b5d53025933554e038';
begin
  -- Create the payload for TextBee
  payload := jsonb_build_object(
    'recipients', jsonb_build_array(event->'user'->>'phone'),
    'message', 'Your LS Customs verification code is: ' || (event->'sms'->>'otp')
  );

  -- Call TextBee API using pg_net
  select net.http_post(
      url:='https://api.textbee.dev/api/v1/gateway/devices/' || device_id || '/sendSMS',
      headers:=jsonb_build_object('Content-Type', 'application/json', 'x-api-key', api_key),
      body:=payload
  ) into req_id;

  return event;
end;
$$;

grant execute on function public.custom_sms_hook to supabase_auth_admin;
revoke execute on function public.custom_sms_hook from public;
