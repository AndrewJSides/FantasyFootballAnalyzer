// Rookie Leaders board (backlog item 187).
//
// Per-position (QB/RB/WR/TE) rookie PPR fantasy-points leaders over
// the last 3 completed weeks — the season-long "which rookies are
// breaking out right now" reference board. FantasyPros' Dynasty
// Rookie Draft Rankings price rookies on preseason expert consensus;
// this board prices them on what they have actually done since
// kickoff, which is the read a redraft waiver or trade call needs
// and the dynasty watch-list signal. Ranked by points per game so a
// 2-game window can't outrank a 3-game one on raw totals, with a
// touches column (rush attempts + receptions) so a fluke week on
// three touches reads differently from a real role. Pure NFL data
// (Sleeper's free public weekly stats, pts_ppr), no league needed,
// so guests get the full board like the /fantasy-points,
// /passing, /pass-attempts, and /qb-rushing pages. Rookies come
// from the bundled pool's rookie flag (PoolPlayer.rookie).

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const ROOKIE_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;
export type RookiePosition = (typeof ROOKIE_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const ROOKIE_MIN_GAMES = 2;
/** Leaders kept. */
export const MAX_ROOKIE_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface RookieLeader {
  player: PoolPlayer;
  /** Total PPR fantasy points over the recent window. */
  ptsPpr: number;
  /** PPR fantasy points per game over the recent window. */
  ptsPerGame: number;
  /** Touches (rush attempts + receptions) over the recent window. */
  touches: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface RookieLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-position rookie PPR fantasy-points leaders over the last 3
 * completed weeks (week < currentWeek, week >= currentWeek - 3),
 * min 2 games, ranked by points per game descending (ties broken by
 * total points, then touches, then games played), top 15 per
 * position. Non-rookies and players with no points never lead the
 * board. Returns a Map keyed by position; a position's entry is
 * absent when no rookie qualifies.
 */
export function buildRookieLeaders(
  input: RookieLeadersInput,
): Map<RookiePosition, RookieLeader[]> {
  const out = new Map<RookiePosition, RookieLeader[]>();
  for (const pos of ROOKIE_POSITIONS) {
    const rows: RookieLeader[] = [];
    for (const p of input.poolPlayers) {
      if (!p.rookie) continue;
      if (p.pos.toUpperCase() !== pos) continue;
      const entries = Object.entries(input.usageBySleeperId[p.sleeperId ?? ''] ?? {})
        .map(([w, line]) => ({ week: Number(w), line }))
        .filter(
          e =>
            Number.isFinite(e.week) &&
            e.week < input.currentWeek &&
            e.week >= input.currentWeek - 3,
        );
      if (entries.length < ROOKIE_MIN_GAMES) continue;

      const ptsPpr = entries.reduce((s, e) => s + e.line.ptsPpr, 0);
      if (ptsPpr <= 0) continue;
      const touches = entries.reduce(
        (s, e) => s + e.line.rushAtt + e.line.receptions,
        0,
      );
      rows.push({
        player: p,
        ptsPpr: round1(ptsPpr),
        ptsPerGame: round1(ptsPpr / entries.length),
        touches,
        games: entries.length,
      });
    }
    rows.sort(
      (a, b) =>
        b.ptsPerGame - a.ptsPerGame ||
        b.ptsPpr - a.ptsPpr ||
        b.touches - a.touches ||
        b.games - a.games,
    );
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_ROOKIE_LEADERS));
  }
  return out;
}
