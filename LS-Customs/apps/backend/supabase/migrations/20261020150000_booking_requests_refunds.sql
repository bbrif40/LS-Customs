create type public.booking_request_kind as enum ('cancellation','reschedule','extension','location_change','service_extra','damage');
alter table public.notifications add column workflow_email_delivered_at timestamptz;
alter table public.notifications add column workflow_email_attempts integer not null default 0;
alter table public.notifications add column workflow_email_retry_at timestamptz not null default now();
create type public.booking_request_state as enum ('pending','approved','declined','disputed','finalized');
create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  booking_type public.booking_type not null,
  booking_id uuid not null,
  kind public.booking_request_kind not null,
  state public.booking_request_state not null default 'pending',
  amount numeric(10,2) not null default 0 check(amount>=0),
  payload jsonb not null default '{}',
  reason text not null,
  created_by uuid not null references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  review_reason text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  response_deadline timestamptz
);
alter table public.booking_requests enable row level security;
create policy booking_request_read on public.booking_requests for select to authenticated using(customer_id=auth.uid() or public.is_admin()
  or (booking_type='service' and exists(select 1 from service_bookings b where b.id=booking_id and b.mechanic_id=auth.uid())));
grant select on public.booking_requests to authenticated;
grant all on public.booking_requests to service_role;
create unique index one_pending_cancellation on public.booking_requests(booking_type,booking_id) where kind='cancellation' and state='pending';

alter table public.payments add column refunded_amount numeric(10,2) not null default 0 check(refunded_amount>=0 and refunded_amount<=amount);
create type public.workflow_refund_state as enum ('pending','processing','succeeded','failed');
create table public.workflow_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id),
  request_id uuid references public.booking_requests(id),
  customer_id uuid not null references public.profiles(id),
  amount numeric(10,2) not null check(amount>0),
  state public.workflow_refund_state not null default 'pending',
  provider_reference text,
  claimed_at timestamptz,
  first_attempt_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique(payment_id,request_id)
);
alter table public.workflow_refunds enable row level security;
create policy workflow_refund_read on public.workflow_refunds for select to authenticated using(customer_id=auth.uid() or public.is_admin());
grant select on public.workflow_refunds to authenticated;
grant all on public.workflow_refunds to service_role;

create function public.request_booking_cancellation(p_type public.booking_type,p_booking uuid,p_reason text)
returns public.booking_requests language plpgsql security definer set search_path=public as $$
declare owner uuid; status booking_status; method text; paid numeric; percent integer; req booking_requests; is_cash boolean;
begin
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Enter a cancellation reason'; end if;
  if p_type='vehicle' then
    select customer_id,b.status,payment_method into owner,status,method from vehicle_bookings b where id=p_booking for update;
  else select customer_id,b.status,payment_method into owner,status,method from service_bookings b where id=p_booking for update; end if;
  if owner is distinct from auth.uid() or owner is null then raise exception 'Booking access denied' using errcode='42501'; end if;
  if status in ('cancelled','completed') then raise exception 'Booking is no longer cancellable'; end if;
  if p_type='vehicle' and method='cash' and status<>'pending' then raise exception 'Confirmed cash rentals cannot be cancelled by customers. Contact support'; end if;
  select * into req from booking_requests where booking_type=p_type and booking_id=p_booking and kind='cancellation' and state='pending';
  if found then return req; end if;
  select coalesce(sum(amount-refunded_amount),0) into paid from payments where booking_type=p_type and booking_id=p_booking and account_quote_id is null and payments.status='succeeded';
  percent:=case when p_type='service' and status='en_route' then 45 when status='in_progress' then 0 else 100 end;
  is_cash:=method='cash' and paid=0 and p_type='service' and status<>'in_progress';
  insert into booking_requests(customer_id,booking_type,booking_id,kind,amount,payload,reason,created_by,state)
    values(owner,p_type,p_booking,'cancellation',round(paid*percent/100,2),
      jsonb_build_object('refund_percentage',percent,'amount_paid',paid,'status_at_request',status,'support_review',status='in_progress','cash',method='cash'),
      p_reason,auth.uid(),case when is_cash then 'approved'::booking_request_state else 'pending'::booking_request_state end) returning * into req;
  if is_cash then
    update service_bookings set status='cancelled' where id=p_booking;
    if (select count(*) from booking_requests r where r.customer_id=owner and r.kind='cancellation'
      and r.booking_type='service' and r.payload->>'cash'='true' and r.created_at>=now()-interval '30 days')>=3 then
      insert into operations_queue(source_key,kind,customer_id,title)
        values('cash_cancellations:'||owner,'cancellation_review',owner,'Three cash mechanic cancellations in 30 days') on conflict(source_key) do update set closed_at=null;
    end if;
  else
    insert into operations_queue(source_key,kind,customer_id,booking_id,title,details)
      values('cancellation:'||req.id,'cancellation_review',owner,p_booking,'Cancellation requested',jsonb_build_object('request_id',req.id));
  end if;
  perform public.notify_workflow(owner,case when is_cash then 'Cash service cancelled' else 'Cancellation requested' end,
    case when is_cash then 'Cancelled without a fee before service.' else 'Your appointment remains active until admin approval. Proposed refund: PHP '||req.amount::text end,p_booking,p_type::text);
  return req;
