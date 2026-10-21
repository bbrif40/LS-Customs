-- Additive account ledger. Mutations are transactions, never client-written balances.
create type public.account_charge_kind as enum ('late_return','daily_penalty','damage','service_extra');
create type public.account_event_kind as enum ('cash','online','waiver','correction');

create table public.transaction_terms (
  version text primary key,
  content text not null,
  created_at timestamptz not null default now(),
  active boolean not null default true
);
alter table public.transaction_terms enable row level security;
create policy terms_read on public.transaction_terms for select to authenticated using (true);
grant select on public.transaction_terms to authenticated;
insert into public.transaction_terms(version,content) values ('2026-10-20',
  'Rentals: upload a valid matching driver license before payment. License approval precedes online payment or cash confirmation. Cash is collected before handover; confirmed cash rentals cannot be cancelled by customers. Online payment is due within 3 hours of license approval. Cash pickup reservations expire 3 hours after pickup unless an admin agrees an extension. Rental days are 24 hours. Late return costs PHP250 per completed hour after the agreed return time. Posted late-return debt blocks new rentals immediately and flags the account after 24 hours unpaid. The first PHP1000 daily penalty applies at 48 hours after posting, then each completed 24 hours until the entire late-fee balance is paid or waived. Prepaid rental cancellation before handover receives a full refund after approval. Early returns have no automatic refund. Extensions require availability, license validity, approval and payment before the original return deadline; each started extra 24 hours uses the current daily price. Damage proposals have a 48-hour dispute window from first successful notification; finalized unpaid damage blocks rentals but has no daily penalty. Mechanic and roadside: confirmation requires mechanic acceptance; online payment confirms on success, cash is due after service. Approved customer cancellations refund 100% before travel and 45% after travel but before work. Cash cancellation is free before work. After work begins, support reviews cancellations. Provider cancellation because no mechanic can attend refunds 100%. Additional work requires your itemized approval before work or charges. Mechanic offers last 5 minutes; accepted online capacity is held for 10 minutes. Payment after expiry enters a full refund and does not restore the booking. A declined provider time change receives a full refund. Original appointments stay until replacement acceptance and any price difference are secured. Operating hours are 8 AM to 6 PM Philippine time; service coverage is NCR. Live GPS may be unavailable. Financial adjustments and acceptance are audited.');

create table public.transaction_acceptances (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  transaction_id uuid not null,
  transaction_kind text not null check (transaction_kind in ('vehicle','service','roadside','payment','balance')),
  terms_version text not null references public.transaction_terms(version),
  accepted_at timestamptz not null default now(),
  unique(customer_id,transaction_id,transaction_kind,terms_version)
);
alter table public.transaction_acceptances enable row level security;
create policy acceptance_read on public.transaction_acceptances for select to authenticated
  using(customer_id=auth.uid() or public.is_admin());
grant select on public.transaction_acceptances to authenticated;

create table public.account_charges (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  booking_type public.booking_type not null,
  booking_id uuid not null,
  kind public.account_charge_kind not null,
  parent_id uuid references public.account_charges(id),
  description text not null,
  amount numeric(10,2) not null check(amount>0),
  paid numeric(10,2) not null default 0 check(paid>=0),
  waived numeric(10,2) not null default 0 check(waived>=0),
  posted_at timestamptz not null default now(),
  due_at timestamptz,
  period_number integer,
  blocks_rentals boolean not null default true,
  check(paid+waived<=amount),
  unique(parent_id,period_number)
);
create unique index one_late_return_per_booking on public.account_charges(booking_id) where kind='late_return';
create index account_charges_owner on public.account_charges(customer_id,posted_at);
alter table public.account_charges enable row level security;
create policy charge_read on public.account_charges for select to authenticated
  using(customer_id=auth.uid() or public.is_admin());
grant select on public.account_charges to authenticated;

create table public.account_events (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null references public.account_charges(id),
  customer_id uuid not null references public.profiles(id),
  actor_id uuid references public.profiles(id),
  kind public.account_event_kind not null,
  amount numeric(10,2) not null check(amount<>0 or kind='correction'),
  reason text not null,
  before_value jsonb not null,
  after_value jsonb not null,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique(request_id,charge_id)
);
alter table public.account_events enable row level security;
create policy account_event_read on public.account_events for select to authenticated
  using(customer_id=auth.uid() or public.is_admin());
grant select on public.account_events to authenticated;

create table public.account_flags (
  customer_id uuid primary key references public.profiles(id),
  flagged_at timestamptz,
  cleared_at timestamptz
);
alter table public.account_flags enable row level security;
create policy account_flag_read on public.account_flags for select to authenticated
  using(customer_id=auth.uid() or public.is_admin());
