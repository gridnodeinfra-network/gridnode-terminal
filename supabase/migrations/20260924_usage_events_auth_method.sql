-- GRID//NODE usage events: record which auth method succeeded (preview-only
-- instrumentation for the passwordless redesign).
alter table public.usage_events
  add column if not exists auth_method text check (char_length(auth_method) <= 32);
