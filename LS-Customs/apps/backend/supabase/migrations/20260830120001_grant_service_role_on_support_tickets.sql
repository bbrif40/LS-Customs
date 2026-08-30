-- Grant service_role privileges on support_tickets.
-- The 20260819120535_grants.sql migration granted ALL on tables
-- that existed at the time; support_tickets was added later
-- (20260828120000_add_support_tickets.sql) and never got the grant.
-- Edge Functions use the service_role JWT to insert tickets, so
-- without this grant they 403.
grant all on public.support_tickets to service_role;