grant select on public.account_flags to authenticated;

create table public.account_flag_history (
  id uuid primary key default gen_random_uuid(),customer_id uuid not null references public.profiles(id),
  previous_flagged_at timestamptz,flagged_at timestamptz,changed_at timestamptz not null default now(),actor_id uuid references public.profiles(id)
);
alter table public.account_flag_history enable row level security;
create policy account_flag_history_read on public.account_flag_history for select to authenticated using(customer_id=auth.uid() or public.is_admin());
grant select on public.account_flag_history to authenticated;
grant all on public.account_flag_history to service_role;
create function public.log_account_flag_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if (tg_op='INSERT' and new.flagged_at is not null) or (tg_op='UPDATE' and old.flagged_at is distinct from new.flagged_at) then
    insert into account_flag_history(customer_id,previous_flagged_at,flagged_at,actor_id)
      values(new.customer_id,case when tg_op='UPDATE' then old.flagged_at end,new.flagged_at,auth.uid());
  end if;
  return new;
end $$;
create trigger account_flag_changed after insert or update on public.account_flags for each row execute function public.log_account_flag_change();

create table public.account_quotes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  allocations jsonb not null,
  amount numeric(10,2) not null check(amount>0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '10 minutes',
  settled_at timestamptz
);
alter table public.account_quotes enable row level security;
create policy account_quote_read on public.account_quotes for select to authenticated
  using(customer_id=auth.uid() or public.is_admin());
grant select on public.account_quotes to authenticated;

