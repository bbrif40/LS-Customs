-- Record administrator-confirmed cash as cash account events. Provider payment
-- attempts stay separate and failed attempts can still receive a real webhook.
create table public.admin_cash_settlements (
  id uuid primary key default gen_random_uuid(),
  account_event_id uuid not null unique references public.account_events(id),
  source_payment_id uuid references public.payments(id),
  account_quote_id uuid references public.account_quotes(id),
  charge_id uuid not null references public.account_charges(id),
  settlement_kind text not null check (settlement_kind in ('account_quote', 'service_base')),
  booking_type public.booking_type not null,
  booking_id uuid not null,
  customer_id uuid not null references public.profiles(id),
  amount numeric(10,2) not null check (amount > 0),
  reason text not null check (length(trim(reason)) >= 3),
  actor_id uuid not null references public.profiles(id),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  check ((settlement_kind = 'account_quote') = (account_quote_id is not null)),
  check ((settlement_kind = 'account_quote') = (source_payment_id is not null))
);
create unique index admin_cash_settlement_request_charge
  on public.admin_cash_settlements(request_id, charge_id);
create unique index admin_cash_settlement_payment_charge
  on public.admin_cash_settlements(source_payment_id, charge_id)
  where source_payment_id is not null;
create index admin_cash_settlements_quote on public.admin_cash_settlements(account_quote_id)
  where account_quote_id is not null;

alter table public.admin_cash_settlements enable row level security;
create policy admin_cash_settlements_read on public.admin_cash_settlements
  for select to authenticated using (public.is_admin());
grant select on public.admin_cash_settlements to authenticated;
grant all on public.admin_cash_settlements to service_role;
create trigger admin_cash_settlements_immutable before update or delete
  on public.admin_cash_settlements for each row execute function public.reject_financial_history_mutation();

-- Preserve the current view contract and append safe linkage fields so the
-- admin page can group a multi-booking quote cash receipt as one transaction.
create or replace view public.financial_collections with (security_invoker = true) as
  select id, booking_type, booking_id, customer_id,
    case when status = 'succeeded' then amount - refunded_amount else amount end as amount,
    currency, provider, provider_reference, status, created_at, updated_at,
    null::uuid as source_payment_id, account_quote_id,
    null::uuid as settlement_request_id, null::integer as allocation_count
  from public.payments
  union all
  select s.id, s.booking_type, s.booking_id, s.customer_id, s.amount,
    'PHP'::text, 'admin_cash_settlement'::text, null::text,
    'succeeded'::public.payment_status, s.created_at, s.created_at,
    s.source_payment_id, s.account_quote_id, s.request_id,
    count(*) over (partition by s.request_id)::integer
  from public.admin_cash_settlements s
  union all
  select e.id, c.booking_type, c.booking_id, e.customer_id, e.amount,
    'PHP'::text, 'cash_ledger'::text, null::text,
    'succeeded'::public.payment_status, e.created_at, e.created_at,
    null::uuid, null::uuid, null::uuid, null::integer
  from public.account_events e
  join public.account_charges c on c.id = e.charge_id
  where e.kind = 'cash' and e.payment_id is null
    and not exists (
      select 1 from public.admin_cash_settlements s where s.account_event_id = e.id
    );
grant select on public.financial_collections to authenticated;

