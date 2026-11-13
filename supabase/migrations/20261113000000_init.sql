-- ---------- knowledge base
create table knowledge (
  id bigint generated always as identity primary key,
  category text not null default 'general',
  title text not null check (char_length(title) between 1 and 200),
  content text not null default '' check (char_length(content) <= 20000),
  -- set by scripts/seed.mjs; null for entries created on the admin page
  source_file text,
  updated_at timestamptz not null default now()
);

create index on knowledge (category);
create index on knowledge (source_file);

create function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger knowledge_touch before update on knowledge
  for each row execute function touch_updated_at();

-- ---------- admins (people allowed to edit knowledge)
create table admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text,
  created_at timestamptz not null default now()
);

create function is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

alter table knowledge enable row level security;
alter table admins enable row level security;

create policy "read knowledge" on knowledge for select using (true);
create policy "insert knowledge" on knowledge for insert with check (is_admin());
create policy "update knowledge" on knowledge for update using (is_admin()) with check (is_admin());
create policy "delete knowledge" on knowledge for delete using (is_admin());

create policy "admins read self" on admins for select using (user_id = auth.uid());

-- ---------- rate limiting (only the chat Edge Function touches this)
create table rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits int not null default 0
);

alter table rate_limits enable row level security;

-- returns true if the request is allowed
create function hit_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  current_hits int;
begin
  insert into rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into current_hits;

  delete from rate_limits where window_start < now() - interval '1 day';

  return current_hits <= p_max;
end $$;

revoke all on function hit_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function hit_rate_limit(text, int, int) to service_role;

-- AFTER creating your account in Authentication > Users, run this once
-- (swap in your user id):
-- insert into admins (user_id, name) values ('YOUR-USER-UUID', 'Pengdi');
