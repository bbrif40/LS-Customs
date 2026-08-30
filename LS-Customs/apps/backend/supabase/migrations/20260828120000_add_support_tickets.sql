-- Support Tickets Table
-- Allows customers to create support tickets via chatbot
-- Admins can view/manage all tickets

create type ticket_status as enum ('open', 'in_progress', 'resolved', 'closed');
create type ticket_priority as enum ('low', 'medium', 'high', 'urgent');
create type ticket_category as enum ('general', 'billing', 'technical', 'booking', 'mechanic', 'other');

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  category ticket_category not null default 'general',
  priority ticket_priority not null default 'medium',
  subject text not null,
  description text not null,
  status ticket_status not null default 'open',
  assigned_admin_id uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for common queries
create index idx_support_tickets_customer on support_tickets(customer_id);
create index idx_support_tickets_status on support_tickets(status);
create index idx_support_tickets_assigned on support_tickets(assigned_admin_id) where assigned_admin_id is not null;

-- RLS Policies
alter table public.support_tickets enable row level security;

-- Customers: can create tickets (with their own customer_id)
create policy "support_tickets insert customer"
  on public.support_tickets for insert to authenticated
  with check (customer_id = auth.uid());

-- Customers: can read their own tickets
create policy "support_tickets select customer"
  on public.support_tickets for select to authenticated
  using (customer_id = auth.uid() or public.is_admin());

-- Customers: can update their own tickets (e.g., add more info) while open
create policy "support_tickets update customer"
  on public.support_tickets for update to authenticated
  using (customer_id = auth.uid() and status = 'open')
  with check (customer_id = auth.uid() and status = 'open');

-- Admins: full access
create policy "support_tickets admin all"
  on public.support_tickets for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Updated_at trigger
create trigger set_updated_at_support_tickets
  before update on public.support_tickets
  for each row execute function public.set_updated_at();

-- Optional: Notify admin on new ticket (via existing notification system)
-- This can be extended to send email/SMS via dispatch-notification function