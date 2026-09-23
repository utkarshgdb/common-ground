-- Common Ground: all tables are cg_-prefixed. This migration never touches any other table in the project.
-- RLS is enabled on every table with NO policies: only the server (service role key) can read or write.

create table if not exists cg_rooms (
  id text primary key,
  name text not null,
  trip_days int not null check (trip_days between 2 and 5),
  window_start date not null,
  window_end date not null,
  deadline_at timestamptz not null,
  focus_option_id text,
  focus_id int not null default 0,
  status text not null default 'open' check (status in ('open','postponed','closed')),
  coordinator text not null,
  admin_token_hash text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists cg_members (
  room_id text not null references cg_rooms(id) on delete cascade,
  name text not null,
  session_hash text,
  recovery_hash text,
  joined_at timestamptz,
  policy_ack_at timestamptz,
  pref_version int not null default 0,
  position int not null default 0,
  primary key (room_id, name)
);

create table if not exists cg_preferences (
  room_id text not null,
  member text not null,
  home_city text,
  budget_max int,
  budget_comfortable int,
  slots text[] not null default '{}',
  vibes text[] not null default '{}',
  wont_do text[] not null default '{}',
  max_travel_hours int,
  leave_days int,
  note_private text,
  parsed_limits jsonb not null default '[]',
  complete boolean not null default false,
  updated_at timestamptz default now(),
  primary key (room_id, member),
  foreign key (room_id, member) references cg_members (room_id, name) on delete cascade
);

create table if not exists cg_options (
  room_id text not null references cg_rooms(id) on delete cascade,
  id text not null,
  source text not null check (source in ('engine','custom','variant')),
  destination_id text,
  name text not null,
  start_date date not null,
  days int not null,
  activities text[] not null default '{}',
  shared_assumptions text,
  default_estimate int,
  version int not null default 1,
  archived boolean not null default false,
  created_at timestamptz default now(),
  primary key (room_id, id)
);

create table if not exists cg_corrections (
  room_id text not null references cg_rooms(id) on delete cascade,
  option_id text not null,
  member text not null,
  total int not null,
  basis text not null,
  checked_on date not null,
  option_version int not null,
  cost_version int not null default 1,
  stale boolean not null default false,
  active boolean not null default true,
  primary key (room_id, option_id, member)
);

create table if not exists cg_responses (
  room_id text not null references cg_rooms(id) on delete cascade,
  member text not null,
  focus_id int not null,
  option_id text not null,
  option_version int not null,
  pref_version int not null,
  cost_version int not null,
  answer text not null check (answer in ('yes','change','cannot')),
  reason_chip text,
  note_shared text,
  at timestamptz default now(),
  primary key (room_id, member, focus_id)
);

create table if not exists cg_outcomes (
  room_id text not null references cg_rooms(id) on delete cascade,
  deadline_at timestamptz not null,
  focus_option_id text,
  valid_yes int not null,
  total int not null,
  result text not null check (result in ('agreed','unresolved')),
  recorded_at timestamptz default now(),
  primary key (room_id, deadline_at)
);

create table if not exists cg_events (
  id bigint generated always as identity primary key,
  room_id text not null references cg_rooms(id) on delete cascade,
  type text not null,
  member text,
  meta jsonb not null default '{}',
  at timestamptz default now()
);

create index if not exists cg_events_room_idx on cg_events (room_id, id);
create index if not exists cg_rooms_demo_idx on cg_rooms (is_demo, created_at);

alter table cg_rooms enable row level security;
alter table cg_members enable row level security;
alter table cg_preferences enable row level security;
alter table cg_options enable row level security;
alter table cg_corrections enable row level security;
alter table cg_responses enable row level security;
alter table cg_outcomes enable row level security;
alter table cg_events enable row level security;
-- Intentionally no policies: anon/authenticated roles get nothing; the server uses the service role key.
