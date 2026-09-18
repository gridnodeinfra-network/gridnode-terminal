-- Read-only service_role access for usage stats (approved 2026-09-18).
-- The node_key_* tables were locked down with no table grants at all, so even
-- the service-role key could not count redemptions. This restores SELECT-only
-- access for service_role (which bypasses RLS); anon/authenticated still have
-- no access and RLS stays enabled.
grant select on public.node_key_redemptions to service_role;
grant select on public.node_keys to service_role;
