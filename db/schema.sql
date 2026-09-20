-- ===========================================================================
-- mmagame — Postgres schema (Supabase)
--
-- Design notes:
--  * A "world" is one save game. Two players share exactly one world.
--  * Every random outcome derives from world.seed + a deterministic label,
--    so nothing random is ever stored that couldn't be recomputed.
--  * Fighters are split: `fighter` (immutable-ish identity + attributes) and
--    `fighter_world_state` (per-world mutable condition, contract, record).
--    This lets you reset a world without re-importing 2,500 fighters.
--  * Run with: supabase db push, or paste into the SQL editor.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- worlds ---
create table world (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  seed          text not null,
  -- The in-game clock. Everything advances off this.
  in_game_date  date not null default '2026-09-20',
  -- 'RUNNING' | 'AWAITING_READY' | 'SIMULATING'
  status        text not null default 'RUNNING',
  created_at    timestamptz not null default now()
);

create table world_member (
  world_id      uuid references world(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete cascade,
  promotion_id  uuid,                       -- set after creation suite
  is_ready      boolean not null default false,
  primary key (world_id, user_id)
);

-- ------------------------------------------------------------- fighters ---
create table fighter (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  nickname      text,
  nationality   text,
  dob           date,
  height_cm     int,
  reach_cm      int,
  stance        text,
  weight_class  text not null,
  -- 'REAL' fighters come from the data import; 'GENERATED' are procedural
  -- prospects/amateurs seeded from real nationality + gym distributions.
  origin        text not null default 'REAL',
  -- All 18 attributes in one jsonb blob. Queried rarely, written rarely,
  -- and keeps the table from having 18 int columns you'll keep changing.
  attributes    jsonb not null,
  overall       int not null,
  popularity    int not null,
  marketability int not null,
  -- Career record as imported. Per-world record lives in fighter_world_state.
  base_w int not null default 0,
  base_l int not null default 0,
  base_d int not null default 0,
  source_ref    text                        -- e.g. espn athlete id, for re-import
);
create index on fighter (weight_class, overall desc);
create index on fighter (popularity desc);

-- --------------------------------------------------------- promotions -----
create table promotion (
  id            uuid primary key default gen_random_uuid(),
  world_id      uuid not null references world(id) on delete cascade,
  name          text not null,
  short_name    text,
  -- 'PLAYER' | 'AI'. Real promotions (UFC, PFL, BKFC...) are always AI.
  controller    text not null default 'AI',
  owner_user_id uuid references auth.users(id),
  -- 'MMA' | 'BOXING' | 'BAREKNUCKLE' | 'MIXED'
  discipline    text not null default 'MMA',
  home_country  text,
  -- 0-100. Drives free-agent interest, TV interest, ticket pricing power.
  prestige      int not null default 10,
  money         bigint not null default 250000,
  -- Facility levels 1-10: training, scouting, business, medical, production
  facilities    jsonb not null default '{"training":1,"scouting":1,"business":1,"medical":1,"production":1}',
  -- Array of {trait, tier} — tier in bronze/silver/gold/diamond/platinum/onyx
  traits        jsonb not null default '[]',
  logo_url      text
);
create index on promotion (world_id);

create table owner_profile (
  promotion_id  uuid primary key references promotion(id) on delete cascade,
  display_name  text not null,
  avatar_url    text,
  traits        jsonb not null default '[]',
  -- Skill points spent across: negotiation, matchmaking, scouting, media, finance
  skills        jsonb not null default '{}'
);

-- --------------------------------------------------------- contracts ------
create table contract (
  id              uuid primary key default gen_random_uuid(),
  world_id        uuid not null references world(id) on delete cascade,
  fighter_id      uuid not null references fighter(id),
  promotion_id    uuid not null references promotion(id) on delete cascade,
  -- Fights remaining on the deal. Real MMA deals are fight-count based,
  -- not time based — that's why this isn't an end_date.
  fights_total    int not null,
  fights_used     int not null default 0,
  -- Expiry backstop: most deals also lapse after N months of inactivity.
  expires_on      date,
  show_money      bigint not null,      -- paid to show up
  win_bonus       bigint not null default 0,
  -- Basis points of PPV revenue (100 bps = 1%). Only elite fighters get this.
  ppv_points_bps  int not null default 0,
  signing_bonus   bigint not null default 0,
  -- Champion's clause: promotion can extend if fighter holds a title
  champions_clause boolean not null default false,
  -- Matching rights on outside offers when the deal expires
  matching_rights  boolean not null default false,
  exclusive        boolean not null default true,
  status          text not null default 'ACTIVE'  -- ACTIVE | EXPIRED | RELEASED
);
create index on contract (world_id, promotion_id) where status = 'ACTIVE';
create unique index on contract (world_id, fighter_id) where status = 'ACTIVE' and exclusive;

create table fighter_world_state (
  world_id      uuid not null references world(id) on delete cascade,
  fighter_id    uuid not null references fighter(id),
  w int not null default 0, l int not null default 0, d int not null default 0,
  -- 0-100 health, 0-100 morale, injuries as jsonb array
  health        int not null default 100,
  morale        int not null default 60,
  injuries      jsonb not null default '[]',
  -- Attributes drift from the base over a career (training, age, damage)
  attr_delta    jsonb not null default '{}',
  popularity    int not null default 0,
  last_fought   date,
  retired       boolean not null default false,
  primary key (world_id, fighter_id)
);

-- ------------------------------------------------------------- arenas -----
create table arena (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  city         text, country text,
  capacity     int not null,
  -- Base rental cost; scales with promotion prestige at booking time.
  base_cost    bigint not null,
  -- 1-10. High-tier arenas refuse low-prestige promotions outright.
  tier         int not null default 1
);

-- ------------------------------------------------------------- events -----
create table event (
  id            uuid primary key default gen_random_uuid(),
  world_id      uuid not null references world(id) on delete cascade,
  promotion_id  uuid not null references promotion(id) on delete cascade,
  name          text not null,
  event_date    date not null,
  arena_id      uuid references arena(id),
  -- 'PPV' | 'FIGHT_NIGHT' | 'PRELIM_CARD' | 'CROSS_PROMOTION'
  event_type    text not null default 'FIGHT_NIGHT',
  status        text not null default 'SCHEDULED', -- SCHEDULED | SIMULATED
  -- Populated after simulation
  attendance    int, gate bigint, ppv_buys int, revenue bigint, cost bigint,
  overall_grade int,
  co_promotion_id uuid references promotion(id)
);
create index on event (world_id, event_date);

create table bout (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references event(id) on delete cascade,
  -- 1 = main event, 2 = co-main, ascending down the card
  card_position int not null,
  fighter_a     uuid not null references fighter(id),
  fighter_b     uuid not null references fighter(id),
  ruleset_key   text not null default 'MMA_3',
  weight_class  text not null,
  title_bout    boolean not null default false,
  -- Full FightResult from the engine, including play-by-play.
  -- Stored because replaying is cheap but the PBP is what the live event
  -- screen streams, and you want it stable across both players' devices.
  result        jsonb,
  unique (event_id, card_position)
);

-- --------------------------------------------------------------- news -----
create table news_item (
  id           uuid primary key default gen_random_uuid(),
  world_id     uuid not null references world(id) on delete cascade,
  posted_at    date not null,
  -- Fictional in-game accounts. Do NOT store real journalists' handles.
  handle       text not null,
  body         text not null,
  importance   int not null default 1,   -- 1 minor .. 5 breaking
  refs         jsonb not null default '{}'
);
create index on news_item (world_id, posted_at desc);

-- ------------------------------------------------- tick log (multiplayer) --
-- The append-only record of world advancement. Both clients replay this to
-- reach identical state. This is what makes async co-op work without syncing.
create table world_tick (
  world_id     uuid not null references world(id) on delete cascade,
  seq          bigint not null,
  from_date    date not null,
  to_date      date not null,
  -- What happened: events simulated, contracts expired, news generated
  summary      jsonb not null,
  created_at   timestamptz not null default now(),
  primary key (world_id, seq)
);

-- --------------------------------------------------------------- RLS ------
alter table world               enable row level security;
alter table world_member        enable row level security;
alter table promotion           enable row level security;
alter table event               enable row level security;
alter table bout                enable row level security;
alter table contract            enable row level security;
alter table news_item           enable row level security;
alter table fighter_world_state enable row level security;
alter table world_tick          enable row level security;

-- Helper: is the current user in this world?
create or replace function in_world(w uuid) returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from world_member m
    where m.world_id = w and m.user_id = auth.uid()
  );
$$;

create policy "members read world"      on world      for select using (in_world(id));
create policy "members read members"    on world_member for select using (in_world(world_id));
create policy "members rw promotions"   on promotion   for all using (in_world(world_id));
create policy "members rw events"       on event       for all using (in_world(world_id));
create policy "members rw contracts"    on contract    for all using (in_world(world_id));
create policy "members read news"       on news_item   for select using (in_world(world_id));
create policy "members read ticks"      on world_tick  for select using (in_world(world_id));
create policy "members rw fws"          on fighter_world_state for all using (in_world(world_id));
create policy "members rw bouts"        on bout for all using (
  exists (select 1 from event e where e.id = bout.event_id and in_world(e.world_id))
);

-- fighter and arena are shared reference data — readable by any signed-in user.
alter table fighter enable row level security;
alter table arena   enable row level security;
create policy "read fighters" on fighter for select using (auth.role() = 'authenticated');
create policy "read arenas"   on arena   for select using (auth.role() = 'authenticated');
