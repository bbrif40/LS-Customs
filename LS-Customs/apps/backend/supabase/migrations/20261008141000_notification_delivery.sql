-- Admins can inspect delivery outcomes for the bookings they manage.
create policy "notifications admin select" on public.notifications
for select to authenticated using (public.is_admin());

-- Serialize trigger/manual dispatch of the same notification.
create function public.reserve_notification_dispatch(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare reserved uuid;
begin
  update public.notifications set metadata=coalesce(metadata,'{}'::jsonb)
    || jsonb_build_object('dispatch_started_at',now())
  where id=p_id and (coalesce(metadata->>'dispatched','false')<>'true' or metadata->>'simulated'='true' or metadata->>'delivery_state'='failed')
    and (metadata->>'dispatch_started_at' is null
      or (metadata->>'dispatch_started_at')::timestamptz < now()-interval '2 minutes')
  returning id into reserved;
  return reserved is not null;
end;
$$;
revoke all on function public.reserve_notification_dispatch(uuid) from public,anon,authenticated;
grant execute on function public.reserve_notification_dispatch(uuid) to service_role;

create table public.booking_confirmation_deliveries (
  booking_type text not null check (booking_type in ('vehicle','service')),
  booking_id uuid not null,
  attempted_at timestamptz not null default now(),
  primary key (booking_type,booking_id)
);
alter table public.booking_confirmation_deliveries enable row level security;
revoke all on public.booking_confirmation_deliveries from public,anon,authenticated;
grant all on public.booking_confirmation_deliveries to service_role;
create function public.reserve_booking_confirmation(p_type text,p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare reserved uuid;
begin
  insert into public.booking_confirmation_deliveries(booking_type,booking_id) values(p_type,p_id)
  on conflict(booking_type,booking_id) do update set attempted_at=now()
    where booking_confirmation_deliveries.attempted_at < now()-interval '1 minute'
  returning booking_id into reserved;
  return reserved is not null;
end;
$$;
revoke all on function public.reserve_booking_confirmation(text,uuid) from public,anon,authenticated;
grant execute on function public.reserve_booking_confirmation(text,uuid) to service_role;

-- Customers may mark their notification read, never rewrite server-authored
-- recipients, message content or dispatch metadata and then trigger an SMS.
create function public.guard_notification_read_update()
returns trigger language plpgsql set search_path=public as $$
begin
  if current_user in ('postgres','supabase_admin','service_role') or coalesce(public.is_admin(),false) then return new; end if;
  if (to_jsonb(new)-'is_read') is distinct from (to_jsonb(old)-'is_read') then
    raise exception 'Only notification read state may be changed' using errcode='42501';
  end if;
  return new;
end;
$$;
create trigger guard_notification_read_update before update on public.notifications
for each row execute function public.guard_notification_read_update();
