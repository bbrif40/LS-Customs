alter table public.account_events add column payment_id uuid references public.payments(id);
create unique index one_cash_service_balance on public.account_charges(booking_id) where kind='service_base';

create function public.post_cash_service_balance() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.payment_method='cash' and new.status='completed' and old.status is distinct from new.status then
    insert into account_charges(customer_id,booking_type,booking_id,kind,description,amount,blocks_rentals)
      values(new.customer_id,'service',new.id,'service_base','Completed service: cash payment due',new.total_price,false)
      on conflict(booking_id) where kind='service_base' do nothing;
  end if;
  return new;
end $$;
create trigger cash_service_balance after update of status on public.service_bookings for each row execute function public.post_cash_service_balance();
create policy assigned_mechanic_base_read on public.account_charges for select to authenticated using(kind::text='service_base'
  and exists(select 1 from service_bookings b where b.id=booking_id and b.mechanic_id=auth.uid()));

create or replace function public.record_service_cash(p_booking uuid,p_request uuid)
returns void language plpgsql security definer set search_path=public as $$
declare b service_bookings; c account_charges; previous jsonb; due numeric;
begin
  select * into b from service_bookings where id=p_booking for update;
  if not found or (b.mechanic_id is distinct from auth.uid() and not coalesce(public.is_admin(),false)) then raise exception 'Collection access denied' using errcode='42501'; end if;
  if b.payment_method<>'cash' or b.status<>'completed' then raise exception 'Cash is collected after service completion'; end if;
  perform 1 from profiles where id=b.customer_id for update;
  select * into c from account_charges where booking_id=b.id and kind::text='service_base' for update;
  if not found then raise exception 'Completed service balance is not available'; end if;
  due:=c.amount-c.paid-c.waived;
  if due<=0 or exists(select 1 from account_events where request_id=p_request) then return; end if;
  previous:=to_jsonb(c);
  insert into payments(id,booking_type,booking_id,customer_id,amount,provider,status)
    values(p_request,'service',b.id,b.customer_id,due,'cash','succeeded');
  update account_charges set paid=paid+due where id=c.id returning * into c;
  insert into account_events(charge_id,customer_id,actor_id,kind,amount,reason,before_value,after_value,request_id,payment_id)
    values(c.id,c.customer_id,auth.uid(),'cash',due,'Cash collected after service',previous,to_jsonb(c),p_request,p_request);
  update operations_queue set closed_at=now() where source_key='service_cash:'||b.id;
end $$;

create function public.resolve_service_cash_balance() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.kind::text='service_base' and new.paid+new.waived>=new.amount then update operations_queue set closed_at=now() where source_key='service_cash:'||new.booking_id; end if;
  return new;
end $$;
create trigger service_cash_balance_settled after update on public.account_charges for each row execute function public.resolve_service_cash_balance();

-- Provider payments plus cash ledger entries that have no corresponding payment
-- row. The link prevents counting a mechanic's cash collection twice.
create view public.financial_collections with (security_invoker=true) as
  select id,booking_type,booking_id,customer_id,
    case when status='succeeded' then amount-refunded_amount else amount end as amount,
    currency,provider,provider_reference,status,created_at,updated_at from public.payments
  union all
  select e.id,c.booking_type,c.booking_id,e.customer_id,e.amount,'PHP'::text,'cash_ledger'::text,null::text,
    'succeeded'::public.payment_status,e.created_at,e.created_at from public.account_events e join public.account_charges c on c.id=e.charge_id
    where e.kind='cash' and e.payment_id is null;
grant select on public.financial_collections to authenticated;
