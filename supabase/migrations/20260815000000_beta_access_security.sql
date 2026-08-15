-- GRID//NODE ACCESS//GATE v0.15.22 — private-beta invitation system + session.
-- Idempotent migration. Safe to run repeatedly in the Supabase SQL editor.
--
-- SECURITY MODEL
--   - Plain invite codes are NEVER stored. Only the server-side HMAC-SHA256
--     digest of the normalized code lives in beta_invites.code_hash.
--   - Sessions are stored by server-derived hash of the cookie opaque-id.
--     The cookie itself is HttpOnly + Secure + SameSite=Strict + __Host- prefix.
--   - rate-limit bucket is a composite PK (bucket, window_start) so concurrent
--     writes are atomic by Postgres.
--   - claim_beta_invite() is SECURITY DEFINER and does the conditional UPDATE
--     + RETURNING in a single statement so two simultaneous submissions of
--     a single-use code cannot both succeed.
--   - All four tables are RLS-isolated to anon/authenticated; only the
--     service role touches them via the Pages Functions.

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. beta_invites
-- ============================================================================
-- Allowed statuses: 'active' | 'claimed' | 'expired' | 'revoked'. The 'status'
-- column is the canonical lifecycle state; uses/expires_at/revoked_at are
-- denormalized for read efficiency and to support the SQL primitives.
-- code_hash is bytea (NOT text) so the hash is never treated as a string by
-- the API layer. text UNIQUE on code_hash is the natural lookup key.

create table if not exists public.beta_invites (
  id            uuid primary key default gen_random_uuid(),
  code_hash     bytea not null unique,                  -- HMAC-SHA256(code, server_secret)
  status        text not null default 'active'
                   check (status in ('active', 'claimed', 'expired', 'revoked')),
  max_uses      integer not null default 1 check (max_uses > 0),
  uses          integer not null default 0 check (uses >= 0),
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now(),
  claimed_at    timestamptz,
  revoked_at    timestamptz,
  -- NOTE: never store raw codes. Inserts only ever happen via the admin CLI
  -- running dev/admin.cjs against supabase:bulk or via a service-role RPC.
  constraint beta_invites_uses_le_max_uses check (uses <= max_uses)
);

create index if not exists beta_invites_status_expires_idx
  on public.beta_invites (status, expires_at);

-- ============================================================================
-- 2. beta_sessions
-- ============================================================================
-- Stores the server-derived hash of the cookie opaque-id. The cookie carries
-- the raw opaque-id; the server looks up by hashing the cookie value and
-- querying this table. Even with full DB read access, an attacker cannot
-- impersonate a session without the raw cookie.
-- Stores cookie_token_hash (NOT raw token), invite_id, expires, revocation.

create table if not exists public.beta_sessions (
  id                uuid primary key default gen_random_uuid(),
  token_hash        bytea not null unique,                 -- SHA-256(cookie opaque-id)
  invite_id         uuid not null references public.beta_invites(id),
  issued_at         timestamptz not null default now(),
  expires_at        timestamptz not null,
  revoked_at        timestamptz,
  last_seen_at      timestamptz,
  ip_hash           bytea                                  -- coarse, hashed client IP at issue time
);

create index if not exists beta_sessions_expires_idx
  on public.beta_sessions (expires_at);
create index if not exists beta_sessions_invite_idx
  on public.beta_sessions (invite_id);

-- ============================================================================
-- 3. beta_attempts — audit log
-- ============================================================================
-- Records every attempt (granted, denied, limited, interrupted).
-- Never stores: raw code, cookie value, full IP, full UA, session opaque-id.
-- Stores: hashed invite_ref (HMAC of invite.id), hashed IP, coarse country,
-- ua_class, device_class, response time, http status.

create table if not exists public.beta_attempts (
  id                     uuid primary key default gen_random_uuid(),
  timestamp              timestamptz not null default now(),
  invite_ref             bytea,                          -- HMAC(invite_id, server_secret) when known
  result                 text not null
                             check (result in ('granted', 'denied', 'interrupted', 'limited')),
  result_reason          text,                            -- invalid|expired|revoked|exhausted|null
  rate_limit_outcome     text,                            -- allowed|throttled_endpoint|throttled_ip|throttled_invite|locked
  rate_limit_remaining   integer,
  ip_hash                bytea,                          -- SHA-256(normalized_ip + salt)
  ip_country             text,                            -- coarse country only
  user_agent_class       text,                            -- mobile|desktop|bot
  device_class           text,                            -- touch|pointer
  response_time_ms       integer,
  http_status            integer not null
);

create index if not exists beta_attempts_timestamp_idx
  on public.beta_attempts (timestamp);
create index if not exists beta_attempts_invite_ref_idx
  on public.beta_attempts (invite_ref);
create index if not exists beta_attempts_result_idx
  on public.beta_attempts (result, timestamp);

-- ============================================================================
-- 4. beta_rate_limits — three independent buckets
-- ============================================================================
-- One table, three scopes. Bucket key format:
--   'endpoint'                  — global per-endpoint
--   'ip:<normalized_ip>'        — per IP (/24 v4 or /48 v6)
--   'invite:<invite_id>'        — per invite.id
-- window_start is minute-aligned for the standard buckets; the long-window
-- buckets (ip / invite) auto-extend by their window_size in the API code.

create table if not exists public.beta_rate_limits (
  bucket         text not null,
  window_start   timestamptz not null,
  count          integer not null default 0,
  primary key (bucket, window_start)
);

create index if not exists beta_rate_limits_window_idx
  on public.beta_rate_limits (window_start);

