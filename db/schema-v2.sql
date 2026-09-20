-- ===========================================================================
-- mmagame — schema v2 (additive migration, run after schema.sql)
--
-- Covers: custom divisions & titles, PotN/FotN bonuses, venue booking
-- requests, fighter personality, fighter-promotion relationships, and
-- spectator access.
-- ===========================================================================

-- ------------------------------------------------------- personality ------
-- 15 numeric axes + quirk ids. Stored on the fighter because personality is
-- world-invariant; the RELATIONSHIP with a promotion is per-world (below).
alter table fighter add column if not exists personality jsonb;
-- e.g. {"axes":{"greed":72,...},"quirks":["money_fighter","hothead"]}

create table if not exists fighter_relationship (
  world_id      uuid not null references world(id) on delete cascade,
  fighter_id    uuid not null references fighter(id),
  promotion_id  uuid not null references promotion(id) on delete cascade,
  -- -100..+100. Damaged by lowball offers, bad matchmaking, missed bonuses.
  standing      int not null default 0,
  -- Free-text log of what moved it, for the UI's "why won't he sign?" panel.
  history       jsonb not null default '[]',
  primary key (world_id, fighter_id, promotion_id)
);

-- --------------------------------------------- divisions & championships ---
-- Player promotions define their OWN weight classes. Not a fixed enum —
-- you can run a 165 lb division nobody else has, or skip flyweight entirely.
create table if not exists division (
  id            uuid primary key default gen_random_uuid(),
  promotion_id  uuid not null references promotion(id) on delete cascade,
  name          text not null,            -- "Lightweight", "Super Welterweight"
  limit_lbs     int not null,
  gender        text not null default 'M',
  -- Display order on the roster screen
  sort_order    int not null default 0,
  active        boolean not null default true,
  unique (promotion_id, name)
);

create table if not exists title (
  id            uuid primary key default gen_random_uuid(),
  promotion_id  uuid not null references promotion(id) on delete cascade,
  division_id   uuid references division(id) on delete set null,
  name          text not null,
  -- 'STANDARD' | 'INTERIM' | 'GIMMICK'.  Gimmick titles (BMF-style) are not
  -- tied to a division and have no mandatory defence rules.
  title_type    text not null default 'STANDARD',
  -- Gimmick titles can be contested at any agreed catchweight.
  fixed_weight  boolean not null default true,
  belt_image_url text,
  prestige      int not null default 50,
  -- Months before a defence is mandatory. NULL = never strips.
  defence_window_months int,
  active        boolean not null default true
);

create table if not exists title_reign (
  id            uuid primary key default gen_random_uuid(),
  world_id      uuid not null references world(id) on delete cascade,
  title_id      uuid not null references title(id) on delete cascade,
  fighter_id    uuid not null references fighter(id),
  won_on        date not null,
  won_at_bout   uuid references bout(id),
  lost_on       date,
  -- 'DEFEAT' | 'VACATED' | 'STRIPPED' | 'RETIRED'
  ended_reason  text,
  defences      int not null default 0
);
create index if not exists idx_reign_current on title_reign (world_id, title_id) where lost_on is null;

-- --------------------------------------------------------- bonuses --------
-- Default amounts live on the promotion; the player can override per event.
alter table promotion add column if not exists bonus_settings jsonb
  not null default '{"fotn":50000,"potn":50000,"potn_mode":"TWO","auto_award":false}';
-- potn_mode: 'TWO' (one KO + one sub) | 'ONE' (single best performance) | 'OFF'

create table if not exists event_bonus (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references event(id) on delete cascade,
  -- 'FOTN' | 'POTN_KO' | 'POTN_SUB' | 'POTN' | 'DISCRETIONARY'
  bonus_type    text not null,
  fighter_id    uuid not null references fighter(id),
  bout_id       uuid references bout(id),
  amount        bigint not null,
  -- True when the game auto-selected rather than the player choosing.
  auto_awarded  boolean not null default false,
  -- Morale bump applied to the fighter; recorded so the UI can explain it.
  morale_delta  int not null default 0,
  awarded_on    date not null
);
create index if not exists idx_bonus_event on event_bonus (event_id);

-- Bonus payouts must come out of promotion funds. Enforced in the edge
-- function, not here — a trigger would fight the deterministic tick model.

