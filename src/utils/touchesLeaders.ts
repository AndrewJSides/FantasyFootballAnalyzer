// Touches Leaders board (backlog item 157).
//
// Per-position (RB/WR/TE) touches leaders over the last 3 completed
// weeks — the season-long "who is actually getting the ball"
// reference board. Touches (rushing attempts + receptions) per game
// is the single-number workload read behind every RB start/sit and
// waiver call, and the rush/rec split shows whether the volume comes
// on the ground or through the air. Ranked by touches per game so a
// 2-game window can't outrank a 3-game one on raw totals. Pure NFL
// data (Sleeper's free public weekly stats), no league needed, so
// guests get the full board like the /targets, /red-zone, /air-yards,
// /deep-plays, /catch-rate, /yac, /ypr, /ypc, /scrimmage,
// /touchdowns, /passing, /target-volume, and /first-downs pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const TOUCHES_POSITIONS = ['RB', 'WR', 'TE'] as const;
export type TouchesPosition = (typeof TOUCHES_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const TOUCHES_MIN_GAMES = 2;
/** Leaders kept. */
export const MAX_TOUCHES_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface TouchesLeader {
  player: PoolPlayer;
  /** Touches (rushing attempts + receptions) over the recent window. */
  touches: number;
  /** Touches per game over the recent window. */
  touchesPerGame: number;
  /** Rushing attempts over the recent window. */
  rushAtt: number;
  /** Receptions over the recent window. */
  receptions: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface TouchesLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-position touches leaders over the last 3 completed weeks
 * (week < currentWeek, week >= currentWeek - 3), min 2 games,
 * ranked by touches per game descending (ties broken by total
 * touches, then rushing attempts), top 15 per position.
 * Players with no touches never lead the board. Returns a Map
 * keyed by position; a position's entry is absent when no player
 * qualifies.
 */
export function buildTouchesLeaders(
  input: TouchesLeadersInput,
): Map<TouchesPosition, TouchesLeader[]> {
  const out = new Map<TouchesPosition, TouchesLeader[]>();
  for (const pos of TOUCHES_POSITIONS) {
    const rows: TouchesLeader[] = [];
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
      if (entries.length < TOUCHES_MIN_GAMES) continue;

      const rushAtt = entries.reduce((s, e) => s + e.line.rushAtt, 0);
      const receptions = entries.reduce((s, e) => s + e.line.receptions, 0);
      const touches = rushAtt + receptions;
      if (touches <= 0) continue;
      rows.push({
        player: p,
        touches,
        touchesPerGame: round1(touches / entries.length),
        rushAtt,
        receptions,
        games: entries.length,
      });
    }
    rows.sort(
      (a, b) =>
        b.touchesPerGame - a.touchesPerGame ||
        b.touches - a.touches ||
        b.rushAtt - a.rushAtt,
    );
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_TOUCHES_LEADERS));
  }
  return out;
}
