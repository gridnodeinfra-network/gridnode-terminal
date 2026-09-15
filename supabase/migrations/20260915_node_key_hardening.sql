-- GRID//NODE NODE KEY hardening (2026-09-15).
--
-- 1) ATOMICITY: validate+grant-store and claim+redemption were two separate
--    RPC calls from the edge function. A crash between them could burn a key
--    use without issuing a grant, or consume a grant without recording the
--    redemption. The two new functions below do each pair in ONE transaction.
-- 2) PERMISSION LOCKDOWN: the node_key_* RPCs were granted to anon and
--    authenticated, so anyone with the public anon key could call them
--    directly via PostgREST (e.g. node_key_redeem_grant with an arbitrary
--    user_id, bypassing the edge-function gate entirely). All execute grants
--    are revoked here; the redeem-node-key edge function now calls them over
--    its service-role PostgREST client, which needs no grant.

-- Atomic check-and-reserve + grant store. Either a grant row exists and the
-- use is counted, or nothing happened.
create or replace function public.node_key_validate_grant(p_code_hash text, p_jti text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r node_keys%rowtype;
begin
  select * into r from node_keys where code_hash = p_code_hash for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'INVALID');
  end if;
  if r.revoked then
    return jsonb_build_object('ok', false, 'reason', 'REVOKED');
  end if;
  if r.expires_at is not null and r.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'EXPIRED');
  end if;
  if r.uses >= r.max_uses then
    return jsonb_build_object('ok', false, 'reason', 'USED_UP');
  end if;
  update node_keys set uses = uses + 1 where code_hash = p_code_hash;
  insert into node_key_grants (jti, code_hash) values (p_jti, p_code_hash);
  return jsonb_build_object('ok', true, 'reason', 'OK');
end;
$$;

-- Atomic grant claim + redemption. The code_hash binding check that used to
-- live in the edge function (after the claim) now happens INSIDE the
-- transaction, before anything is marked consumed.
create or replace function public.node_key_consume_grant(p_jti text, p_user_id uuid, p_code_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code_hash text;
  v_consumed_by uuid;
begin
  select code_hash, consumed_by into v_code_hash, v_consumed_by
    from node_key_grants where jti = p_jti for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'BAD_GRANT');
  end if;
  if v_code_hash != p_code_hash then
    return jsonb_build_object('ok', false, 'reason', 'GRANT_MISMATCH');
  end if;
  if v_consumed_by is not null then
    if v_consumed_by = p_user_id then
      return jsonb_build_object('ok', true, 'reason', 'OK', 'replay', true);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'GRANT_USED');
  end if;
  update node_key_grants
     set consumed_at = now(), consumed_by = p_user_id
   where jti = p_jti;
  insert into node_key_redemptions (code_hash, user_id)
  values (p_code_hash, p_user_id)
  on conflict (user_id) do nothing;
  return jsonb_build_object('ok', true, 'reason', 'OK', 'replay', false);
end;
$$;

-- Lockdown: no direct PostgREST access for anyone except the service role.
-- NOTE: Postgres grants EXECUTE to PUBLIC on new functions by default, so
-- the revoke must target PUBLIC (revoking only anon/authenticated leaves the
-- public grant in place). The edge function uses the service-role key, which
-- bypasses grants entirely.
revoke execute on function public.node_key_redeem(text) from public;
revoke execute on function public.node_key_rate_limit_check(text, integer, integer) from public;
revoke execute on function public.node_key_store_grant(text, text) from public;
revoke execute on function public.node_key_claim_grant(text, uuid) from public;
revoke execute on function public.node_key_redeem_grant(text, uuid) from public;
revoke execute on function public.node_key_status(uuid, timestamptz, timestamptz) from public;
revoke execute on function public.node_key_validate_grant(text, text) from public;
revoke execute on function public.node_key_consume_grant(text, uuid, text) from public;
-- node_key_validate_grant / node_key_consume_grant: intentionally no grant
-- to anyone except service_role (service-role only).
grant execute on function public.node_key_redeem(text) to service_role;
grant execute on function public.node_key_rate_limit_check(text, integer, integer) to service_role;
grant execute on function public.node_key_store_grant(text, text) to service_role;
grant execute on function public.node_key_claim_grant(text, uuid) to service_role;
grant execute on function public.node_key_redeem_grant(text, uuid) to service_role;
grant execute on function public.node_key_status(uuid, timestamptz, timestamptz) to service_role;
grant execute on function public.node_key_validate_grant(text, text) to service_role;
grant execute on function public.node_key_consume_grant(text, uuid, text) to service_role;
