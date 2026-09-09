-- GRID//NODE cloud record integrity + least-privilege hardening.
-- Apply only to a Supabase development branch first; this migration has not
-- been applied to the shared project by the preview repair workflow.

alter table public.weights
  add column if not exists shot_id uuid;

alter table public.shots
  add column if not exists updated_at timestamptz not null default now();

alter table public.weights
  add column if not exists updated_at timestamptz not null default now();

-- The relationship is account-scoped at the database boundary. A user who
-- somehow learns another account's SHOT UUID cannot attach their weight to it.
create unique index if not exists shots_user_id_id_unique_idx
  on public.shots(user_id, id);

alter table public.weights
  drop constraint if exists weights_shot_id_fkey;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.weights'::regclass
      and conname = 'weights_user_shot_fkey'
  ) then
    alter table public.weights
      add constraint weights_user_shot_fkey
      foreign key (user_id, shot_id)
      references public.shots(user_id, id)
      on delete cascade;
  end if;
end $$;

create unique index if not exists weights_user_shot_unique_idx
  on public.weights(user_id, shot_id)
  where shot_id is not null;

create index if not exists weights_shot_idx on public.weights(shot_id);

revoke truncate, references, trigger
  on table public.profiles, public.shots, public.weights, public.workspaces
  from anon, authenticated;

revoke truncate, references, trigger
  on table public.webauthn_credentials, public.webauthn_audit_log,
    public.webauthn_challenges, public.webauthn_rate_limits
  from anon, authenticated;

-- Event-trigger helpers are deployment infrastructure, never client RPCs.
-- Match webauthn-schema.sql: passkey mutation is restricted to server code
-- and the owner-scoped revocation RPC, never direct credential updates.
revoke all on table public.webauthn_credentials from authenticated;
grant select on table public.webauthn_credentials to authenticated;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

-- Avoid parameter/column ambiguity in the hosted rate limiter.
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
