alter table public.support_tickets add column booking_type public.booking_type;
alter table public.support_tickets add column booking_id uuid;
alter table public.support_tickets add column parent_ticket_id uuid references public.support_tickets(id);
alter table public.support_tickets add column booking_context jsonb;
alter table public.support_tickets add constraint linked_booking_pair check((booking_type is null)=(booking_id is null));

create function public.create_booking_support(p_type public.booking_type,p_booking uuid,p_description text,p_parent uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare owner uuid; context jsonb; history jsonb; result uuid:=gen_random_uuid();
begin
  if p_type='vehicle' then select customer_id,jsonb_build_object('status',status,'total_price',total_price,'pickup_at',pickup_at,'return_at',return_at)
    into owner,context from vehicle_bookings where id=p_booking;
  else select customer_id,jsonb_build_object('status',status,'total_price',total_price,'scheduled_at',scheduled_at)
    into owner,context from service_bookings where id=p_booking; end if;
  if owner is distinct from auth.uid() or owner is null then raise exception 'Booking access denied' using errcode='42501'; end if;
  if length(trim(coalesce(p_description,'')))<5 or length(p_description)>4000 then raise exception 'Describe the issue in 5 to 4000 characters'; end if;
  if p_parent is not null and not exists(select 1 from support_tickets where id=p_parent and customer_id=owner
    and booking_type=p_type and booking_id=p_booking) then raise exception 'Related ticket access denied' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('payment_id',id,'amount',amount,'status',status,'refunded_amount',refunded_amount,'created_at',created_at)),'[]')
    into history from payments where booking_type=p_type and booking_id=p_booking and customer_id=owner;
  insert into support_tickets(id,customer_id,subject,description,booking_type,booking_id,parent_ticket_id,booking_context,tracking_number)
    values(result,owner,'Booking support · '||left(p_booking::text,8),p_description,p_type,p_booking,p_parent,context||jsonb_build_object('payments',history),
      'TKT-'||to_char(now(),'YYYYMMDD')||'-'||upper(left(replace(result::text,'-',''),8)));
  insert into operations_queue(source_key,kind,customer_id,booking_id,title,details)
    values('ticket:'||result,'support_ticket',owner,p_booking,'Booking support request',jsonb_build_object('ticket_id',result));
  return result;
end $$;

create function public.reopen_customer_ticket(p_ticket uuid)
returns void language plpgsql security definer set search_path=public as $$
declare ticket support_tickets;
begin
  select * into ticket from support_tickets where id=p_ticket and customer_id=auth.uid() for update;
  if not found then raise exception 'Ticket access denied' using errcode='42501'; end if;
  if ticket.status not in ('resolved','closed') or coalesce(ticket.resolved_at,ticket.closed_at) is null
    or coalesce(ticket.resolved_at,ticket.closed_at)<now()-interval '7 days' then raise exception 'Reopening window ended. Create a new linked ticket'; end if;
  update support_tickets set status='open',resolved_at=null,closed_at=null where id=ticket.id;
  insert into operations_queue(source_key,kind,customer_id,booking_id,title,details)
    values('ticket:'||ticket.id,'support_ticket',ticket.customer_id,ticket.booking_id,'Customer reopened support ticket',jsonb_build_object('ticket_id',ticket.id))
    on conflict(source_key) do update set closed_at=null,title=excluded.title;
end $$;

create function public.guard_ticket_workflow() returns trigger language plpgsql set search_path=public as $$
begin
  if current_user in ('postgres','supabase_admin','service_role') or coalesce(public.is_admin(),false) then
    if new.status='resolved' and old.status is distinct from new.status then new.resolved_at:=now(); end if;
    if new.status='closed' and old.status is distinct from new.status then new.closed_at:=now(); end if;
    return new;
  end if;
  raise exception 'Use the ticket reopening action to update a resolved ticket' using errcode='42501';
end $$;
create trigger ticket_workflow_guard before update on public.support_tickets for each row execute function public.guard_ticket_workflow();
revoke all on function public.create_booking_support(public.booking_type,uuid,text,uuid),public.reopen_customer_ticket(uuid) from public,anon;
grant execute on function public.create_booking_support(public.booking_type,uuid,text,uuid),public.reopen_customer_ticket(uuid) to authenticated;
