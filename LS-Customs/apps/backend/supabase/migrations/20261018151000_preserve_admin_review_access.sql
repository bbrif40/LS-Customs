-- Admin mechanic review history is SECURITY INVOKER and reads metadata columns.
-- Preserve its column access while the owner/admin RLS policy scopes the rows.
grant select on table public.reviews to authenticated;