-- ============================================================================
-- 5. claim_beta_invite — atomic single-use (or N-use) claim
-- ============================================================================
-- SECURITY DEFINER. Runs in one transaction. Returns a row only when the
-- invite is active, not revoked, not expired, and uses < max_uses. On success
-- the uses column is incremented and status is updated to 'claimed' when
-- uses == max_uses. Two simultaneous submissions of a single-use code cannot
-- both succeed because Postgres serializes the UPDATE within the row-level
-- lock.

create or replace function public.claim_beta_invite(p_invite_id uuid)
returns table (id uuid, uses integer, max_uses integer, status text)
security definer
set search_path = public, pg_temp
language plpgsql
as $$
declare
  v_beta_invites public.beta_invites%rowtype;
begin
  -- Conditional update + RETURNING in one statement. The row-level lock
  -- acquired by UPDATE serializes concurrent claims. If the WHERE clause
  -- doesn't match, the row is not updated and RETURNING yields 0 rows.
  update public.beta_invites i
     set uses = i.uses + 1,
         status = case when i.uses + 1 >= i.max_uses then 'claimed' else i.status end,
         claimed_at = case when i.uses + 1 >= i.max_uses then now() else i.claimed_at end
   where i.id = p_invite_id
     and i.status = 'active'
     and i.revoked_at is null
     and i.expires_at > now()
     and i.uses < i.max_uses
   returning i.id, i.uses, i.max_uses, i.status
     into v_beta_invites.id, v_beta_invites.uses, v_beta_invites.max_uses, v_beta_invites.status;

  if v_beta_invites.id is null then
    return;
  end if;

  return query select v_beta_invites.id, v_beta_invites.uses, v_beta_invites.max_uses, v_beta_invites.status;
end;
$$;

-- ============================================================================
-- 6. revoke_beta_invite — atomic revoke + cascade session invalidation
-- ============================================================================
-- Sets the invite to 'revoked' AND revokes all outstanding sessions for it,
-- in a single transaction. Audit history is preserved (no row deletes).

create or replace function public.revoke_beta_invite(p_invite_id uuid)
returns boolean
security definer
set search_path = public, pg_temp
language plpgsql
as $$
declare
  v_updated integer;
begin
  update public.beta_invites
     set status = 'revoked',
         revoked_at = coalesce(revoked_at, now())
   where id = p_invite_id
     and status <> 'revoked';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return false;
  end if;

  -- Cascade: invalidate all outstanding sessions for this invite.
  update public.beta_sessions
     set revoked_at = coalesce(revoked_at, now())
   where invite_id = p_invite_id
     and revoked_at is null
     and expires_at > now();

  return true;
end;
$$;

-- ============================================================================
-- 7. HMAC helpers — never return the raw code or raw IP
-- ============================================================================

-- Hash a normalized code (server-side compute). HMAC-SHA256 keyed with the
-- server secret. Different servers / deployments use different secrets so
-- hashes are not portable across environments.
create or replace function public.beta_hash_code(p_code text, p_secret text)
returns bytea
security definer
set search_path = public, pg_temp
language sql
as $$
  select hmac(p_code, p_secret, 'sha256');
$$;

-- Identifier for audit logs. HMAC-derived from invite.id (never from the code).
create or replace function public.beta_invite_ref(p_invite_id uuid, p_secret text)
returns bytea
security definer
set search_path = public, pg_temp
language sql
as $$
  select hmac(p_invite_id::text, p_secret, 'sha256');
$$;

-- IP normalization hash. The API layer normalizes IPv4 to /24 and IPv6 to /48
-- BEFORE hashing, so two attackers sharing an allocation produce the same
-- hash but distinct allocations produce distinct hashes.
create or replace function public.beta_ip_hash(p_normalized_ip text, p_salt text)
returns bytea
security definer
set search_path = public, pg_temp
language sql
as $$
  select digest(p_normalized_ip || ':' || p_salt, 'sha256');
$$;

-- ============================================================================
-- 8. RLS — service-role only. No client connection may read or write.
-- ============================================================================

alter table public.beta_invites enable row level security;
alter table public.beta_sessions enable row level security;
alter table public.beta_attempts enable row level security;
alter table public.beta_rate_limits enable row level security;

drop policy if exists beta_invites_no_client_access on public.beta_invites;
create policy beta_invites_no_client_access on public.beta_invites
  for all to anon, authenticated
  using (false) with check (false);

drop policy if exists beta_sessions_no_client_access on public.beta_sessions;
create policy beta_sessions_no_client_access on public.beta_sessions
  for all to anon, authenticated
  using (false) with check (false);

drop policy if exists beta_attempts_no_client_access on public.beta_attempts;
create policy beta_attempts_no_client_access on public.beta_attempts
  for all to anon, authenticated
  using (false) with check (false);

drop policy if exists beta_rate_limits_no_client_access on public.beta_rate_limits;
create policy beta_rate_limits_no_client_access on public.beta_rate_limits
  for all to anon, authenticated
  using (false) with check (false);

-- ============================================================================
-- 9. Maintenance: annotate expired invites on STATUS update
-- ============================================================================
-- This is a helper function for an external cron / scheduled job. The API
-- does not depend on it; it exists so an admin can run a one-line update
-- sweep to mark invites that have passed expires_at as 'expired'.

create or replace function public.beta_expire_overdue()
returns integer
security definer
set search_path = public, pg_temp
language sql
as $$
  with expired as (
    update public.beta_invites
       set status = 'expired'
     where status = 'active'
       and expires_at <= now()
     returning id
  )
  select count(*)::integer from expired;
$$;
