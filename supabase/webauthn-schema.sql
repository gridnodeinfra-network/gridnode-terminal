-- ─────────────────────────────────────────────────────────────
-- WebAuthn passkeys, challenges, audit, and rate limiting
-- Used by the webauthn-* edge functions. Idempotent.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credential_id text not null,
  public_key text not null,
  sign_count bigint not null default 0,
  device_name text,
  transports jsonb not null default '[]'::jsonb,
  aaguid text,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.webauthn_credentials add column if not exists device_name text;
alter table public.webauthn_credentials add column if not exists transports jsonb not null default '[]'::jsonb;
alter table public.webauthn_credentials add column if not exists aaguid text;
alter table public.webauthn_credentials add column if not exists last_used_at timestamptz;
alter table public.webauthn_credentials add column if not exists revoked_at timestamptz;
alter table public.webauthn_credentials add column if not exists created_at timestamptz not null default now();

create unique index if not exists webauthn_credentials_credential_id_idx on public.webauthn_credentials(credential_id);
create unique index if not exists webauthn_credentials_user_credential_idx on public.webauthn_credentials(user_id, credential_id);
create index if not exists webauthn_credentials_user_idx on public.webauthn_credentials(user_id);

create table if not exists public.webauthn_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  event text not null,
  credential_id text,
  success boolean not null default false,
  error text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists webauthn_audit_log_user_idx on public.webauthn_audit_log(user_id);
create index if not exists webauthn_audit_log_created_idx on public.webauthn_audit_log(created_at desc);

create table if not exists public.webauthn_challenges (
  token_hash text primary key,
  user_id uuid,
  op text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create table if not exists public.webauthn_rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (bucket, window_start)
);

-- RLS: credentials are owner-readable via REST (listPasskeys); the audit,
-- challenge, and rate-limit tables are service-role only.
alter table public.webauthn_credentials enable row level security;
alter table public.webauthn_audit_log enable row level security;
alter table public.webauthn_challenges enable row level security;
alter table public.webauthn_rate_limits enable row level security;

drop policy if exists webauthn_credentials_owner_select on public.webauthn_credentials;
create policy webauthn_credentials_owner_select on public.webauthn_credentials
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists webauthn_credentials_owner_update on public.webauthn_credentials;
create policy webauthn_credentials_owner_update on public.webauthn_credentials
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.webauthn_credentials, public.webauthn_audit_log, public.webauthn_challenges, public.webauthn_rate_limits from anon;
revoke all on table public.webauthn_credentials from authenticated;
revoke all on table public.webauthn_audit_log, public.webauthn_challenges, public.webauthn_rate_limits from authenticated;
grant select on table public.webauthn_credentials to authenticated;

-- Revoke a passkey (authenticated owner only). Logs to the audit trail.
create or replace function public.revoke_webauthn_credential(credential_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    return false;
  end if;
  update public.webauthn_credentials
     set revoked_at = now()
   where credential_id = revoke_webauthn_credential.credential_id
     and user_id = uid;
  if not found then
    return false;
  end if;
  insert into public.webauthn_audit_log (user_id, event, credential_id, success)
  values (uid, 'revoke_passkey', revoke_webauthn_credential.credential_id, true);
  return true;
end;
$$;

revoke execute on function public.revoke_webauthn_credential(text) from public, anon;
grant execute on function public.revoke_webauthn_credential(text) to authenticated;

-- Atomic rate-limit check: increments the counter for a bucket/window and
-- returns true when the call is within the budget. Cleans up stale rows.
create or replace function public.webauthn_rate_limit_check(bucket text, max_count int, window_ms int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ws float := (window_ms::float / 1000.0);
  wstart timestamptz := to_timestamp(floor(extract(epoch from now()) / ws) * ws);
  newcount int;
begin
  delete from public.webauthn_rate_limits where window_start < now() - interval '1 day';
  delete from public.webauthn_challenges where created_at < now() - interval '1 day';
  insert into public.webauthn_rate_limits (bucket, window_start, count)
    values (webauthn_rate_limit_check.bucket, wstart, 1)
    on conflict on constraint webauthn_rate_limits_pkey
    do update set count = public.webauthn_rate_limits.count + 1
    returning count into newcount;
  return newcount <= max_count;
end;
$$;

revoke execute on function public.webauthn_rate_limit_check(text, int, int) from public, anon, authenticated;
grant execute on function public.webauthn_rate_limit_check(text, int, int) to service_role;
