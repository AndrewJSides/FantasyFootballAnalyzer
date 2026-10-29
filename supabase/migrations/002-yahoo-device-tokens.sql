-- TraderApe Yahoo device-token storage (migration 002).
-- Run this in the Supabase SQL editor.
--
-- Design:
--   * `yahoo_connections` holds one row per Yahoo account (keyed by the
--     Yahoo user GUID): the OAuth access + refresh tokens, server-side, so
--     connecting once on any device lights up every device.
--   * `yahoo_devices` maps a random per-browser device id to a Yahoo
--     account. A new device links itself by entering the 6-digit pairing
--     code shown on an already-connected device (single-use, 10-minute
--     expiry). The browser never needs the Yahoo password again.
--   * Row Level Security is enabled with NO public policies: all access goes
--     through the Vercel server endpoints using the service-role key, same
--     as the leagues / league_pins tables.
--   * Tokens are stored as received from Yahoo (no column encryption). They
--     grant access to the owner's Yahoo fantasy data; treat the Supabase
--     project as the trust boundary, same as the ADMIN_SYNC_KEY.

create table if not exists yahoo_connections (
  yahoo_guid text primary key,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists yahoo_devices (
  device_id text primary key,
  yahoo_guid text references yahoo_connections(yahoo_guid) on delete cascade,
  pairing_code text,
  pairing_expires timestamptz,
  created_at timestamptz not null default now()
);

alter table yahoo_connections enable row level security;
alter table yahoo_devices enable row level security;
-- No policies: service-role bypasses RLS; nothing else can read or write.