create table public.operations_queue (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  kind text not null,
  customer_id uuid references public.profiles(id),
  booking_id uuid,
  title text not null,
  details jsonb not null default '{}',
  due_at timestamptz,
  claimed_by uuid references public.profiles(id),
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.operations_queue enable row level security;
create policy operations_read on public.operations_queue for select to authenticated using(public.is_admin());
grant select on public.operations_queue to authenticated;

create function public.accept_transaction_terms(p_transaction_id uuid,p_kind text,p_version text)
returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to accept terms' using errcode='42501'; end if;
  if not exists(select 1 from transaction_terms where version=p_version and active) then raise exception 'Terms have changed. Review them again'; end if;
  insert into transaction_acceptances(customer_id,transaction_id,transaction_kind,terms_version)
    values(auth.uid(),p_transaction_id,p_kind,p_version)
    on conflict(customer_id,transaction_id,transaction_kind,terms_version) do nothing
    returning id into result;
  if result is null then select id into result from transaction_acceptances where customer_id=auth.uid() and transaction_id=p_transaction_id
    and transaction_kind=p_kind and terms_version=p_version; end if;
  return result;
end $$;

create function public.require_transaction_terms(p_transaction_id uuid,p_kind text,p_customer uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from transaction_acceptances a join transaction_terms t on t.version=a.terms_version
    where a.customer_id=p_customer and a.transaction_id=p_transaction_id and a.transaction_kind=p_kind and t.active) then
    raise exception 'Review and accept the transaction terms first' using errcode='42501';
  end if;
end $$;

create function public.reject_financial_history_mutation() returns trigger language plpgsql as $$
begin raise exception 'Financial history is append-only' using errcode='42501'; end $$;
create trigger account_events_immutable before update or delete on public.account_events
  for each row execute function public.reject_financial_history_mutation();
create trigger account_flags_history_immutable before update or delete on public.account_flag_history
  for each row execute function public.reject_financial_history_mutation();
create trigger acceptances_immutable before update or delete on public.transaction_acceptances
  for each row execute function public.reject_financial_history_mutation();

-- Lock the customer for every account operation: allocation, waiver, penalty and quote
-- cannot each independently spend or waive the same outstanding balance.
create function public.refresh_customer_account(p_customer uuid)
returns void language plpgsql security definer set search_path=public as $$
declare charge record; periods integer; period integer; flagged boolean; protected_until timestamptz;
begin
  if auth.uid() is not null and auth.uid()<>p_customer and not coalesce(public.is_admin(),false) then
    raise exception 'Account access denied' using errcode='42501';
  end if;
  perform 1 from profiles where id=p_customer for update;
  for charge in select * from account_charges where customer_id=p_customer and kind='late_return' loop
    if exists(select 1 from account_charges where (id=charge.id or parent_id=charge.id) and amount>paid+waived) then
      select max(q.expires_at) into protected_until from account_quotes q
        where q.customer_id=p_customer and q.settled_at is null and q.expires_at>now()
        and exists(select 1 from jsonb_array_elements(q.allocations) a
          join account_charges c on c.id=(a->>'charge_id')::uuid where c.id=charge.id or c.parent_id=charge.id);
      if protected_until is null then
        periods:=greatest(0,floor(extract(epoch from(now()-charge.posted_at))/86400)::int-1);
        for period in 1..periods loop
          insert into account_charges(customer_id,booking_type,booking_id,kind,parent_id,description,amount,posted_at,period_number)
            values(p_customer,charge.booking_type,charge.booking_id,'daily_penalty',charge.id,
              'Daily unpaid late-return penalty',1000,charge.posted_at+make_interval(days=>period+1),period)
            on conflict(parent_id,period_number) do nothing;
        end loop;
      end if;
    end if;
  end loop;
  select exists(select 1 from account_charges root where root.customer_id=p_customer and root.kind='late_return'
    and root.posted_at<=now()-interval '24 hours' and exists(select 1 from account_charges c
      where (c.id=root.id or c.parent_id=root.id) and c.amount>c.paid+c.waived)) into flagged;
  insert into account_flags(customer_id,flagged_at,cleared_at)
    values(p_customer,case when flagged then now() end,null)
    on conflict(customer_id) do update set
      flagged_at=case when flagged then coalesce(account_flags.flagged_at,now()) else null end,
      cleared_at=case when not flagged and account_flags.flagged_at is not null then now() else account_flags.cleared_at end;
  insert into operations_queue(source_key,kind,customer_id,title)
    select 'debt:'||p_customer,'unpaid_balance',p_customer,'Customer has unpaid charges'
    where exists(select 1 from account_charges where customer_id=p_customer and amount>paid+waived)
    on conflict(source_key) do update set closed_at=null;
  update operations_queue set closed_at=now() where source_key='debt:'||p_customer
    and not exists(select 1 from account_charges where customer_id=p_customer and amount>paid+waived);
end $$;

create function public.adjust_account_charge(p_charge uuid,p_amount numeric,p_kind public.account_event_kind,p_reason text,p_request uuid)
returns void language plpgsql security definer set search_path=public as $$
declare c account_charges; previous jsonb;
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Administrator access required' using errcode='42501'; end if;
  if p_request is null or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2)
    or length(trim(coalesce(p_reason,'')))<3 or p_kind not in ('cash','waiver') then raise exception 'Enter a valid amount and reason'; end if;
  select * into c from account_charges where id=p_charge;
  if not found then raise exception 'Charge not found'; end if;
  perform public.refresh_customer_account(c.customer_id);
  if exists(select 1 from account_events where request_id=p_request and charge_id=p_charge) then return; end if;
  select * into c from account_charges where id=p_charge for update;
  if p_amount>c.amount-c.paid-c.waived then raise exception 'Amount exceeds outstanding balance'; end if;
  previous:=to_jsonb(c);
  update account_charges set paid=paid+case when p_kind='cash' then p_amount else 0 end,
    waived=waived+case when p_kind='waiver' then p_amount else 0 end where id=p_charge returning * into c;
  insert into account_events(charge_id,customer_id,actor_id,kind,amount,reason,before_value,after_value,request_id)
    values(c.id,c.customer_id,auth.uid(),p_kind,p_amount,trim(p_reason),previous,to_jsonb(c),p_request);
  perform public.refresh_customer_account(c.customer_id);
end $$;

create function public.create_account_quote(p_charges uuid[] default null)
returns public.account_quotes language plpgsql security definer set search_path=public as $$
declare allocations jsonb; total numeric; result account_quotes;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  perform public.refresh_customer_account(auth.uid());
  select jsonb_agg(jsonb_build_object('charge_id',id,'amount',amount-paid-waived) order by posted_at,id),sum(amount-paid-waived)
    into allocations,total from account_charges where customer_id=auth.uid() and amount>paid+waived
    and (p_charges is null or id=any(p_charges));
  -- One outstanding quote avoids overlapping allocations and repeated deadline extensions.
  select * into result from account_quotes where customer_id=auth.uid() and settled_at is null
    and expires_at>now() order by created_at desc limit 1;
  if found and result.allocations=allocations then return result; end if;
  if result.id is not null then raise exception 'Finish or cancel the current quote before selecting different charges'; end if;
  if total is null or total<=0 then raise exception 'No payable charges selected'; end if;
  insert into account_quotes(customer_id,allocations,amount) values(auth.uid(),allocations,total) returning * into result;
  return result;
end $$;

