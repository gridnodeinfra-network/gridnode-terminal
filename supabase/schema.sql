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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shots_user_id_id_key unique (user_id, id)
);

create table if not exists public.weights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shot_id uuid,
  date timestamptz not null,
  weight_kg numeric not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weights_user_shot_fkey foreign key (user_id, shot_id)
    references public.shots(user_id, id) on delete cascade
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
alter table public.shots add column if not exists updated_at timestamptz not null default now();
alter table public.weights add column if not exists shot_id uuid;
alter table public.weights add column if not exists updated_at timestamptz not null default now();

create index if not exists shots_user_date_idx on public.shots(user_id, date);
create unique index if not exists shots_user_id_id_unique_idx on public.shots(user_id, id);
create index if not exists weights_user_date_idx on public.weights(user_id, date);
create unique index if not exists weights_user_shot_unique_idx on public.weights(user_id, shot_id) where shot_id is not null;
create index if not exists weights_shot_idx on public.weights(shot_id);

alter table public.weights drop constraint if exists weights_shot_id_fkey;
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
revoke truncate, references, trigger on table public.profiles, public.shots, public.weights, public.workspaces from anon, authenticated;

