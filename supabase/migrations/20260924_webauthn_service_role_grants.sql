-- The four passkey edge functions talk to these tables with the service_role
-- client (challenge store/consume, audit writes). service_role bypasses RLS
-- but still needs table GRANTs; webauthn_challenges and webauthn_audit_log
-- were missing DML grants, so every passkey request died at the challenge
-- store with "permission denied for table" (previously hidden behind the
-- broken rate-limit RPC, which 429'd first).
--
-- webauthn_credentials already grants service_role full DML; webauthn_rate_limits
-- is only touched through the SECURITY DEFINER rate-limit RPC, but granting
-- it too keeps server-side access uniform.
grant select, insert, update, delete on table
  public.webauthn_challenges,
  public.webauthn_audit_log,
  public.webauthn_rate_limits
  to service_role;