-- -------------------------------------------------- venues & requests -----
alter table arena add column if not exists venue_type text not null default 'ARENA';
-- 'ARENA' | 'THEATER' | 'CASINO' | 'STADIUM' | 'CLUB' | 'FAIRGROUND' | 'APEX'
alter table arena add column if not exists country_code text;
alter table arena add column if not exists min_prestige int not null default 0;
-- Typical lead time the venue expects, in days. Big arenas book a year out.
alter table arena add column if not exists lead_time_days int not null default 60;

create table if not exists venue_request (
  id            uuid primary key default gen_random_uuid(),
  world_id      uuid not null references world(id) on delete cascade,
  promotion_id  uuid not null references promotion(id) on delete cascade,
  arena_id      uuid not null references arena(id),
  requested_on  date not null,
  target_date   date not null,
  -- 'PENDING' | 'APPROVED' | 'REJECTED' | 'COUNTERED' | 'WITHDRAWN'
  status        text not null default 'PENDING',
  -- Venues sometimes counter with a different date rather than refusing.
  countered_date date,
  quoted_cost   bigint,
  -- Shown to the player so a rejection teaches them something.
  reason        text,
  resolves_on   date not null
);
create index if not exists idx_venue_req on venue_request (world_id, promotion_id, status);

-- ------------------------------------------------------ customisation -----
alter table promotion add column if not exists branding jsonb
  not null default '{}';
-- {"primary_color":"#c8102e","secondary_color":"#101010","cage_type":"OCTAGON",
--  "canvas_text":"APEX","announcer":"...","ruleset_default":"MMA_3",
--  "intro_style":"CINEMATIC","banner_url":null}

-- Logos go in Supabase Storage (free tier, 1 GB) — store the path only.
alter table promotion add column if not exists logo_path text;

-- --------------------------------------------------------- spectating -----
-- No new table needed: bout.result already holds the full play-by-play, and
-- world membership already grants read access via RLS. A player watching a
-- rival's event is a READ of bout.result with the booking controls hidden.
--
-- The only guard needed is write isolation: a player must never mutate a
-- promotion they don't own. The blanket in_world() policy from schema.sql is
-- too permissive for that, so replace it.
drop policy if exists "members rw promotions" on promotion;
create policy "read any promotion in world" on promotion
  for select using (in_world(world_id));
create policy "write only own promotion" on promotion
  for update using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "members rw events" on event;
create policy "read any event in world" on event
  for select using (in_world(world_id));
create policy "write only own events" on event
  for all using (
    exists (select 1 from promotion p
            where p.id = event.promotion_id and p.owner_user_id = auth.uid())
  );

drop policy if exists "members rw contracts" on contract;
create policy "read any contract in world" on contract
  for select using (in_world(world_id));
create policy "write only own contracts" on contract
  for all using (
    exists (select 1 from promotion p
            where p.id = contract.promotion_id and p.owner_user_id = auth.uid())
  );

alter table division            enable row level security;
alter table title               enable row level security;
alter table title_reign         enable row level security;
alter table event_bonus         enable row level security;
alter table venue_request       enable row level security;
alter table fighter_relationship enable row level security;

create policy "read divisions" on division for select using (
  exists (select 1 from promotion p where p.id = division.promotion_id and in_world(p.world_id)));
create policy "write own divisions" on division for all using (
  exists (select 1 from promotion p where p.id = division.promotion_id and p.owner_user_id = auth.uid()));

create policy "read titles" on title for select using (
  exists (select 1 from promotion p where p.id = title.promotion_id and in_world(p.world_id)));
create policy "write own titles" on title for all using (
  exists (select 1 from promotion p where p.id = title.promotion_id and p.owner_user_id = auth.uid()));

create policy "read reigns" on title_reign for select using (in_world(world_id));
create policy "read bonuses" on event_bonus for select using (
  exists (select 1 from event e where e.id = event_bonus.event_id and in_world(e.world_id)));
create policy "write own bonuses" on event_bonus for all using (
  exists (select 1 from event e join promotion p on p.id = e.promotion_id
          where e.id = event_bonus.event_id and p.owner_user_id = auth.uid()));
create policy "own venue requests" on venue_request for all using (
  exists (select 1 from promotion p where p.id = venue_request.promotion_id and p.owner_user_id = auth.uid()));
create policy "read relationships" on fighter_relationship for select using (in_world(world_id));
