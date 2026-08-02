-- GRID//NODE v2.0.1 cloud data model
-- Safe to run repeatedly in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  weight_unit text not null default 'lbs',
  height_unit text not null default 'ft/in',
  dose_mg numeric,
  profile_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.shots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date timestamptz not null,
  compound text not null,
  dose_mg numeric not null,
  site text,
  notes text,
  side_effects text[] not null default '{}',
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.weights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date timestamptz not null,
  weight_kg numeric not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  results_data jsonb not null default '[]'::jsonb,
  notes_data jsonb not null default '[]'::jsonb,
  symptoms_data jsonb not null default '[]'::jsonb,
  labs_data jsonb not null default '[]'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  arsenal jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists profile_data jsonb not null default '{}'::jsonb;
alter table public.shots add column if not exists side_effects text[] not null default '{}';

create index if not exists shots_user_date_idx on public.shots(user_id, date);
create index if not exists weights_user_date_idx on public.weights(user_id, date);

alter table public.profiles enable row level security;
alter table public.shots enable row level security;
alter table public.weights enable row level security;
alter table public.workspaces enable row level security;

drop policy if exists profiles_owner_access on public.profiles;
create policy profiles_owner_access on public.profiles
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists shots_owner_access on public.shots;
create policy shots_owner_access on public.shots
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists weights_owner_access on public.weights;
create policy weights_owner_access on public.weights
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists workspaces_owner_access on public.workspaces;
create policy workspaces_owner_access on public.workspaces
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.profiles, public.shots, public.weights, public.workspaces from anon;
grant select, insert, update, delete on table public.profiles, public.shots, public.weights, public.workspaces to authenticated;


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
    values (bucket, wstart, 1)
    on conflict (bucket, window_start)
    do update set count = public.webauthn_rate_limits.count + 1
    returning count into newcount;
  return newcount <= max_count;
end;
$$;

revoke execute on function public.webauthn_rate_limit_check(text, int, int) from public, anon, authenticated;
grant execute on function public.webauthn_rate_limit_check(text, int, int) to service_role;

-- ─────────────────────────────────────────────────────────────
-- RLS safety net: auto-enable RLS on new public tables.
-- Matches the production event trigger `ensure_rls` (verified 2026-08-02).
-- ─────────────────────────────────────────────────────────────
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

create or replace event trigger ensure_rls on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.rls_auto_enable();
