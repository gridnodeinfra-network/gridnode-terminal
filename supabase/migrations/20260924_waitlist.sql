-- GRID//NODE waitlist: simple email capture for visitors without a NODE KEY.
-- One row per email (case-insensitive). Anonymous users may INSERT only;
-- reads are service-role only. No auth users are created from this table.
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) between 3 and 320),
  source text not null default 'auth-no-key' check (char_length(source) between 1 and 64),
  locale text not null default 'en' check (locale in ('en', 'es')),
  consented_at timestamptz,
  notified_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists waitlist_email_lower_uniq on public.waitlist (lower(email));
create index if not exists waitlist_created_idx on public.waitlist (created_at desc);
alter table public.waitlist enable row level security;
-- Browsers may INSERT only. No select/update/delete policies: reads are
-- service-role (SQL runner / dashboard) only.
drop policy if exists waitlist_anon_insert on public.waitlist;
create policy waitlist_anon_insert on public.waitlist
  for insert to anon with check (true);
-- RLS policies are not enough on their own: the role needs the table grant.
grant insert on public.waitlist to anon;
