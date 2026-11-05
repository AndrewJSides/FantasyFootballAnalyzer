// Catch Rate Leaders board (backlog item 148).
//
// Per-position (RB/WR/TE) catch-rate leaders over the last 3
// completed weeks — the season-long "who is actually converting
// his targets into catches" reference board. Catch rate is
// receptions over targets (Sleeper's rec / rec_tgt), and it is the
// conversion read the volume boards never priced: a receiver
// earning catchable targets separates from one living on
// uncatchable volume, and a collapsing catch rate is the earliest
// warning that a breakout's box score is about to regress. Pure
// NFL data (Sleeper's free public weekly stats), no league needed,
// so guests get the full board like the /targets, /red-zone,
// /air-yards, and /deep-plays pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const CATCH_RATE_POSITIONS = ['RB', 'WR', 'TE'] as const;
export type CatchRatePosition = (typeof CATCH_RATE_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const CATCH_RATE_MIN_GAMES = 2;
/** 10+ targets in the window so a 2-for-2 can't top the board. */
export const CATCH_RATE_MIN_TARGETS = 10;
/** Leaders kept per position. */
export const MAX_CATCH_RATE_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round4 = (n: number): number => Math.round(n * 10000) / 10000;

export interface CatchRateLeader {
  player: PoolPlayer;
  /** Receptions over targets in the window (0..1). */
  catchRate: number;
  /** Targets in the window. */
  targets: number;
  /** Receptions in the window. */
  receptions: number;
  /** Targets per game over the recent window. */
  targetsPerGame: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface CatchRateLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-position catch-rate leaders over the last 3 completed weeks
 * (week < currentWeek, week >= currentWeek - 3), min 2 games and
 * 10+ targets, ranked by catch rate descending (ties broken by
 * targets, then receptions), top 15 per position. Players with no
 * targets in the window never lead a board. Returns a Map keyed by
 * position; positions with no leaders are absent.
 */
export function buildCatchRateLeaders(
  input: CatchRateLeadersInput,
): Map<CatchRatePosition, CatchRateLeader[]> {
  const out = new Map<CatchRatePosition, CatchRateLeader[]>();
  for (const pos of CATCH_RATE_POSITIONS) {
    const rows: CatchRateLeader[] = [];
    for (const p of input.poolPlayers) {
      if (p.pos.toUpperCase() !== pos) continue;
      const entries = Object.entries(input.usageBySleeperId[p.sleeperId ?? ''] ?? {})
        .map(([w, line]) => ({ week: Number(w), line }))
        .filter(
          e =>
            Number.isFinite(e.week) &&
            e.week < input.currentWeek &&
            e.week >= input.currentWeek - 3,
        );
      if (entries.length < CATCH_RATE_MIN_GAMES) continue;

      const targets = entries.reduce((s, e) => s + e.line.targets, 0);
      // A leaders board has no room for a player with no targets, and
      // the 10-target floor keeps a 2-for-2 off the top.
      if (targets < CATCH_RATE_MIN_TARGETS) continue;
      const receptions = entries.reduce((s, e) => s + e.line.receptions, 0);
      rows.push({
        player: p,
        catchRate: round4(receptions / targets),
        targets,
        receptions,
        targetsPerGame: round1(targets / entries.length),
        games: entries.length,
      });
    }
    rows.sort(
      (a, b) =>
        b.catchRate - a.catchRate || b.targets - a.targets || b.receptions - a.receptions,
    );
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_CATCH_RATE_LEADERS));
  }
  return out;
}
