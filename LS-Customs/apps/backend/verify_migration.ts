import { runLocalSql } from './scripts/local-postgres.ts'
runLocalSql(`
  select proname as trigger_function from pg_proc
  where pronamespace='public'::regnamespace
    and proname in ('notify_on_status_change','notify_on_ticket_admin_reply','notify_on_payment_status_change','notify_on_ticket_status_change')
  order by proname;
  select trigger_name,event_object_table from information_schema.triggers where trigger_schema='public' order by event_object_table,trigger_name;
`)
