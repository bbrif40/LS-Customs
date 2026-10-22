-- Record earned booking revenue at completion without implying that money was
-- collected. Provider payments and cash collection remain in their own ledger.
create table public.booking_revenue_recognitions (
  id uuid primary key default gen_random_uuid(),
  booking_type public.booking_type not null,
  booking_id uuid not null,
  customer_id uuid not null references public.profiles(id),
  amount numeric(12,2) not null check (amount >= 0),
  recognized_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_type, booking_id)
);

alter table public.booking_revenue_recognitions enable row level security;
create policy booking_revenue_read on public.booking_revenue_recognitions
  for select to authenticated using (customer_id = auth.uid() or public.is_admin());
grant select on public.booking_revenue_recognitions to authenticated;
grant all on public.booking_revenue_recognitions to service_role;

-- Cash is recognized at service completion. Other revenue stays tied to actual
-- collections: direct booking payments and per-charge account events. Do not
-- combine this view with financial_collections in a revenue total.
create view public.financial_revenue with (security_invoker = true) as
  select id, null::uuid as payment_id, booking_type, booking_id, customer_id, amount,
    'PHP'::text as currency,
    'cash_completion'::text as source,
    'recognized'::text as status,
    recognized_at,
    created_at,
    updated_at
  from public.booking_revenue_recognitions
  union all
  -- Direct booking payments retain their real status, including pending and
  -- refunded transactions. Revenue metrics should count succeeded rows only.
  -- Account quote payments are represented by their per-charge events below.
  select p.id, p.id as payment_id, p.booking_type, p.booking_id, p.customer_id,
    case when p.status = 'succeeded' then p.amount - p.refunded_amount else p.amount end as amount,
    p.currency,
    'online_payment'::text as source,
    p.status::text as status,
    p.created_at as recognized_at,
    p.created_at,
    p.updated_at
  from public.payments p
  where p.account_quote_id is null
    and coalesce(p.provider, '') not in ('cash', 'cash_ledger')
    and not exists (
      select 1 from public.booking_revenue_recognitions r
      where r.booking_type = p.booking_type and r.booking_id = p.booking_id
    )
  union all
  -- Account quote settlements are split by charge, including across bookings.
  -- Cash events are likewise recorded per charge; ignore charge amounts already
  -- covered by a cash completion recognition to avoid counting them twice.
  select e.id,
    coalesce(e.payment_id, case when e.kind = 'online' then e.request_id end) as payment_id,
    c.booking_type, c.booking_id, e.customer_id,
    case when p.status = 'succeeded' and p.amount > 0
      then round(e.amount * greatest(0, p.amount - p.refunded_amount) / p.amount, 2)
      else e.amount end as amount,
    coalesce(p.currency, 'PHP') as currency,
    case when e.kind = 'online' then 'account_charge_online' else 'account_charge_cash' end as source,
    coalesce(p.status::text, 'succeeded') as status,
    e.created_at as recognized_at,
    e.created_at,
    coalesce(p.updated_at, e.created_at) as updated_at
  from public.account_events e
  join public.account_charges c on c.id = e.charge_id
  left join public.payments p on p.id = coalesce(e.payment_id, case when e.kind = 'online' then e.request_id end)
  where e.kind in ('online', 'cash')
    and not (
      c.kind::text in ('service_base', 'service_extra')
      and exists (
        select 1 from public.booking_revenue_recognitions r
        where r.booking_type = c.booking_type and r.booking_id = c.booking_id
      )
    );
grant select on public.financial_revenue to authenticated;

create function public.recognize_completed_booking_revenue()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  recognized_amount numeric(12,2);
  booking_kind public.booking_type;
  completion_time timestamptz;
begin
  if new.status <> 'completed' or new.payment_method is distinct from 'cash' then return new; end if;

  booking_kind := case when tg_table_name = 'service_bookings' then 'service'::public.booking_type
    else 'vehicle'::public.booking_type end;
  recognized_amount := greatest(0, coalesce(new.total_price, 0));
  if booking_kind = 'service' then
    select recognized_amount + coalesce(sum(c.amount), 0)
      into recognized_amount
      from public.account_charges c
      where c.booking_type = 'service'
        and c.booking_id = new.id
        and c.kind::text = 'service_extra';
  end if;
  completion_time := coalesce(new.updated_at, now());

  insert into public.booking_revenue_recognitions(
    booking_type, booking_id, customer_id, amount, recognized_at, created_at, updated_at
  ) values (
    booking_kind, new.id, new.customer_id, recognized_amount,
    completion_time, completion_time, completion_time
  )
  on conflict (booking_type, booking_id) do update
    set amount = excluded.amount,
        updated_at = now()
    where public.booking_revenue_recognitions.amount < excluded.amount;

  return new;
end $$;
revoke all on function public.recognize_completed_booking_revenue() from public, anon, authenticated;

create trigger service_booking_revenue_completed
  after insert or update on public.service_bookings
  for each row execute function public.recognize_completed_booking_revenue();
create trigger vehicle_booking_revenue_completed
  after insert or update on public.vehicle_bookings
  for each row execute function public.recognize_completed_booking_revenue();

-- Backfill completions from before this migration. Approved service extras are
-- in account_charges; cash and online payments stay in their collection ledger.
insert into public.booking_revenue_recognitions(
  booking_type, booking_id, customer_id, amount, recognized_at, created_at, updated_at
)
select 'service'::public.booking_type, b.id, b.customer_id,
  greatest(0, coalesce(b.total_price, 0)) + coalesce(sum(c.amount), 0),
  coalesce(b.updated_at, b.created_at, now()),
  coalesce(b.updated_at, b.created_at, now()),
  coalesce(b.updated_at, b.created_at, now())
from public.service_bookings b
left join public.account_charges c on c.booking_type = 'service'
  and c.booking_id = b.id and c.kind::text = 'service_extra'
where b.status = 'completed'
  and b.payment_method = 'cash'
group by b.id, b.customer_id, b.total_price, b.updated_at, b.created_at
union all
select 'vehicle'::public.booking_type, b.id, b.customer_id, greatest(0, coalesce(b.total_price, 0)),
  coalesce(b.updated_at, b.created_at, now()),
  coalesce(b.updated_at, b.created_at, now()),
  coalesce(b.updated_at, b.created_at, now())
from public.vehicle_bookings b
where b.status = 'completed' and b.payment_method = 'cash'
on conflict (booking_type, booking_id) do update
  set amount = greatest(public.booking_revenue_recognitions.amount, excluded.amount),
      updated_at = case
        when public.booking_revenue_recognitions.amount < excluded.amount then now()
        else public.booking_revenue_recognitions.updated_at end;

-- Supabase projects publish selected tables to Realtime. Keep local SQL tests
-- and non-Supabase Postgres environments usable when that publication is absent.
do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'booking_revenue_recognitions'
    ) then
    alter publication supabase_realtime add table public.booking_revenue_recognitions;
  end if;
end $$;
