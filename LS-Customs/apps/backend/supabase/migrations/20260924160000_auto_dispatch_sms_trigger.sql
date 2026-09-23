-- Migration: 20260924160000_auto_dispatch_sms_trigger.sql
-- Automatically triggers dispatch-notification Edge Function whenever a notification is inserted
-- using pg_net asynchronous HTTP POST.

create extension if not exists pg_net with schema extensions;

create or replace function public.dispatch_notification_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  endpoint_url text;
  payload jsonb;
begin
  -- Target our deployed Supabase Edge Function
  endpoint_url := 'https://reyghhsjiwyabhgbgubt.supabase.co/functions/v1/dispatch-notification';
  
  payload := jsonb_build_object(
    'notification_id', NEW.id,
    'user_id', NEW.user_id,
    'title', NEW.title,
    'message', NEW.body,
    'metadata', NEW.metadata
  );

  -- Perform asynchronous HTTP POST via pg_net (non-blocking for Postgres transactions)
  perform net.http_post(
    url := endpoint_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := payload
  );

  return NEW;
exception when others then
  -- Fail-safe: Never abort or roll back a notification insert if net.http_post fails
  raise warning 'dispatch_notification_on_insert failed: %', SQLERRM;
  return NEW;
end;
$$;

-- Drop existing trigger if exists and recreate
drop trigger if exists trigger_dispatch_notification on public.notifications;

create trigger trigger_dispatch_notification
after insert on public.notifications
for each row
execute function public.dispatch_notification_on_insert();
