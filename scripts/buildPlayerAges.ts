// Build the player-age file for the Dynasty Rankings page (backlog item
// 177): ages at the season start for every bundled pool player that has a
// Sleeper id, from Sleeper's free public players endpoint (no auth) — the
// same source the app's other Sleeper reads use. Birth dates are public
// roster data; only the computed age is stored, never the birth date.
//
// Usage: `npm run build:ages` — writes src/data/playerAges.<season>.json.
// Idempotent: re-running overwrites with the same ages. Players without a
// Sleeper id or without a birth date are omitted; the dynasty model prices
// them on their raw projection (age factor 1.0) and shows "—" for age.

import { readFileSync, writeFileSync } from 'node:fs';

const UA = 'TraderApe (github.com/AndrewJSides/FantasyFootballAnalyzer)';
const SEASON = 2026;
// Season start: ages are priced as of opening week, not the build date, so
// a rebuild mid-season doesn't silently re-price the board.
const REF_DATE = '2026-09-01';
const PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl';
const POOL_PATH = `src/data/draftPool.${SEASON}.json`;
const OUT_PATH = `src/data/playerAges.${SEASON}.json`;

export interface SleeperPlayerRow {
  birth_date?: string;
}

/** Full years lived on the reference date, from a YYYY-MM-DD birth date. */
export function ageOn(birthDate: string, refDate: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate);
  if (!m) return null;
  const [, y, mo, d] = m;
  const by = Number(y);
  const bm = Number(mo);
  const bd = Number(d);
  const [ry, rm, rd] = refDate.split('-').map(Number);
  if (![by, bm, bd, ry, rm, rd].every(Number.isFinite)) return null;
  if (bm < 1 || bm > 12 || bd < 1 || bd > 31) return null;
  let age = ry - by;
  if (rm < bm || (rm === bm && rd < bd)) age -= 1;
  return age;
}

/** Ages for the given Sleeper ids, keyed by Sleeper id. Skips ids with no
 * player row or no usable birth date. */
export function buildAges(
  players: Record<string, SleeperPlayerRow>,
  sleeperIds: string[],
  refDate: string,
): Record<string, number> {
  const ages: Record<string, number> = {};
  for (const id of sleeperIds) {
    const row = players[id];
    if (!row?.birth_date) continue;
    const age = ageOn(row.birth_date, refDate);
    if (age === null || age < 16 || age > 50) continue;
    ages[id] = age;
  }
  return ages;
}

async function getJson<T>(url: string): Promise<T> {
  // Retry once on a transport failure: the sandbox proxy aggressively closes
  // pooled keep-alive connections (observed Nov 2, 2026 on the projection
  // snapshot script).
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

async function main(): Promise<void> {
  const pool = JSON.parse(readFileSync(POOL_PATH, 'utf8')) as {
    players: Array<{ sleeperId?: string }>;
  };
  const sleeperIds = pool.players
    .map(p => p.sleeperId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  const players = await getJson<Record<string, SleeperPlayerRow>>(PLAYERS_URL);
  const ages = buildAges(players, sleeperIds, REF_DATE);
  writeFileSync(
    OUT_PATH,
    JSON.stringify(
      { season: SEASON, asOf: REF_DATE, generatedAt: new Date().toISOString(), ages },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  console.log(
    `Wrote ${OUT_PATH}: ${Object.keys(ages).length} ages for ${sleeperIds.length} pool Sleeper ids`,
  );
}

const isMain = process.argv[1]?.endsWith('buildPlayerAges.ts');
if (isMain) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
