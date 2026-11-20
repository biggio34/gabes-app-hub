-- Game Manager shared document. One row per club.
-- Does not touch hub_softball_state, lineups, or players.
-- Safe to run more than once. Run this in the Supabase SQL editor.

create table if not exists hub_game_manager (
  club_id text primary key,
  payload jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table hub_game_manager enable row level security;

-- No policies for anon or authenticated. The hub API uses the service role,
-- which bypasses RLS. Browsers never receive that key and never query this table.

-- Realtime. Ignore "already member of publication" if you run this twice.
alter publication supabase_realtime add table hub_game_manager;
