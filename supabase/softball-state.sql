-- Shared softball roster / plans for all four apps.
-- Safe to run after hub.sql. Does not touch lineup or practice_templates.

create table if not exists hub_softball_state (
  team_id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table hub_softball_state enable row level security;
