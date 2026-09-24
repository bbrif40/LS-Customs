-- Migration: 20260924180000_sms_only_on_assigned.sql
-- Restrict SMS dispatch trigger so it only triggers the Edge Function
-- when a booking is assigned. For all other statuses/events, do not dispatch SMS.

create or replace function public.dispatch_notification_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  endpoint_url text;
  payload jsonb;
  is_assigned boolean := false;
begin
  -- Only trigger SMS dispatch if the notification is for an assignment
  is_assigned := (
    coalesce(NEW.metadata->>'dispatch_sms', 'false') = 'true'
    or coalesce(NEW.metadata->>'new_status', '') = 'assigned'
    or NEW.title ilike '%assigned%'
  );

  if not is_assigned then
    return NEW;
  end if;

  endpoint_url := 'https://reyghhsjiwyabhgbgubt.supabase.co/functions/v1/dispatch-notification';
  
  payload := jsonb_build_object(
    'notification_id', NEW.id,
    'user_id', NEW.user_id,
    'title', NEW.title,
    'message', NEW.body,
    'metadata', NEW.metadata
  );

  perform net.http_post(
    url := endpoint_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := payload
  );

  return NEW;
exception when others then
  raise warning 'dispatch_notification_on_insert failed: %', SQLERRM;
  return NEW;
end;
$$;
