-- Rate limiter for the NODE KEY validate endpoint.
-- (The pre-existing webauthn_rate_limit_check has an ambiguous-column bug;
-- this one uses unambiguous parameter names instead of touching it.)

create table if not exists public.node_key_rate_limits (
  bucket       text        not null,
  window_start timestamptz not null,
  count        integer     not null default 1,
  primary key (bucket, window_start)
);

alter table public.node_key_rate_limits enable row level security;
-- No user-facing policies: only SECURITY DEFINER functions touch this table.

create or replace function public.node_key_rate_limit_check(p_bucket text, p_max integer, p_window_ms integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window_sec double precision := p_window_ms / 1000.0;
  v_wstart timestamptz;
  v_count integer;
begin
  delete from node_key_rate_limits
   where window_start < v_now - (p_window_ms || ' milliseconds')::interval;
  v_wstart := to_timestamp(floor(extract(epoch from v_now) / v_window_sec) * v_window_sec);
  insert into node_key_rate_limits (bucket, window_start, count)
  values (p_bucket, v_wstart, 1)
  on conflict (bucket, window_start)
  do update set count = node_key_rate_limits.count + 1
  returning count into v_count;
  -- RETURNING on upsert: select the row to be safe
  if v_count is null then
    select count into v_count from node_key_rate_limits
     where bucket = p_bucket and window_start = v_wstart;
  end if;
  return v_count <= p_max;
end;
$$;