create or replace function public.complete_admin_transaction(
  p_payment uuid,
  p_request uuid,
  p_reason text,
  p_booking_type public.booking_type default null,
  p_booking uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  payment_row payments;
  quote_row account_quotes;
  booking_row service_bookings;
  charge_row account_charges;
  allocation_count integer;
  distinct_allocation_count integer;
  charge_count integer;
  allocation_total numeric(10,2);
  allocated numeric(10,2);
  outstanding numeric(10,2);
  applied numeric(10,2);
  total numeric(10,2) := 0;
  affected_charge_ids uuid[] := '{}'::uuid[];
  superseded_payment_ids uuid[] := '{}'::uuid[];
  settled_row admin_cash_settlements;
  event_id uuid;
  event_reason text;
  attempt record;
  mode text;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_request is null or length(trim(coalesce(p_reason, ''))) < 3
    or length(trim(p_reason)) > 2000 then
    raise exception 'Enter a valid cash collection reason and request ID';
  end if;

  -- Request retries return the original receipt only when the same target is
  -- supplied; a reused request ID cannot settle a different customer/charge.
  select * into settled_row from admin_cash_settlements where request_id = p_request limit 1;
  if found then
    if p_payment is not null and not exists (
      select 1 from admin_cash_settlements where request_id = p_request and source_payment_id = p_payment
    ) then raise exception 'Request ID is already used for another settlement'; end if;
    if p_payment is null and (p_booking_type is distinct from settled_row.booking_type
      or p_booking is distinct from settled_row.booking_id) then
      raise exception 'Request ID is already used for another settlement';
    end if;
    return jsonb_build_object('status', 'already_settled', 'mode', settled_row.settlement_kind,
      'amount', (select sum(amount) from admin_cash_settlements where request_id = p_request),
      'request_id', p_request);
  end if;
  if exists (select 1 from account_events where request_id = p_request) then
    raise exception 'Request ID is already used for another account event';
  end if;

  if p_payment is not null then
    if p_booking_type is not null or p_booking is not null then
      raise exception 'Choose a payment or a completed cash service balance';
    end if;
    select * into payment_row from payments where id = p_payment for update;
    if not found or payment_row.account_quote_id is null
      or payment_row.status <> 'pending'
      or coalesce(payment_row.provider, '') in ('cash', 'cash_ledger', 'admin_cash_settlement') then
      raise exception 'Only a pending account quote payment can be completed as cash';
    end if;
    select * into quote_row from account_quotes where id = payment_row.account_quote_id;
    if not found or quote_row.customer_id is distinct from payment_row.customer_id
      or quote_row.amount is distinct from payment_row.amount then
      raise exception 'Payment and account quote mismatch';
    end if;
    perform 1 from profiles where id = quote_row.customer_id for update;
    select * into quote_row from account_quotes where id = payment_row.account_quote_id for update;
    if quote_row.settled_at is not null then
      raise exception 'Account quote was already settled by another payment';
    end if;
    if exists (select 1 from admin_cash_settlements where source_payment_id = payment_row.id) then
      return jsonb_build_object('status', 'already_settled', 'mode', 'account_quote',
        'amount', (select sum(amount) from admin_cash_settlements where source_payment_id = payment_row.id),
        'request_id', (select min(request_id) from admin_cash_settlements where source_payment_id = payment_row.id));
    end if;

    mode := 'account_quote';
    event_reason := 'Admin cash settlement for account quote ' || quote_row.id::text
      || ' (provider attempt ' || payment_row.id::text || '): ' || trim(p_reason);
    select count(*)::integer, count(distinct (a->>'charge_id')::uuid)::integer,
      sum((a->>'amount')::numeric)::numeric(10,2)
      into allocation_count, distinct_allocation_count, allocation_total
      from jsonb_array_elements(quote_row.allocations) a;
    select count(*)::integer into charge_count
      from account_charges c
      join jsonb_array_elements(quote_row.allocations) a on c.id = (a->>'charge_id')::uuid
      where c.customer_id = quote_row.customer_id;
    if allocation_count = 0 or distinct_allocation_count <> allocation_count
      or charge_count <> allocation_count or allocation_total is distinct from quote_row.amount
      or exists (select 1 from jsonb_array_elements(quote_row.allocations) a
        where (a->>'amount')::numeric <= 0 or (a->>'amount')::numeric <> round((a->>'amount')::numeric, 2)) then
      raise exception 'Account quote allocation is unavailable';
    end if;
    -- Match the account ledger's customer lock and take every charge lock in a
    -- stable order before adjusting any allocation.
    for charge_row in
      select c.* from account_charges c
      join jsonb_array_elements(quote_row.allocations) a on c.id = (a->>'charge_id')::uuid
      where c.customer_id = quote_row.customer_id
      order by c.id for update of c
    loop
      select (a->>'amount')::numeric(10,2) into allocated
        from jsonb_array_elements(quote_row.allocations) a
        where (a->>'charge_id')::uuid = charge_row.id;
      outstanding := charge_row.amount - charge_row.paid - charge_row.waived;
      applied := least(allocated, outstanding);
      if applied > 0 then
        perform public.adjust_account_charge(charge_row.id, applied, 'cash', event_reason, p_request);
        select id into event_id from account_events where request_id = p_request and charge_id = charge_row.id;
        insert into admin_cash_settlements(account_event_id, source_payment_id, account_quote_id,
          charge_id, settlement_kind, booking_type, booking_id, customer_id, amount, reason, actor_id, request_id)
          values(event_id, payment_row.id, quote_row.id, charge_row.id, 'account_quote',
            charge_row.booking_type, charge_row.booking_id, charge_row.customer_id, applied,
            trim(p_reason), auth.uid(), p_request);
        affected_charge_ids := array_append(affected_charge_ids, charge_row.id);
        total := total + applied;
      end if;
    end loop;
    if total <= 0 then
      raise exception 'No outstanding balance remains in this account quote; no cash was recorded';
    end if;
    -- A later provider success must still run through settle_account_quote so
    -- its unallocated amount is visible to the existing overpayment queue.
    -- Expire matching snapshots and fail their local attempts without deleting
    -- payment history or representing the provider as having succeeded.
    update account_quotes q set expires_at = least(q.expires_at, now())
      where q.customer_id = quote_row.customer_id and q.settled_at is null
        and exists (select 1 from jsonb_array_elements(q.allocations) a
          where (a->>'charge_id')::uuid = any(affected_charge_ids));
    for attempt in
      select p.id from payments p join account_quotes q on q.id = p.account_quote_id
      where q.customer_id = quote_row.customer_id and q.settled_at is null
        and p.status = 'pending'
        and exists (select 1 from jsonb_array_elements(q.allocations) a
          where (a->>'charge_id')::uuid = any(affected_charge_ids))
      order by p.id for update of p skip locked
    loop
      update payments set status = 'failed' where id = attempt.id and status = 'pending';
      if found then
        superseded_payment_ids := array_append(superseded_payment_ids, attempt.id);
        delete from payment_checkout_sessions where payment_id = attempt.id;
      end if;
    end loop;
    insert into admin_audit_logs(admin_id, action_type, record_type, record_id, details)
      values(auth.uid(), 'admin_cash_settlement', 'account_quote', quote_row.id::text,
        jsonb_build_object('reason', trim(p_reason), 'amount', total, 'request_id', p_request,
          'source_payment_id', payment_row.id, 'superseded_payment_ids', superseded_payment_ids,
          'charge_ids', affected_charge_ids));
  else
    if p_booking_type is distinct from 'service'::public.booking_type or p_booking is null then
      raise exception 'A completed cash service booking is required';
    end if;
    select * into booking_row from service_bookings where id = p_booking for update;
    if not found or booking_row.status <> 'completed' or booking_row.payment_method <> 'cash' then
      raise exception 'Only a completed cash service balance can be settled';
    end if;
    perform 1 from profiles where id = booking_row.customer_id for update;
    select * into charge_row from account_charges
      where booking_type = 'service' and booking_id = booking_row.id
        and customer_id = booking_row.customer_id and kind::text = 'service_base' for update;
    if not found then raise exception 'Completed service base balance is unavailable'; end if;
    outstanding := charge_row.amount - charge_row.paid - charge_row.waived;
    if outstanding <= 0 then
      return jsonb_build_object('status', 'already_settled', 'mode', 'service_base',
        'amount', 0, 'request_id', p_request);
    end if;
    mode := 'service_base';
    event_reason := 'Admin cash settlement for completed service ' || booking_row.id::text
      || ': ' || trim(p_reason);
    perform public.adjust_account_charge(charge_row.id, outstanding, 'cash', event_reason, p_request);
    select id into event_id from account_events where request_id = p_request and charge_id = charge_row.id;
    insert into admin_cash_settlements(account_event_id, charge_id, settlement_kind,
      booking_type, booking_id, customer_id, amount, reason, actor_id, request_id)
      values(event_id, charge_row.id, 'service_base', charge_row.booking_type, charge_row.booking_id,
        charge_row.customer_id, outstanding, trim(p_reason), auth.uid(), p_request);
    affected_charge_ids := array_append(affected_charge_ids, charge_row.id);
    total := outstanding;

    update account_quotes q set expires_at = least(q.expires_at, now())
      where q.customer_id = booking_row.customer_id and q.settled_at is null
        and exists (select 1 from jsonb_array_elements(q.allocations) a
          where (a->>'charge_id')::uuid = charge_row.id);
    for attempt in
      select p.id from payments p join account_quotes q on q.id = p.account_quote_id
      where q.customer_id = booking_row.customer_id and q.settled_at is null
        and p.status = 'pending'
        and exists (select 1 from jsonb_array_elements(q.allocations) a
          where (a->>'charge_id')::uuid = charge_row.id)
      order by p.id for update of p skip locked
    loop
      update payments set status = 'failed' where id = attempt.id and status = 'pending';
      if found then
        superseded_payment_ids := array_append(superseded_payment_ids, attempt.id);
        delete from payment_checkout_sessions where payment_id = attempt.id;
      end if;
    end loop;
    insert into admin_audit_logs(admin_id, action_type, record_type, record_id, details)
      values(auth.uid(), 'admin_cash_settlement', 'service_booking', booking_row.id::text,
        jsonb_build_object('reason', trim(p_reason), 'amount', total, 'request_id', p_request,
          'charge_id', charge_row.id, 'superseded_payment_ids', superseded_payment_ids));
  end if;

  return jsonb_build_object('status', 'settled', 'mode', mode, 'amount', total,
    'request_id', p_request);
end $$;

revoke all on function public.complete_admin_transaction(uuid, uuid, text, public.booking_type, uuid)
  from public, anon, authenticated;
grant execute on function public.complete_admin_transaction(uuid, uuid, text, public.booking_type, uuid)
  to authenticated;

-- Charge and event updates are customer-visible through RLS-filtered realtime.
do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'account_charges') then
      alter publication supabase_realtime add table public.account_charges;
    end if;
    if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'account_events') then
      alter publication supabase_realtime add table public.account_events;
    end if;
  end if;
end $$;
