-- TraderApe league database schema.
-- Run this in the Supabase SQL editor (or via the Supabase CLI).
--
-- Design:
--   * `leagues` holds one row per synced league. The full normalized League
--     object (as produced by the client's Yahoo/Sleeper/ESPN adapters) is
--     stored in `snapshot` as JSONB; the client already knows how to render
--     it, so the server never re-parses platform data.
--   * `league_pins` maps a short human-typable PIN to a league. Anyone with
--     the PIN can READ that league's snapshot; only the admin key can WRITE.
--   * Row Level Security is enabled with NO public policies: all access goes
--     through the Vercel server endpoints using the service-role key.

create table if not exists leagues (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'yahoo',
  platform_league_key text not null unique,
  name text not null,
  season integer not null,
  team_count integer,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz
);

create table if not exists league_pins (
  pin text primary key,
  league_id uuid not null references leagues(id) on delete cascade,
  label text,
  created_at timestamptz not null default now()
);

create index if not exists idx_leagues_season on leagues(season);
create index if not exists idx_league_pins_league on league_pins(league_id);

alter table leagues enable row level security;
alter table league_pins enable row level security;

-- Intentionally no policies: the anon key can read nothing. The Vercel
-- endpoints (api/league-sync, api/league-pin, api/league-data) use the
-- service-role key and enforce their own auth (admin key for writes,
-- PIN possession for reads).
