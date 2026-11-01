-- Waitlist signup email notifications (2026-11-01, Pipe's request).
-- On INSERT into public.waitlist, a trigger posts to the Resend API via
-- pg_net and emails gridnodenet@gmail.com. The Resend API key lives in
-- private.notify_config (id=1), inserted separately through the Supabase
-- SQL editor so the value never transits chat, git, or logs. If no key
-- row exists, the trigger returns quietly: a signup can never be blocked
-- by a missing notification config.

create extension if not exists pg_net;

create schema if not exists private;

create table if not exists private.notify_config (
  id int primary key,
  resend_api_key text
);
alter table private.notify_config enable row level security;
revoke all on schema private from public, anon, authenticated;
revoke all on table private.notify_config from public, anon, authenticated;

create or replace function public.notify_waitlist_signup()
returns trigger
language plpgsql
security definer
set search_path = public, private, net
as $$
declare
  api_key text;
  total int;
begin
  select resend_api_key into api_key from private.notify_config where id = 1;
  if api_key is null then
    return new;
  end if;
  select count(*) into total from public.waitlist;
  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || api_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'from', 'GRID//NODE <auth@gridnode.network>',
      'to', jsonb_build_array('gridnodenet@gmail.com'),
      'subject', 'New GRID//NODE waitlist signup (' || total || ' total)',
      'text', 'A new person joined the GRID//NODE waitlist.' || chr(10) || chr(10)
        || 'Email: ' || new.email || chr(10)
        || 'Joined (UTC): ' || new.created_at || chr(10)
        || 'Waitlist total: ' || total
    )
  );
  return new;
end $$;

drop trigger if exists waitlist_notify_ins on public.waitlist;
create trigger waitlist_notify_ins
  after insert on public.waitlist
  for each row execute function public.notify_waitlist_signup();
