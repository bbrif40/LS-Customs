-- Fix INSERT RLS policies on support_ticket_messages.
--
-- The 20260830130000_… migration required the client to send author_id
-- and author_role explicitly, and the WITH CHECK pinned those values to
-- auth.uid() / 'admin' / 'customer'. The UI sends only { ticket_id, body }
-- (the React composer is the same path the hook uses), so author_id and
-- author_role arrived as NULL and the check `author_id = auth.uid()` was
-- NULL — RLS rejected every insert with 42501.
--
-- Fix: pin author_id and author_role with column defaults derived from
-- the session, and let the WITH CHECK be the only enforcement point.
--   author_id   default auth.uid()
--   author_role default 'customer'  (or 'admin' if is_admin())
--
-- The defaults mean:
--   - the client only has to send { ticket_id, body }
--   - a customer impersonating admin can't, because the WITH CHECK
--     "ticket is mine AND author_role = 'customer'" plus the policy
--     partition still binds role to role.
--   - an admin can post in both roles — we keep that capability
--     (the default picks 'admin' when is_admin(), but an admin can
--     still send a literal author_role = 'customer' if they need to
--     test the customer path).
--
-- Net effect: same security model, less for the client to send.

alter table public.support_ticket_messages
  alter column author_id set default auth.uid();

-- author_role needs a dynamic default — the role depends on who is
-- posting. Use a function so the default evaluates per insert.
create or replace function public.tg_default_ticket_message_role()
returns ticket_message_author
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_admin() then 'admin'::ticket_message_author else 'customer'::ticket_message_author end;
$$;

grant execute on function public.tg_default_ticket_message_role() to authenticated;

alter table public.support_ticket_messages
  alter column author_role set default public.tg_default_ticket_message_role();

-- Replace the two broken INSERT policies with one per role that
-- checks the *resolved* author_role (after default) against the
-- allowed relationship.

drop policy if exists "support_ticket_messages insert customer" on public.support_ticket_messages;
drop policy if exists "support_ticket_messages insert admin" on public.support_ticket_messages;

create policy "support_ticket_messages insert customer"
  on public.support_ticket_messages
  for insert
  to authenticated
  with check (
    author_role = 'customer'
    and author_id = auth.uid()
    and exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id
        and t.customer_id = auth.uid()
    )
  );

create policy "support_ticket_messages insert admin"
  on public.support_ticket_messages
  for insert
  to authenticated
  with check (
    author_role = 'admin'
    and author_id = auth.uid()
    and public.is_admin()
  );
