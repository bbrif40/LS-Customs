-- Hosted defaults can grant privileges automatically; narrow them explicitly.
revoke all on public.customer_site_settings from anon, authenticated;
grant select on public.customer_site_settings to anon, authenticated;
grant update on public.customer_site_settings to authenticated;
