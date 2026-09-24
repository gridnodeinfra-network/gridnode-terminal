-- Fix the ambiguous-column bug in webauthn_rate_limit_check (present since
-- 20260802170000_webauthn_security.sql, worked around but never fixed in
-- 20260914_node_key_ratelimit.sql).
--
-- The parameter `bucket` collided with the table column `bucket` in the
-- INSERT's VALUES list, so EVERY call raised 42702 "column reference is
-- ambiguous". checkRateLimit() in _shared/webauthn.ts fails closed on RPC
-- errors, so all four passkey edge functions returned 429 "rate limited"
-- for every request. Passkey sign-in and registration were fully broken.
--
-- Fix: keep the ORIGINAL parameter names (PostgREST binds by name from the
-- JSON body, so renaming breaks all four passkey edge functions) and
-- disambiguate the one colliding reference with a qualified name instead.
drop function if exists public.webauthn_rate_limit_check(text, int, int);
create function public.webauthn_rate_limit_check(bucket text, max_count int, window_ms int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
-- When a name could be a PL/pgSQL variable or a table column, prefer the
-- column (the ON CONFLICT arbiter below needs column names; the one place
-- the parameter value is needed uses the unambiguous v_bucket alias).
#variable_conflict use_column
declare
  v_bucket text := bucket;
  ws float := (window_ms::float / 1000.0);
  wstart timestamptz := to_timestamp(floor(extract(epoch from now()) / ws) * ws);
  newcount int;
begin
  delete from public.webauthn_rate_limits where window_start < now() - interval '1 day';
  delete from public.webauthn_challenges where created_at < now() - interval '1 day';
  insert into public.webauthn_rate_limits (bucket, window_start, count)
    values (v_bucket, wstart, 1)
    on conflict (bucket, window_start)
    do update set count = public.webauthn_rate_limits.count + 1
    returning count into newcount;
  return newcount <= max_count;
end;
$$;

revoke execute on function public.webauthn_rate_limit_check(text, int, int) from public, anon, authenticated;
grant execute on function public.webauthn_rate_limit_check(text, int, int) to service_role;
