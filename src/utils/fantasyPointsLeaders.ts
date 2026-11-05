// Fantasy Points Leaders board (backlog item 158).
//
// Per-position (QB/RB/WR/TE) PPR fantasy-points leaders over the
// last 3 completed weeks — the season-long "who is actually scoring"
// reference board. PPR points per game is the number every start/sit,
// waiver, and trade call is ultimately judged against, and the only
// board where QBs belong alongside the skill positions. Ranked by
// points per game so a 2-game window can't outrank a 3-game one on
// raw totals. Pure NFL data (Sleeper's free public weekly stats),
// no league needed, so guests get the full board like the /targets,
// /red-zone, /air-yards, /deep-plays, /catch-rate, /yac, /ypr,
// /ypc, /scrimmage, /touchdowns, /passing, /target-volume,
// /first-downs, and /touches pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const FANTASY_POINTS_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;
export type FantasyPointsPosition =
  (typeof FANTASY_POINTS_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const FANTASY_POINTS_MIN_GAMES = 2;
/** Leaders kept. */
export const MAX_FANTASY_POINTS_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface FantasyPointsLeader {
  player: PoolPlayer;
  /** Total PPR fantasy points over the recent window. */
  ptsPpr: number;
  /** PPR fantasy points per game over the recent window. */
  ptsPerGame: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface FantasyPointsLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-position PPR fantasy-points leaders over the last 3 completed
 * weeks (week < currentWeek, week >= currentWeek - 3), min 2 games,
 * ranked by points per game descending (ties broken by total points,
 * then games played), top 15 per position. Players with no points
 * never lead the board. Returns a Map keyed by position; a position's
 * entry is absent when no player qualifies.
 */
export function buildFantasyPointsLeaders(
  input: FantasyPointsLeadersInput,
): Map<FantasyPointsPosition, FantasyPointsLeader[]> {
  const out = new Map<FantasyPointsPosition, FantasyPointsLeader[]>();
  for (const pos of FANTASY_POINTS_POSITIONS) {
    const rows: FantasyPointsLeader[] = [];
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
      if (entries.length < FANTASY_POINTS_MIN_GAMES) continue;

      const ptsPpr = entries.reduce((s, e) => s + e.line.ptsPpr, 0);
      if (ptsPpr <= 0) continue;
      rows.push({
        player: p,
        ptsPpr: round1(ptsPpr),
        ptsPerGame: round1(ptsPpr / entries.length),
        games: entries.length,
      });
    }
    rows.sort(
      (a, b) =>
        b.ptsPerGame - a.ptsPerGame ||
        b.ptsPpr - a.ptsPpr ||
        b.games - a.games,
    );
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_FANTASY_POINTS_LEADERS));
  }
  return out;
}
