// Efficiency Leaders board (backlog item 105).
//
// Per-position (RB/WR/TE) fantasy-points-per-touch leaders over the last 3
// completed weeks — the "who's doing the most with every touch" reference
// board. Distinct from Snap Leaders (item 104), which ranks volume (snap
// share): a back can play every snap and still score little per touch, and
// a part-time back can be wildly efficient. Priced by joining two Sleeper
// free public weekly feeds the app already fetches at runtime — full-PPR
// points (sleeperWeeklyPoints) and touches (sleeperUsage: rush attempts +
// receptions) — so no new data source. League-independent, like the
// /snaps page: guests get the full board.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const EFFICIENCY_POSITIONS = ['RB', 'WR', 'TE'] as const;
export type EfficiencyPosition = (typeof EFFICIENCY_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const EFFICIENCY_MIN_GAMES = 2;
/**
 * 15+ touches over the window (~5/game) so a one-carry touchdown can't
 * top the board.
 */
export const EFFICIENCY_MIN_TOUCHES = 15;
/** Leaders kept per position. */
export const MAX_EFFICIENCY_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface EfficiencyLeader {
  player: PoolPlayer;
  /** Full-PPR points per touch over the recent window. */
  ptsPerTouch: number;
  /** Total touches (rush attempts + receptions) over the window. */
  touches: number;
  /** Touches per game over the window. */
  touchesPerGame: number;
  /** Full-PPR points per game over the window. */
  ptsPerGame: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface EfficiencyLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Sleeper player id -> week -> full-PPR points. */
  pointsBySleeperId: Record<string, Record<number, number>>;
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-position points-per-touch leaders over the last 3 completed weeks
 * (week < currentWeek, week >= currentWeek - 3), min 2 games and 15
 * touches, ranked by points per touch descending (ties broken by touches
 * per game, then points per game), top 15 per position. Returns a Map
 * keyed by position; positions with no leaders are absent.
 */
export function buildEfficiencyLeaders(
  input: EfficiencyLeadersInput,
): Map<EfficiencyPosition, EfficiencyLeader[]> {
  const out = new Map<EfficiencyPosition, EfficiencyLeader[]>();
  for (const pos of EFFICIENCY_POSITIONS) {
    const rows: EfficiencyLeader[] = [];
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
      if (entries.length < EFFICIENCY_MIN_GAMES) continue;

      const touches = entries.reduce(
        (s, e) => s + e.line.rushAtt + e.line.receptions,
        0,
      );
      if (touches < EFFICIENCY_MIN_TOUCHES) continue;

      const points = entries.reduce(
        (s, e) => s + (input.pointsBySleeperId[p.sleeperId ?? '']?.[e.week] ?? 0),
        0,
      );
      rows.push({
        player: p,
        ptsPerTouch: round2(points / touches),
        touches,
        touchesPerGame: round1(touches / entries.length),
        ptsPerGame: round1(points / entries.length),
        games: entries.length,
      });
    }
    rows.sort(
      (a, b) =>
        b.ptsPerTouch - a.ptsPerTouch ||
        b.touchesPerGame - a.touchesPerGame ||
        b.ptsPerGame - a.ptsPerGame,
    );
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_EFFICIENCY_LEADERS));
  }
  return out;
}
