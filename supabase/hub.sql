-- Gabe's Apps hub tables.
-- Safe to run on the existing lineup project. These names do not touch
-- lineups or practice_templates.

create table if not exists hub_clubs (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists hub_teams (
  id text primary key,
  club_id text not null references hub_clubs(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists hub_users (
  id text primary key,
  username text not null unique,
  name text not null,
  email text,
  password_hash text not null,
  role text not null,
  created_at timestamptz not null default now()
);

create table if not exists hub_user_areas (
  user_id text not null references hub_users(id) on delete cascade,
  area text not null,
  primary key (user_id, area)
);

create table if not exists hub_user_clubs (
  user_id text not null references hub_users(id) on delete cascade,
  club_id text not null references hub_clubs(id) on delete cascade,
  primary key (user_id, club_id)
);

create table if not exists hub_user_teams (
  user_id text not null references hub_users(id) on delete cascade,
  team_id text not null references hub_teams(id) on delete cascade,
  primary key (user_id, team_id)
);

alter table hub_clubs enable row level security;
alter table hub_teams enable row level security;
alter table hub_users enable row level security;
alter table hub_user_areas enable row level security;
alter table hub_user_clubs enable row level security;
alter table hub_user_teams enable row level security;

insert into hub_clubs (id, name)
values ('club-mn-elks', 'MN Elks')
on conflict (id) do nothing;

insert into hub_teams (id, club_id, name)
values ('team-16u-fransen', 'club-mn-elks', '16U Fransen')
on conflict (id) do nothing;

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table hub_players enable row level security;
