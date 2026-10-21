create type public.booking_report_kind as enum ('handover','return','service');
create table public.booking_reports (
  id uuid primary key,
  version bigint generated always as identity,
  booking_type public.booking_type not null,
  booking_id uuid not null,
  customer_id uuid not null references public.profiles(id),
  kind public.booking_report_kind not null,
  notes text not null,
  parts_used text,
  photos text[] not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.booking_reports enable row level security;
create policy booking_report_read on public.booking_reports for select to authenticated using(customer_id=auth.uid() or public.is_admin()
  or (booking_type='service' and exists(select 1 from service_bookings b where b.id=booking_id and b.mechanic_id=auth.uid())));
grant select on public.booking_reports to authenticated;
grant all on public.booking_reports to service_role;

create table public.report_acknowledgements (
  report_id uuid primary key references public.booking_reports(id),
  customer_id uuid not null references public.profiles(id),
  accepted_at timestamptz not null default now()
);
alter table public.report_acknowledgements enable row level security;
create policy report_acknowledgement_read on public.report_acknowledgements for select to authenticated using(customer_id=auth.uid() or public.is_admin());
grant select on public.report_acknowledgements to authenticated;
grant all on public.report_acknowledgements to service_role;
alter table public.account_charges add column source_request uuid unique references public.booking_requests(id);

create function public.check_booking_evidence(p_type public.booking_type,p_booking uuid,p_paths text[])
returns void language plpgsql security definer set search_path=public as $$
declare path text;
begin
  if cardinality(p_paths) is null or cardinality(p_paths)<1 or cardinality(p_paths)>20 then raise exception 'Attach 1 to 20 evidence photos'; end if;
  foreach path in array p_paths loop
    if path not like p_type::text||'/'||p_booking::text||'/%'
      or not exists(select 1 from storage.objects where bucket_id='booking-evidence' and name=path) then raise exception 'Invalid booking evidence'; end if;
  end loop;
end $$;
revoke all on function public.check_booking_evidence(public.booking_type,uuid,text[]) from public,anon,authenticated;

create function public.create_booking_report(p_id uuid,p_type public.booking_type,p_booking uuid,p_kind public.booking_report_kind,p_notes text,p_parts text,p_photos text[])
returns uuid language plpgsql security definer set search_path=public as $$
declare owner uuid; assigned uuid;
begin
  if p_type='vehicle' then select customer_id into owner from vehicle_bookings where id=p_booking;
  else select customer_id,mechanic_id into owner,assigned from service_bookings where id=p_booking; end if;
  if owner is null or not(coalesce(public.is_admin(),false) or (p_type='service' and assigned=auth.uid() and p_kind='service')) then
    raise exception 'Report access denied' using errcode='42501'; end if;
  if (p_type='vehicle' and p_kind='service') or (p_type='service' and p_kind<>'service') or p_id is null
    or length(trim(coalesce(p_notes,'')))<3 or length(p_notes)>10000 or length(coalesce(p_parts,''))>5000 then raise exception 'Enter a valid report'; end if;
  perform public.check_booking_evidence(p_type,p_booking,p_photos);
  if exists(select 1 from booking_reports where id=p_id and booking_id=p_booking and created_by=auth.uid()) then return p_id; end if;
  insert into booking_reports(id,booking_type,booking_id,customer_id,kind,notes,parts_used,photos,created_by)
    values(p_id,p_type,p_booking,owner,p_kind,p_notes,p_parts,p_photos,auth.uid());
  if p_type='service' then
    perform public.notify_workflow(owner,'Service completion report available','Review the work performed, parts used, photos and your final bill in the booking. Payment status is shown separately.',p_booking,'service');
  end if;
  return p_id;
end $$;

create function public.acknowledge_handover_report(p_report uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r booking_reports;
begin
  select * into r from booking_reports where id=p_report and customer_id=auth.uid() and kind='handover';
  if not found then raise exception 'Report access denied' using errcode='42501'; end if;
  if r.id is distinct from(select id from booking_reports where booking_id=r.booking_id and kind='handover' order by version desc limit 1) then raise exception 'A newer report needs review'; end if;
  insert into report_acknowledgements(report_id,customer_id) values(r.id,auth.uid()) on conflict(report_id) do nothing;
end $$;

create or replace function public.guard_rental_checkout() returns trigger language plpgsql security definer set search_path=public as $$
declare latest uuid;
begin
  if new.checkout_state='legacy' then return new; end if;
  if new.status='in_progress' and old.status is distinct from new.status then
    if new.checkout_state<>'paid' or not exists(select 1 from driver_licenses l join profiles p on p.id=l.customer_id
      where l.id=new.license_id and l.state='approved' and l.identity_name=p.full_name and l.expires_on>=(new.return_at at time zone 'Asia/Manila')::date) then
      raise exception 'Verified license and collected payment are required before handover'; end if;
    select id into latest from booking_reports where booking_id=new.id and kind='handover' order by version desc limit 1;
    if latest is null or not exists(select 1 from report_acknowledgements where report_id=latest) then raise exception 'Customer must acknowledge the latest handover report'; end if;
  end if;
  if new.status='completed' and old.status is distinct from new.status then
    if new.actual_return_at is null or not exists(select 1 from booking_reports where booking_id=new.id and kind='return') then
      raise exception 'Record the return condition report and actual return time before completing the rental'; end if;
  end if;
  return new;
end $$;

create function public.propose_booking_charge(p_type public.booking_type,p_booking uuid,p_kind public.booking_request_kind,p_items jsonb,p_photos text[],p_notes text)
returns uuid language plpgsql security definer set search_path=public as $$
declare owner uuid; assigned uuid; state booking_status; result uuid; total numeric; item jsonb;
begin
  if p_type='vehicle' then select customer_id,status into owner,state from vehicle_bookings where id=p_booking for update;
  else select customer_id,mechanic_id,status into owner,assigned,state from service_bookings where id=p_booking for update; end if;
  if owner is null or not(coalesce(public.is_admin(),false) or (p_type='service' and assigned=auth.uid() and p_kind='service_extra')) then
    raise exception 'Quote access denied' using errcode='42501'; end if;
  if (p_kind='damage' and p_type<>'vehicle') or (p_kind='service_extra' and p_type<>'service')
    or p_kind not in ('damage','service_extra') or length(trim(coalesce(p_notes,'')))<3 then raise exception 'Enter a valid quote'; end if;
  if p_kind='service_extra' and state not in ('assigned','en_route','in_progress') then raise exception 'Service is not active'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>50 then raise exception 'Add itemized repair costs'; end if;
  total:=0;
  for item in select value from jsonb_array_elements(p_items) loop
    if length(trim(coalesce(item->>'description','')))<2 or coalesce((item->>'amount')::numeric,0)<=0
      or (item->>'amount')::numeric<>round((item->>'amount')::numeric,2) then raise exception 'Each item needs a description and positive cost'; end if;
    total:=total+(item->>'amount')::numeric;
  end loop;
  perform public.check_booking_evidence(p_type,p_booking,p_photos);
  if p_kind='damage' and (not exists(select 1 from booking_reports where booking_id=p_booking and kind='handover')
    or not exists(select 1 from booking_reports where booking_id=p_booking and kind='return')) then raise exception 'Handover and return evidence required'; end if;
  insert into booking_requests(customer_id,booking_type,booking_id,kind,amount,payload,reason,created_by,response_deadline)
    values(owner,p_type,p_booking,p_kind,total,jsonb_build_object('items',p_items,'photos',p_photos),p_notes,auth.uid(),
      case when p_kind='damage' then now()+interval '48 hours' end) returning id into result;
  perform public.notify_workflow(owner,case when p_kind='damage' then 'Proposed damage charge' else 'Additional work quote' end,
    p_notes||'. Proposed amount: PHP '||total::text||case when p_kind='damage' then '. You have 48 hours from this in-app notification to dispute it.' else '. No extra work or charge is authorized until you approve.' end,p_booking,p_type::text);
  if p_kind='damage' then
    insert into operations_queue(source_key,kind,customer_id,booking_id,title,due_at,details)
      values('damage:'||result,'damage_review',owner,p_booking,'Damage proposal awaiting customer response',now()+interval '48 hours',jsonb_build_object('request_id',result));
  end if;
  return result;
end $$;

create function public.respond_booking_quote(p_request uuid,p_accept boolean,p_reason text default null,p_evidence text[] default '{}')
returns void language plpgsql security definer set search_path=public as $$
declare r booking_requests;
begin
  select * into r from booking_requests where id=p_request and customer_id=auth.uid() for update;
  if not found or r.kind not in ('damage','service_extra') then raise exception 'Quote access denied' using errcode='42501'; end if;
  if r.state<>'pending' then raise exception 'Quote already has a response'; end if;
  if r.kind='damage' and r.response_deadline<=now() then raise exception 'Dispute response window ended; contact support'; end if;
  if p_accept then perform public.require_transaction_terms(r.id,'payment',auth.uid()); end if;
  if r.kind='service_extra' and p_accept and not exists(select 1 from service_bookings where id=r.booking_id and status in ('assigned','en_route','in_progress')) then
    raise exception 'Additional work can only be approved while the service is active'; end if;
  if not p_accept and length(trim(coalesce(p_reason,'')))<3 then raise exception 'Enter your reason'; end if;
  if cardinality(p_evidence)>0 then perform public.check_booking_evidence(r.booking_type,r.booking_id,p_evidence); end if;
  update booking_requests set state=case when p_accept then 'approved'::booking_request_state when r.kind='damage' then 'disputed'::booking_request_state else 'declined'::booking_request_state end,
    payload=payload||jsonb_build_object('customer_response_at',now(),'customer_reason',p_reason,'customer_evidence',p_evidence) where id=r.id;
  if r.kind='service_extra' and p_accept then
    insert into account_charges(customer_id,booking_type,booking_id,kind,description,amount,blocks_rentals,source_request)
      values(r.customer_id,'service',r.booking_id,'service_extra','Approved additional work and parts',r.amount,false,r.id) on conflict(source_request) do nothing;
  elsif r.kind='damage' and not p_accept then
    update operations_queue set title='Customer disputed damage proposal',due_at=null,details=details||jsonb_build_object('disputed',true) where source_key='damage:'||r.id;
  end if;
end $$;

create function public.finalize_damage_charge(p_request uuid,p_approve boolean,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare r booking_requests;
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Administrator access required' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Enter the review reason'; end if;
  select * into r from booking_requests where id=p_request and kind='damage' for update;
  if not found then raise exception 'Damage proposal not found'; end if;
  if r.state in ('finalized','declined') then return; end if;
  if r.state='pending' and r.response_deadline>now() then raise exception 'Customer response window is still open'; end if;
  if p_approve then
    insert into account_charges(customer_id,booking_type,booking_id,kind,description,amount,source_request)
      values(r.customer_id,'vehicle',r.booking_id,'damage','Finalized damage repair estimate',r.amount,r.id) on conflict(source_request) do nothing;
  end if;
  update booking_requests set state=case when p_approve then 'finalized'::booking_request_state else 'declined'::booking_request_state end,
    reviewed_at=now(),reviewed_by=auth.uid(),review_reason=p_reason where id=r.id;
  update operations_queue set closed_at=now() where source_key='damage:'||r.id;
  insert into admin_audit_logs(admin_id,action_type,record_type,record_id,details)
    values(auth.uid(),'damage_review','vehicle_booking',r.booking_id::text,jsonb_build_object('before',to_jsonb(r),'approved',p_approve,'amount',r.amount,'reason',p_reason));
  perform public.notify_workflow(r.customer_id,'Damage review completed',p_reason||case when p_approve then '. Finalized amount due: PHP '||r.amount::text else '. No damage charge posted.' end,r.booking_id,'vehicle');
end $$;

create function public.guard_service_completion_report() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.checkout_state<>'legacy' and new.status='completed' and old.status is distinct from new.status
    and not exists(select 1 from booking_reports where booking_id=new.id and kind='service') then raise exception 'Save the service completion report before marking work complete'; end if;
  return new;
end $$;
create trigger service_completion_report before update on public.service_bookings for each row execute function public.guard_service_completion_report();

revoke all on function public.create_booking_report(uuid,public.booking_type,uuid,public.booking_report_kind,text,text,text[]),public.acknowledge_handover_report(uuid),
  public.propose_booking_charge(public.booking_type,uuid,public.booking_request_kind,jsonb,text[],text),
  public.respond_booking_quote(uuid,boolean,text,text[]),public.finalize_damage_charge(uuid,boolean,text) from public,anon;
grant execute on function public.create_booking_report(uuid,public.booking_type,uuid,public.booking_report_kind,text,text,text[]),public.acknowledge_handover_report(uuid),
  public.propose_booking_charge(public.booking_type,uuid,public.booking_request_kind,jsonb,text[],text),
  public.respond_booking_quote(uuid,boolean,text,text[]),public.finalize_damage_charge(uuid,boolean,text) to authenticated;

create policy assigned_mechanic_extra_read on public.account_charges for select to authenticated using(kind='service_extra'
  and exists(select 1 from service_bookings b where b.id=booking_id and b.mechanic_id=auth.uid()));
create function public.collect_service_extra_cash(p_charge uuid,p_request uuid) returns void language plpgsql security definer set search_path=public as $$
declare c account_charges; previous jsonb; total numeric;
begin
  select * into c from account_charges where id=p_charge;
  if not found or c.kind<>'service_extra' or not exists(select 1 from service_bookings b where b.id=c.booking_id
    and b.status='completed' and (b.mechanic_id=auth.uid() or coalesce(public.is_admin(),false))) then raise exception 'Cash collection access denied' using errcode='42501'; end if;
  perform 1 from profiles where id=c.customer_id for update;
  if exists(select 1 from account_events where request_id=p_request and charge_id=p_charge) then return; end if;
  select * into c from account_charges where id=p_charge for update;
  total:=c.amount-c.paid-c.waived;
  if total<=0 then return; end if;
  previous:=to_jsonb(c);
  update account_charges set paid=paid+total where id=c.id returning * into c;
  insert into account_events(charge_id,customer_id,actor_id,kind,amount,reason,before_value,after_value,request_id)
    values(c.id,c.customer_id,auth.uid(),'cash',total,'Cash collected for approved extras after service',previous,to_jsonb(c),p_request);
end $$;
revoke all on function public.collect_service_extra_cash(uuid,uuid) from public,anon;
grant execute on function public.collect_service_extra_cash(uuid,uuid) to authenticated;
