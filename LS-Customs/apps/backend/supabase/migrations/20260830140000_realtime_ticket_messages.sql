-- Add support_ticket_messages to the supabase_realtime publication so
-- postgres_changes events fire for INSERTs (used by the customer thread
-- overlay and the admin tickets panel for live updates).
--
-- Without this, the channel opens but no events arrive.
--
-- RLS still applies on the receiving side: a customer subscribed to
-- postgres_changes only gets events for rows they could already SELECT,
-- so the existing support_ticket_messages policies already prevent leaks.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_ticket_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.support_ticket_messages';
  end if;
end
$$;