end $$;

create function public.review_booking_cancellation(p_request uuid,p_approve boolean,p_reason text,p_refund_amount numeric default null)
returns void language plpgsql security definer set search_path=public as $$
declare r booking_requests; p payments; remaining numeric; current_status booking_status; limit_amount numeric;
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Administrator access required' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Enter a review reason'; end if;
  select * into r from booking_requests where id=p_request and kind='cancellation' for update;
  if not found then raise exception 'Cancellation not found'; end if;
  if r.state<>'pending' then return; end if;
  if r.booking_type='service' then select status into current_status from service_bookings where id=r.booking_id for update;
  else select status into current_status from vehicle_bookings where id=r.booking_id for update; end if;
  select coalesce(sum(pmt.amount-pmt.refunded_amount-coalesce((select sum(f.amount) from workflow_refunds f where f.payment_id=pmt.id and f.state<>'succeeded'),0)),0)
    into limit_amount from payments pmt where pmt.booking_type=r.booking_type and pmt.booking_id=r.booking_id and pmt.account_quote_id is null and pmt.status='succeeded';
  if p_approve and current_status in ('in_progress','completed') and p_refund_amount is null then
    raise exception 'Work or handover has started; support review must specify the approved refund amount';
  end if;
  remaining:=coalesce(p_refund_amount,r.amount);
  if remaining<0 or remaining>limit_amount or remaining<>round(remaining,2) then raise exception 'Refund exceeds collected amount'; end if;
  update booking_requests set state=case when p_approve then 'approved'::booking_request_state else 'declined'::booking_request_state end,
    amount=case when p_approve then remaining else amount end,reviewed_by=auth.uid(),reviewed_at=now(),review_reason=p_reason where id=r.id;
  if p_approve then
    if r.booking_type='service' then update service_bookings set status='cancelled' where id=r.booking_id;
    elsif current_status not in ('in_progress','completed') then update vehicle_bookings set status='cancelled' where id=r.booking_id; end if;
    for p in select * from payments where booking_type=r.booking_type and booking_id=r.booking_id and account_quote_id is null and status='succeeded' order by created_at for update loop
      if remaining<=0 then exit; end if;
      declare available numeric:=p.amount-p.refunded_amount-coalesce((select sum(amount) from workflow_refunds where payment_id=p.id and state<>'succeeded'),0);
      begin
        if available>0 then
          insert into workflow_refunds(payment_id,request_id,customer_id,amount)
            values(p.id,r.id,r.customer_id,least(remaining,available)) on conflict(payment_id,request_id) do nothing;
          remaining:=remaining-least(remaining,available);
        end if;
      end;
    end loop;
  end if;
  update operations_queue set closed_at=now() where source_key='cancellation:'||r.id;
  insert into admin_audit_logs(admin_id,action_type,record_type,record_id,details)
    values(auth.uid(),'cancellation_review',r.booking_type::text||'_booking',r.booking_id::text,
      jsonb_build_object('request_id',r.id,'before',to_jsonb(r),'approved',p_approve,'refund_amount',coalesce(p_refund_amount,r.amount),'reason',p_reason));
  perform public.notify_workflow(r.customer_id,case when p_approve then 'Cancellation approved' else 'Cancellation declined' end,
    p_reason||case when p_approve then '. Refund pending: PHP '||coalesce(p_refund_amount,r.amount)::text
      ||case when r.booking_type='vehicle' and current_status='in_progress' then '. Rental remains active until the vehicle is returned.' else '' end
      else '. Your booking remains active.' end,r.booking_id,r.booking_type::text);
