create table public.customer_site_settings (
 id smallint primary key default 1 check (id=1),
 settings jsonb not null default '{}'::jsonb check(jsonb_typeof(settings)='object')
);
alter table public.customer_site_settings enable row level security;
grant select on public.customer_site_settings to anon, authenticated;
grant update on public.customer_site_settings to authenticated;
create policy "Public website settings" on public.customer_site_settings for select to anon,authenticated using(true);
create policy "Admins update website settings" on public.customer_site_settings for update to authenticated using(public.is_admin()) with check(public.is_admin());
insert into public.customer_site_settings(id) values(1);
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='customer_site_settings') then
 alter publication supabase_realtime add table public.customer_site_settings;
 end if;
end $$;
