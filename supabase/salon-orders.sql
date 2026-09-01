-- Luna Haus supply orders.
-- Safe to run on the existing hub project. Does not touch softball tables.

create table if not exists hub_salon_orders (
  id text primary key,
  year integer not null,
  month integer not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (year, month)
);

create table if not exists hub_salon_order_items (
  id text primary key,
  order_id text not null references hub_salon_orders(id) on delete cascade,
  preferred_vendor text not null default '',
  brand text not null default '',
  product text not null,
  size text not null default '',
  shade text not null default '',
  qty integer not null default 1,
  note text not null default '',
  actual_vendor text not null default '',
  status text not null,
  requested_by_user_id text not null,
  requested_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table hub_salon_orders enable row level security;
alter table hub_salon_order_items enable row level security;