end $$;

create function public.claim_workflow_refund(p_id uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare result uuid;
begin
  update workflow_refunds set claimed_at=now(),first_attempt_at=coalesce(first_attempt_at,now()) where id=p_id and state in ('pending','processing')
    and (claimed_at is null or claimed_at<now()-interval '2 minutes') returning id into result;
  return result is not null;
end $$;

create function public.settle_workflow_refund(p_id uuid,p_reference text,p_state public.workflow_refund_state,p_failure text default null)
returns void language plpgsql security definer set search_path=public as $$
declare r workflow_refunds; p payments;
begin
  select * into r from workflow_refunds where id=p_id for update;
  if not found then raise exception 'Refund not found'; end if;
  if r.state='succeeded' then return; end if;
  if p_state='succeeded' and coalesce(p_reference,'')='' then raise exception 'Provider refund reference required'; end if;
  update workflow_refunds set state=p_state,provider_reference=coalesce(p_reference,provider_reference),failure_reason=p_failure,
    settled_at=case when p_state='succeeded' then now() end where id=r.id;
  if p_state='succeeded' then
    select * into p from payments where id=r.payment_id for update;
    if p.refunded_amount+r.amount>p.amount then raise exception 'Refund exceeds payment'; end if;
    update payments set refunded_amount=refunded_amount+r.amount,
      status=case when refunded_amount+r.amount=amount then 'refunded'::payment_status else status end where id=p.id;
    update operations_queue set closed_at=now() where source_key='refund:'||p.id or source_key='refund_failed:'||r.id;
    perform public.notify_workflow(r.customer_id,'Refund confirmed','Refund of PHP '||r.amount::text||' was confirmed by the payment provider.',p.booking_id,p.booking_type::text);
  elsif p_state='failed' then
    insert into operations_queue(source_key,kind,customer_id,title,details)
      values('refund_failed:'||r.id,'refund_failed',r.customer_id,'Refund failed: admin action required',jsonb_build_object('refund_id',r.id,'reason',p_failure))
      on conflict(source_key) do update set closed_at=null,details=excluded.details;
  end if;
end $$;

-- Convert automatic expiry refund work into durable provider operations.
create function public.queue_expiry_refund() returns trigger language plpgsql security definer set search_path=public as $$
declare p payments;
begin
  if new.kind='refund_required' then
    select * into p from payments where id=(new.details->>'payment_id')::uuid;
    if p.id is not null and p.account_quote_id is null and not exists(select 1 from workflow_refunds where payment_id=p.id) then
      insert into workflow_refunds(payment_id,customer_id,amount) values(p.id,p.customer_id,p.amount-p.refunded_amount);
    end if;
  end if;
  return new;
end $$;
create trigger expiry_refund_queued after insert on public.operations_queue for each row execute function public.queue_expiry_refund();

revoke all on function public.request_booking_cancellation(public.booking_type,uuid,text),public.review_booking_cancellation(uuid,boolean,text,numeric),
  public.claim_workflow_refund(uuid),public.settle_workflow_refund(uuid,text,public.workflow_refund_state,text) from public,anon,authenticated;
grant execute on function public.request_booking_cancellation(public.booking_type,uuid,text),public.review_booking_cancellation(uuid,boolean,text,numeric) to authenticated;
grant execute on function public.claim_workflow_refund(uuid),public.settle_workflow_refund(uuid,text,public.workflow_refund_state,text) to service_role;

create function public.cancellation_quote(p_type public.booking_type,p_booking uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare owner uuid; state booking_status; method text; paid numeric; percent integer;
begin
  if p_type='vehicle' then select customer_id,status,payment_method into owner,state,method from vehicle_bookings where id=p_booking;
  else select customer_id,status,payment_method into owner,state,method from service_bookings where id=p_booking; end if;
  if owner is distinct from auth.uid() or owner is null then raise exception 'Booking access denied' using errcode='42501'; end if;
  select coalesce(sum(amount-refunded_amount),0) into paid from payments where booking_type=p_type and booking_id=p_booking and account_quote_id is null and status='succeeded';
  percent:=case when p_type='service' and state='en_route' then 45 when state='in_progress' then 0 else 100 end;
  return jsonb_build_object('allowed',not(p_type='vehicle' and method='cash' and state<>'pending') and state not in ('cancelled','completed'),
    'refund_amount',round(paid*percent/100,2),'refund_percentage',percent,'support_review',state='in_progress','cash',method='cash');
end $$;
revoke all on function public.cancellation_quote(public.booking_type,uuid) from public,anon;
grant execute on function public.cancellation_quote(public.booking_type,uuid) to authenticated;

-- Refund lifecycle events are reconciled by their durable refund operation. A
-- partial refund webhook must not turn the entire payment into a full refund.
alter function public.reconcile_payment(uuid,public.payment_status) rename to reconcile_transaction_payment;
revoke all on function public.reconcile_transaction_payment(uuid,public.payment_status) from public,anon,authenticated;
create function public.reconcile_payment(p_payment_id uuid,p_status public.payment_status)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if p_status='refunded' and exists(select 1 from workflow_refunds where payment_id=p_payment_id) then
    return jsonb_build_object('status','refund_processing','requires_refund',false);
  end if;
  return public.reconcile_transaction_payment(p_payment_id,p_status);
end $$;
revoke all on function public.reconcile_payment(uuid,public.payment_status) from public,anon,authenticated;
grant execute on function public.reconcile_payment(uuid,public.payment_status) to service_role;

create function public.queue_admin_refund(p_payment uuid,p_reason text)
returns public.workflow_refunds language plpgsql security definer set search_path=public as $$
declare p payments; result workflow_refunds;
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Administrator access required' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Enter a refund reason'; end if;
  select * into p from payments where id=p_payment for update;
  if not found or p.status<>'succeeded' or p.account_quote_id is not null then raise exception 'This payment requires account-adjustment review or is not refundable'; end if;
  select * into result from workflow_refunds where payment_id=p.id and state<>'succeeded' order by created_at limit 1;
  if found then return result; end if;
  if p.amount<=p.refunded_amount then raise exception 'Payment already refunded'; end if;
  insert into workflow_refunds(payment_id,customer_id,amount) values(p.id,p.customer_id,p.amount-p.refunded_amount) returning * into result;
  insert into admin_audit_logs(admin_id,action_type,record_type,record_id,details)
    values(auth.uid(),'refund_requested','payment',p.id::text,jsonb_build_object('before',to_jsonb(p),'refund_id',result.id,'amount',result.amount,'reason',p_reason));
  return result;
end $$;
revoke all on function public.queue_admin_refund(uuid,text) from public,anon;
grant execute on function public.queue_admin_refund(uuid,text) to authenticated;