-- Provider-only settlement; money is applied exactly once even on webhook replay.
create function public.settle_account_quote(p_quote uuid,p_request uuid)
returns void language plpgsql security definer set search_path=public as $$
declare q account_quotes; a jsonb; c account_charges; applied numeric; previous jsonb; unallocated numeric:=0;
begin
  select * into q from account_quotes where id=p_quote;
  if not found then raise exception 'Quote not found'; end if;
  perform 1 from profiles where id=q.customer_id for update;
  select * into q from account_quotes where id=p_quote for update;
  if q.settled_at is not null then return; end if;
  perform public.refresh_customer_account(q.customer_id);
  for a in select value from jsonb_array_elements(q.allocations) loop
    select * into c from account_charges where id=(a->>'charge_id')::uuid for update;
    applied:=least((a->>'amount')::numeric,c.amount-c.paid-c.waived);
    if applied>0 then
      previous:=to_jsonb(c);
      update account_charges set paid=paid+applied where id=c.id returning * into c;
      insert into account_events(charge_id,customer_id,kind,amount,reason,before_value,after_value,request_id)
        values(c.id,c.customer_id,'online',applied,'Confirmed online payment',previous,to_jsonb(c),p_request);
    end if;
    if applied<(a->>'amount')::numeric then
      unallocated:=unallocated+(a->>'amount')::numeric-applied;
    end if;
  end loop;
  if unallocated>0 then
    insert into operations_queue(source_key,kind,customer_id,title,details)
      values('overpayment:'||p_request,'payment_attention',q.customer_id,'Account payment needs overpayment review',
        jsonb_build_object('quote_id',q.id,'unallocated_amount',unallocated)) on conflict(source_key) do nothing;
  end if;
  -- Settle while still protected, so boundary-crossing within the quote is not charged.
  update account_quotes set settled_at=now() where id=q.id;
  perform public.refresh_customer_account(q.customer_id);
end $$;

alter table public.vehicle_bookings add column pickup_at timestamptz;
alter table public.vehicle_bookings add column return_at timestamptz;
alter table public.vehicle_bookings add column actual_return_at timestamptz;
update public.vehicle_bookings set pickup_at=(start_date+time '08:00') at time zone 'Asia/Manila',
  return_at=(end_date+time '08:00') at time zone 'Asia/Manila';
alter table public.vehicle_bookings add constraint rental_time_order check(return_at>pickup_at);

create function public.record_vehicle_return(p_booking uuid,p_returned_at timestamptz,p_reason text,p_request uuid)
returns numeric language plpgsql security definer set search_path=public as $$
declare b vehicle_bookings; fee numeric; c account_charges; before_row jsonb;
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Administrator access required' using errcode='42501'; end if;
  select * into b from vehicle_bookings where id=p_booking for update;
  if not found or b.status not in ('in_progress','completed') then raise exception 'Rental is not active or completed'; end if;
  if p_returned_at is null or p_returned_at>now() or p_returned_at<b.pickup_at or p_request is null
    or length(trim(coalesce(p_reason,'')))<3 then raise exception 'Enter a valid return time and reason'; end if;
  perform public.refresh_customer_account(b.customer_id);
  if exists(select 1 from account_events where request_id=p_request) then
    select amount into fee from account_charges where booking_id=b.id and kind='late_return'; return coalesce(fee,0);
  end if;
  fee:=greatest(0,floor(extract(epoch from(p_returned_at-b.return_at))/3600))*250;
  select * into c from account_charges where booking_id=b.id and kind='late_return' for update;
  if found then
    before_row:=to_jsonb(c);
    if fee<c.paid+c.waived then raise exception 'Adjust prior settlements before reducing this charge'; end if;
    if fee=0 then
      update account_charges set waived=amount-paid where id=c.id returning * into c;
    else update account_charges set amount=fee where id=c.id returning * into c; end if;
    insert into account_events(charge_id,customer_id,actor_id,kind,amount,reason,before_value,after_value,request_id)
      values(c.id,b.customer_id,auth.uid(),'correction',case when fee=0 then -c.amount else fee-(before_row->>'amount')::numeric end,
        p_reason,before_row,to_jsonb(c),p_request);
  elsif fee>0 then
    insert into account_charges(customer_id,booking_type,booking_id,kind,description,amount,due_at)
      values(b.customer_id,'vehicle',b.id,'late_return','Late return: PHP250 per completed hour',fee,now()+interval '24 hours') returning * into c;
    insert into account_events(charge_id,customer_id,actor_id,kind,amount,reason,before_value,after_value,request_id)
      values(c.id,b.customer_id,auth.uid(),'correction',fee,p_reason,'{}',to_jsonb(c),p_request);
  end if;
  update vehicle_bookings set actual_return_at=p_returned_at,status='completed' where id=b.id;
  perform public.refresh_customer_account(b.customer_id);
  return fee;
