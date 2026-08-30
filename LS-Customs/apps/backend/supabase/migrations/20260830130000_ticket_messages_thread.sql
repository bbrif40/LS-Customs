-- Threaded messages on support tickets.
-- Lets the customer and the admin reply back and forth inside one ticket.
-- Append-only: no update / no delete on messages.
--
-- Author role is pinned at insert time by RLS (a customer can't post as
-- 'admin' and an admin can't post as 'customer').
--
-- A BEFORE INSERT trigger keeps the parent ticket's status in sync with
-- the conversation so admins don't have to remember to flip the badge:
--   - first admin message on an 'open' ticket → 'in_progress'
--   - any customer message on a 'resolved' or 'closed' ticket → 'in_progress'
-- The customer's first message is the original ticket body, which goes
-- through create-ticket (not this table), so this trigger only ever
-- fires for actual replies.

create type ticket_message_author as enum ('customer', 'admin');

create table public.support_ticket_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.support_tickets(id) on delete cascade,
  author_id   uuid not null references public.profiles(id),
  author_role ticket_message_author not null,
  body        text not null check (char_length(body) between 1 and 4000),
  created_at  timestamptz not null default now()
);

-- Read path: "give me this ticket's thread ordered by time"
create index if not exists idx_support_ticket_messages_ticket_created
  on public.support_ticket_messages(ticket_id, created_at);

alter table public.support_ticket_messages enable row level security;

-- ── RLS ────────────────────────────────────────────────────────────
-- One SELECT policy: the ticket's customer, or any admin, can read.
-- One INSERT policy per author role, because the WITH CHECK needs to
-- pin both the row's author_id to auth.uid() AND author_role to the
-- correct enum value (you can't combine these into one policy without
-- giving customers a way to impersonate admins).

create policy "support_ticket_messages select"
  on public.support_ticket_messages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.support_tickets t
      where t.id = support_ticket_messages.ticket_id
        and (t.customer_id = auth.uid() or public.is_admin())
    )
  );

create policy "support_ticket_messages insert customer"
  on public.support_ticket_messages
  for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and author_role = 'customer'
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
    author_id = auth.uid()
    and author_role = 'admin'
    and public.is_admin()
  );

-- No update / delete policies. Messages are append-only.

-- ── Status sync trigger ───────────────────────────────────────────
-- Fires once per message insert. The new row's author_role determines
-- whether the parent ticket should move to in_progress.

create or replace function public.tg_ticket_message_sync_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_status ticket_status;
begin
  select status into parent_status
  from public.support_tickets
  where id = new.ticket_id
  for update;

  if not found then
    return new;
  end if;

  if new.author_role = 'admin' and parent_status = 'open' then
    update public.support_tickets
      set status = 'in_progress', updated_at = now()
      where id = new.ticket_id;
  elsif new.author_role = 'customer' and parent_status in ('resolved', 'closed') then
    update public.support_tickets
      set status = 'in_progress', updated_at = now()
      where id = new.ticket_id;
  end if;

  return new;
end;
$$;

create trigger trg_ticket_message_sync_status
  before insert on public.support_ticket_messages
  for each row execute function public.tg_ticket_message_sync_status();

-- ── Grants ────────────────────────────────────────────────────────
-- Same "table added after the original GRANT … ON ALL TABLES" pattern
-- as 20260830120001_… (service_role) and 20260830120002_… (authenticated).
-- Without these the admin's insert and the customer's select both 403.
grant select, insert on public.support_ticket_messages to authenticated;
grant all on public.support_ticket_messages to service_role;
