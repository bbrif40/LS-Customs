-- =============================================================================
-- LS Customs — Phase 1 Migration 6: Standard Supabase Grants
-- =============================================================================
-- Grants table-level, sequence, and function privileges to the anon and
-- authenticated roles. These are the default grants that the Supabase CLI
-- normally applies during project init but are included here for explicitness.
--
-- RLS policies (in Migration 3) provide the row-level filtering — these grants
-- only establish the table-level privilege that makes RLS evaluation possible.
-- =============================================================================

-- Schema usage: both anon and authenticated can see the public schema.
grant usage on schema public to anon, authenticated, service_role;

-- anon (unauthenticated): SELECT only — RLS filters rows per policy.
grant select on all tables in schema public to anon;

-- authenticated: full CRUD — RLS filters rows per policy.
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Sequences: authenticated needs nextval/setval for default UUIDs, etc.
grant usage, select on all sequences in schema public to anon, authenticated;

-- Functions: authenticated can call SECURITY DEFINER helper functions
-- (current_role, is_admin, is_mechanic, get_public_mechanics).
grant execute on all functions in schema public to anon, authenticated;

-- -----------------------------------------------------------------------------
-- service_role: Edge Functions use this for privileged operations. Grant ALL
-- on tables/sequences/functions so createServiceClient() can read/write any
-- row. This was originally missing — added in 20260819120545_service_role_grants.sql
-- and consolidated here since no migrations were ever pushed to a remote project.
-- -----------------------------------------------------------------------------
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;
