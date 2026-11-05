// First Downs Leaders board (backlog item 156).
//
// Per-position (RB/WR/TE) first-down leaders over the last 3 completed
// weeks — the season-long "who is actually moving the chains"
// reference board. First downs are the stick-moving read behind snap
// share and target volume: a player earning first downs earns the
// next snap and the next target, and the rush/rec split shows whether
// the chains move on the ground or through the air. Ranked by first
// downs per game so a 2-game window can't outrank a 3-game one on raw
// totals. Pure NFL data (Sleeper's free public weekly stats),
// no league needed, so guests get the full board like the /targets,
// /red-zone, /air-yards, /deep-plays, /catch-rate, /yac, /ypr,
// /ypc, /scrimmage, /touchdowns, /passing, and /target-volume pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const FIRST_DOWN_POSITIONS = ['RB', 'WR', 'TE'] as const;
export type FirstDownPosition = (typeof FIRST_DOWN_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const FIRST_DOWN_MIN_GAMES = 2;
/** Leaders kept. */
export const MAX_FIRST_DOWN_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface FirstDownLeader {
  player: PoolPlayer;
  /** First downs (rushing + receiving) over the recent window. */
  firstDowns: number;
  /** First downs per game over the recent window. */
  firstDownsPerGame: number;
  /** Rushing first downs over the recent window. */
  rushFd: number;
  /** Receiving first downs over the recent window. */
  recFd: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface FirstDownLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-position first-down leaders over the last 3 completed weeks
 * (week < currentWeek, week >= currentWeek - 3), min 2 games,
 * ranked by first downs per game descending (ties broken by total
 * first downs, then rushing first downs), top 15 per position.
 * Players with no first downs never lead the board. Returns a Map
 * keyed by position; a position's entry is absent when no player
 * qualifies.
 */
export function buildFirstDownLeaders(
  input: FirstDownLeadersInput,
): Map<FirstDownPosition, FirstDownLeader[]> {
  const out = new Map<FirstDownPosition, FirstDownLeader[]>();
  for (const pos of FIRST_DOWN_POSITIONS) {
    const rows: FirstDownLeader[] = [];
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
      if (entries.length < FIRST_DOWN_MIN_GAMES) continue;

      const rushFd = entries.reduce((s, e) => s + e.line.rushFd, 0);
      const recFd = entries.reduce((s, e) => s + e.line.recFd, 0);
      const firstDowns = rushFd + recFd;
      if (firstDowns <= 0) continue;
      rows.push({
        player: p,
        firstDowns,
        firstDownsPerGame: round1(firstDowns / entries.length),
        rushFd,
        recFd,
        games: entries.length,
      });
    }
    rows.sort(
      (a, b) =>
        b.firstDownsPerGame - a.firstDownsPerGame ||
        b.firstDowns - a.firstDowns ||
        b.rushFd - a.rushFd,
    );
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_FIRST_DOWN_LEADERS));
  }
  return out;
}