end $$;

create function public.guard_rental_debt() returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.refresh_customer_account(new.customer_id);
  if exists(select 1 from account_charges where customer_id=new.customer_id and blocks_rentals and amount>paid+waived) then
    raise exception 'Settle outstanding rental charges before making a new rental. Your account may be flagged if late-return charges remain unpaid.';
  end if;
  return new;
end $$;
create trigger rental_debt_guard before insert on public.vehicle_bookings for each row execute function public.guard_rental_debt();

create function public.guard_booking_terms() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null and not coalesce(public.is_admin(),false) then
    perform public.require_transaction_terms(new.request_id,
      case when tg_table_name='vehicle_bookings' then 'vehicle'
        when (to_jsonb(new)->>'is_emergency')::boolean then 'roadside' else 'service' end,new.customer_id);
  end if;
  return new;
end $$;
create trigger booking_terms_vehicle before insert on public.vehicle_bookings for each row execute function public.guard_booking_terms();
create trigger booking_terms_service before insert on public.service_bookings for each row execute function public.guard_booking_terms();

create function public.claim_operations_item(p_id uuid,p_owner uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Administrator access required' using errcode='42501'; end if;
  if p_owner is not null and not exists(select 1 from profiles where id=p_owner and role='admin') then raise exception 'Choose an admin'; end if;
  update operations_queue set claimed_by=p_owner where id=p_id and closed_at is null;
  if not found then raise exception 'Queue item unavailable'; end if;
end $$;

revoke all on function public.accept_transaction_terms(uuid,text,text),public.require_transaction_terms(uuid,text,uuid),
  public.refresh_customer_account(uuid),public.adjust_account_charge(uuid,numeric,public.account_event_kind,text,uuid),
  public.create_account_quote(uuid[]),public.settle_account_quote(uuid,uuid),
  public.record_vehicle_return(uuid,timestamptz,text,uuid),public.claim_operations_item(uuid,uuid) from public,anon,authenticated;
grant execute on function public.accept_transaction_terms(uuid,text,text),public.refresh_customer_account(uuid),
  public.adjust_account_charge(uuid,numeric,public.account_event_kind,text,uuid),public.create_account_quote(uuid[]),
  public.record_vehicle_return(uuid,timestamptz,text,uuid),public.claim_operations_item(uuid,uuid) to authenticated;
grant execute on function public.require_transaction_terms(uuid,text,uuid),public.settle_account_quote(uuid,uuid),
  public.refresh_customer_account(uuid) to service_role;
grant all on public.transaction_terms,public.transaction_acceptances,public.account_charges,public.account_events,
  public.account_flags,public.account_quotes,public.operations_queue to service_role;

alter table public.payments add column account_quote_id uuid unique references public.account_quotes(id);
alter function public.reconcile_payment(uuid,public.payment_status) rename to reconcile_booking_payment;
revoke all on function public.reconcile_booking_payment(uuid,public.payment_status) from public,anon,authenticated;
create function public.reconcile_payment(p_payment_id uuid,p_status public.payment_status)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p payments; q account_quotes;
begin
  select * into p from payments where id=p_payment_id for update;
  if not found then raise exception 'Payment record not yet available'; end if;
  if p.account_quote_id is null then
    if p.booking_type='vehicle' and p_status='succeeded' then
      update vehicle_bookings set status='cancelled' where id=p.booking_id and status='pending' and hold_expires_at<=now();
    end if;
    return public.reconcile_booking_payment(p_payment_id,p_status);
  end if;
  if p_status not in ('succeeded','failed','refunded') then raise exception 'Unsupported payment state'; end if;
  if p.status in ('succeeded','refunded') and p_status='failed' then return jsonb_build_object('status',p.status); end if;
  select * into q from account_quotes where id=p.account_quote_id;
  if q.customer_id<>p.customer_id or q.amount<>p.amount then raise exception 'Payment and quote mismatch'; end if;
  if p_status='refunded' then
    raise exception 'Account payment refunds require an audited account adjustment';
  end if;
  if p_status='succeeded' then perform public.settle_account_quote(q.id,p.id); end if;
  update payments set status=p_status where id=p.id;
  return jsonb_build_object('status',p_status,'requires_refund',false);
end $$;
revoke all on function public.reconcile_payment(uuid,public.payment_status) from public,anon,authenticated;
grant execute on function public.reconcile_payment(uuid,public.payment_status) to service_role;
