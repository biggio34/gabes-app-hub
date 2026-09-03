-- Player cards + season history on hub_players.
-- Run this in the Supabase SQL editor on preview and live.
-- Safe to re-run. Does not drop data. Do not assume these columns already exist.

create table if not exists hub_softball_state (
  team_id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table hub_softball_state enable row level security;

create table if not exists hub_players (
  id text primary key,
  club_id text not null references hub_clubs(id) on delete cascade,
  assigned_team_id text,
  first_name text not null default '',
  last_name text not null default '',
  name text not null,
  number text not null default '',
  position text not null default '',
  position2 text not null default '',
  birthdate text not null default '',
  original_team text not null default '',
  extra jsonb not null default '{}'::jsonb,
  card jsonb not null default '{}'::jsonb,
  seasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table hub_players add column if not exists assigned_team_id text;
alter table hub_players add column if not exists first_name text not null default '';
alter table hub_players add column if not exists last_name text not null default '';
alter table hub_players add column if not exists name text not null default '';
alter table hub_players add column if not exists number text not null default '';
alter table hub_players add column if not exists position text not null default '';
alter table hub_players add column if not exists position2 text not null default '';
alter table hub_players add column if not exists birthdate text not null default '';
alter table hub_players add column if not exists original_team text not null default '';
alter table hub_players add column if not exists extra jsonb not null default '{}'::jsonb;
alter table hub_players add column if not exists card jsonb not null default '{}'::jsonb;
alter table hub_players add column if not exists seasons jsonb not null default '[]'::jsonb;
alter table hub_players add column if not exists created_at timestamptz not null default now();
alter table hub_players add column if not exists updated_at timestamptz not null default now();

alter table hub_players enable row level security;
