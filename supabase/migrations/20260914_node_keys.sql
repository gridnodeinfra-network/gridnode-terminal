-- GRID//NODE NODE KEY (invite code) system — Wave 1 beta gating, tier-ready.
-- Codes are stored as SHA-256 hashes only; plaintext exists only in the
-- mint script output handed to Pipe. verify_jwt=false edge function
-- redeem-node-key is the only writer (service role).

create table if not exists public.node_keys (
  code_hash text primary key,
  label text not null default 'wave-1',
  max_uses integer not null default 1 check (max_uses >= 1),
  uses integer not null default 0 check (uses >= 0),
  revoked boolean not null default false,
  expires_at timestamptz,
  grants_premium_until timestamptz, -- NULL = standard beta access; set later for paid tiers
  note text,
  created_at timestamptz not null default now(),
  created_by text
);

create table if not exists public.node_key_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null references public.node_keys(code_hash) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique(user_id)
);

create table if not exists public.node_key_grants (
  jti text primary key,
  code_hash text not null references public.node_keys(code_hash) on delete cascade,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  consumed_by uuid references auth.users(id) on delete set null
);

alter table public.node_keys enable row level security;
alter table public.node_key_redemptions enable row level security;
alter table public.node_key_grants enable row level security;
-- No policies: only the service-role edge function touches these tables.

-- Atomic check-and-reserve: called by the edge function on validate.
create or replace function public.node_key_redeem(p_code_hash text)
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
  return jsonb_build_object('ok', true, 'reason', 'OK');
end;
$$;

-- Ops note: the mint script (scripts/mint-node-keys.py) writes an ops SQL file
-- with one revoke line per code (by code_hash). No plaintext ever hits the DB.
