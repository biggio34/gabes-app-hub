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
-- which bypasses RLS. Browsers never query this table.
--
-- Live updates are a Realtime Broadcast on channel game-manager:<club_id>.
-- The message is only { "revision": <number> }. Do not add this table to the
-- supabase_realtime publication. Postgres changes are not used, so row
-- payloads are not copied onto the realtime stream.
--
-- Broadcast is on for Supabase projects by default. No extra policy is required
-- because the channel is public and carries no game data. The signed-in hub
-- API is what returns the document after a phone hears a new revision.
