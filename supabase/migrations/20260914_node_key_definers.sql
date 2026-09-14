-- All NODE KEY table access goes through SECURITY DEFINER functions so the
-- edge function never needs raw table privileges (RLS stays on, no policies).

create or replace function public.node_key_store_grant(p_jti text, p_code_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into node_key_grants (jti, code_hash) values (p_jti, p_code_hash);
  return true;
exception when unique_violation then
  return false;
end;
$$;

create or replace function public.node_key_claim_grant(p_jti text, p_user_id uuid)
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
  if v_consumed_by is not null then
    if v_consumed_by = p_user_id then
      return jsonb_build_object('ok', true, 'code_hash', v_code_hash, 'replay', true);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'GRANT_USED');
  end if;
  update node_key_grants
     set consumed_at = now(), consumed_by = p_user_id
   where jti = p_jti;
  return jsonb_build_object('ok', true, 'code_hash', v_code_hash, 'replay', false);
end;
$$;

create or replace function public.node_key_redeem_grant(p_code_hash text, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into node_key_redemptions (code_hash, user_id)
  values (p_code_hash, p_user_id)
  on conflict (user_id) do nothing;
  return true;
end;
$$;

-- true = this account still needs a NODE KEY.
create or replace function public.node_key_status(p_user_id uuid, p_created_at timestamptz, p_gate_since timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from node_key_redemptions where user_id = p_user_id) then
    return false;
  end if;
  if p_created_at < p_gate_since then
    return false;
  end if;
  return true;
end;
$$;

-- The edge function calls these over PostgREST; grant execute to both roles.
grant execute on function public.node_key_redeem(text) to anon, authenticated;
grant execute on function public.node_key_rate_limit_check(text, integer, integer) to anon, authenticated;
grant execute on function public.node_key_store_grant(text, text) to anon, authenticated;
grant execute on function public.node_key_claim_grant(text, uuid) to anon, authenticated;
grant execute on function public.node_key_redeem_grant(text, uuid) to anon, authenticated;
grant execute on function public.node_key_status(uuid, timestamptz, timestamptz) to anon, authenticated;
