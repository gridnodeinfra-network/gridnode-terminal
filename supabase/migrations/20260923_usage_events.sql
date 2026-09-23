-- GRID//NODE first-party usage events (visits + activity), 2026-09-23.
-- Privacy-clean: no IPs, no full URLs, no fingerprinting. session_id is a
-- random UUID per browser session; user_id links only when signed in.
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  event text not null check (char_length(event) between 1 and 64),
  path text check (char_length(path) <= 256),
  host text check (char_length(host) <= 128),
  lang text check (char_length(lang) <= 16),
  referrer_host text check (char_length(referrer_host) <= 128),
  app_version text check (char_length(app_version) <= 32),
  created_at timestamptz not null default now()
);
create index if not exists usage_events_created_idx on public.usage_events (created_at desc);
create index if not exists usage_events_session_idx on public.usage_events (session_id);
create index if not exists usage_events_event_idx on public.usage_events (event);
alter table public.usage_events enable row level security;
-- Browsers may INSERT only. No select/update/delete policies: reads are
-- service-role (SQL runner / dashboard) only.
drop policy if exists usage_events_anon_insert on public.usage_events;
create policy usage_events_anon_insert on public.usage_events
  for insert to anon with check (true);
