// Passer Rating Leaders board (backlog item 186).
//
// Quarterbacks ranked by NFL passer rating over the last 3
// completed weeks — the season-long "who's actually throwing it
// well" reference board. The efficiency read the volume boards
// can't give: the Passing Yards board (item 154) ranks yardage and
// the Pass Attempts board (item 167) ranks volume, so a QB can lead
// both on 45 attempts a game while completing 55% with picks and
// nothing on the site says so. Passer rating is the one-number
// efficiency read — accuracy + explosiveness + scoring + ball
// security — behind every QB start/sit call and QB streamer pick.
// Priced on Sleeper's free public weekly stats: the board sums the
// four components (pass_cmp / pass_att / pass_yd / pass_td /
// pass_int) across the window and applies the NFL's standard public
// formula once, which is the correct window rating (averaging
// Sleeper's per-week pass_rtg would not be). Pure NFL data, no
// league needed, so guests get the full board like the /passing,
// /pass-attempts, and /qb-rushing pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const PASSER_RATING_MIN_GAMES = 2;
/** Minimum pass attempts per game on average — a trick-play passer
 *  going 3-for-3 must not top an efficiency board. Starters throw
 *  ~30 a game; 20 keeps every real starter and every spot starter
 *  with a real workload. */
export const PASSER_RATING_MIN_ATTEMPTS_PER_GAME = 20;
/** Leaders kept. */
export const MAX_PASSER_RATING_LEADERS = 15;
/** The NFL passer rating scale tops out at 158.3 (a perfect game). */
export const MAX_PASSER_RATING = 158.3;

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Each of the four rating components is clamped to [0, 2.375]. */
const clampComponent = (n: number): number =>
  Math.min(2.375, Math.max(0, n));

/**
 * The NFL passer rating from summed window components — the
 * standard public formula. Returns 0 with no attempts.
 */
export function passerRating(
  cmp: number,
  att: number,
  yds: number,
  td: number,
  int: number,
): number {
  if (att <= 0) return 0;
  const a = clampComponent(((cmp / att) - 0.3) * 5);
  const b = clampComponent(((yds / att) - 3) * 0.25);
  const c = clampComponent((td / att) * 20);
  const d = clampComponent(2.375 - ((int / att) * 25));
  return round1(((a + b + c + d) / 6) * 100);
}

export interface PasserRatingLeader {
  player: PoolPlayer;
  /** NFL passer rating over the recent window (components summed
   *  across the window, formula applied once). */
  rating: number;
  /** Completion percentage over the window. */
  cmpPct: number;
  /** Passing yards per attempt over the window. */
  ydsPerAtt: number;
  /** Passing yards in the window (tiebreak). */
  passYards: number;
  /** Passing touchdowns in the window. */
  passTd: number;
  /** Interceptions thrown in the window. */
  passInt: number;
  /** Pass attempts in the window. */
  passAtt: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface PasserRatingLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * QB passer-rating leaders over the last 3 completed weeks (week <
 * currentWeek, week >= currentWeek - 3), min 2 games and min 20
 * pass attempts per game on average, ranked by passer rating
 * descending (ties broken by total passing yards, then passing
 * touchdowns), top 15. QBs with no pass attempts never lead the
 * board. Returns the leaders array (empty when none).
 */
export function buildPasserRatingLeaders(
  input: PasserRatingLeadersInput,
): PasserRatingLeader[] {
  const rows: PasserRatingLeader[] = [];
  for (const p of input.poolPlayers) {
    if (p.pos.toUpperCase() !== 'QB') continue;
    const entries = Object.entries(input.usageBySleeperId[p.sleeperId ?? ''] ?? {})
      .map(([w, line]) => ({ week: Number(w), line }))
      .filter(
        e =>
          Number.isFinite(e.week) &&
          e.week < input.currentWeek &&
          e.week >= input.currentWeek - 3,
      );
    if (entries.length < PASSER_RATING_MIN_GAMES) continue;

    const passAtt = entries.reduce((s, e) => s + e.line.passAtt, 0);
    if (passAtt < PASSER_RATING_MIN_ATTEMPTS_PER_GAME * entries.length) continue;
    const passCmp = entries.reduce((s, e) => s + e.line.passCmp, 0);
    const passYards = entries.reduce((s, e) => s + e.line.passYards, 0);
    const passTd = entries.reduce((s, e) => s + e.line.passTd, 0);
    const passInt = entries.reduce((s, e) => s + (e.line.passInt ?? 0), 0);
    if (passAtt <= 0) continue;

    rows.push({
      player: p,
      rating: passerRating(passCmp, passAtt, passYards, passTd, passInt),
      cmpPct: round1((passCmp / passAtt) * 100),
      ydsPerAtt: round1(passYards / passAtt),
      passYards,
      passTd,
      passInt,
      passAtt,
      games: entries.length,
    });
  }
  rows.sort(
    (a, b) =>
      b.rating - a.rating ||
      b.passYards - a.passYards ||
      b.passTd - a.passTd,
  );
  return rows.slice(0, MAX_PASSER_RATING_LEADERS);
}
