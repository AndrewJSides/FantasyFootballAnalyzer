// Snapshots one week's projections for every player, so predictions can be
// scored against actuals later. This is the raw material for the backtest
// harness: without a snapshot taken BEFORE kickoff, a week's predictions are
// gone for good — neither Yahoo nor Sleeper serves past weeks' projections
// after the fact (their endpoints return actuals once the week is played).
//
// Source v1: Sleeper (free, no auth). Yahoo snapshots are a follow-up: they
// need a connected Yahoo session plus a write route, neither of which exists
// yet (see the feature backlog).
//
// Usage: `npm run snapshot:projections` — snapshots the current NFL week per
// Sleeper's state endpoint. `--season= --week=` override; `--force` overwrites
// an existing snapshot for the week. Exits 0 without writing when the week's
// snapshot already exists, so the hourly loop can run this as a duty.
//
// Output: data/projection-snapshots/<season>-week<week>-sleeper.json plus an
// index.json in the same directory listing every snapshot.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const UA = 'TraderApe (github.com/AndrewJSides/FantasyFootballAnalyzer)';
const OUT_DIR = 'data/projection-snapshots';

interface SleeperState {
  season: string;
  week: number;
  season_type: string;
}

interface SleeperProjectionEntry {
  player_id: string | number;
  stats?: Record<string, number>;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function main(): Promise<void> {
  const arg = (name: string): string | undefined => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit?.split('=')[1];
  };
  const force = process.argv.includes('--force');

  const state = await getJson<SleeperState>('https://api.sleeper.app/v1/state/nfl');
  const season = Number(arg('season') ?? state.season);
  const week = Number(arg('week') ?? state.week);
  if (!season || !week) throw new Error(`Bad season/week from state: ${JSON.stringify(state)}`);

  const file = `${season}-week${week}-sleeper.json`;
  const path = join(OUT_DIR, file);
  if (existsSync(path) && !force) {
    console.log(`Snapshot already exists: ${path} (use --force to overwrite)`);
    return;
  }

  const entries = await getJson<SleeperProjectionEntry[]>(
    `https://api.sleeper.app/projections/nfl/${season}/${week}?season_type=regular`,
  );
  const players = entries
    .filter((e) => e.stats && Object.keys(e.stats).length > 0)
    .map((e) => ({ player_id: String(e.player_id), stats: e.stats! }));

  // Guard against writing an empty off-season snapshot over real data.
  if (players.length < 100) {
    throw new Error(`Only ${players.length} projected players for ${season} week ${week}; refusing to snapshot`);
  }

  const snapshot = {
    source: 'sleeper',
    season,
    week,
    season_type: 'regular',
    snapshot_at: new Date().toISOString(),
    player_count: players.length,
    players,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`);

  const indexPath = join(OUT_DIR, 'index.json');
  const index = existsSync(indexPath)
    ? (JSON.parse(readFileSync(indexPath, 'utf8')) as Array<Record<string, unknown>>)
    : [];
  const entry = {
    source: 'sleeper',
    season,
    week,
    file,
    snapshot_at: snapshot.snapshot_at,
    player_count: players.length,
  };
  const rest = index.filter(
    (i) => !(i.source === 'sleeper' && i.season === season && i.week === week),
  );
  rest.push(entry);
  rest.sort((a, b) => Number(a.season) - Number(b.season) || Number(a.week) - Number(b.week));
  writeFileSync(indexPath, `${JSON.stringify(rest, null, 2)}\n`);

  console.log(`Snapshotted ${players.length} Sleeper projections: ${path}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
