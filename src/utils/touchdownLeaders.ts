// Touchdown Leaders board (backlog item 153).
//
// Per-position (RB/WR/TE) touchdown leaders over the last 3
// completed weeks — the season-long "who is actually scoring"
// reference board. Total TDs are Sleeper's rush_td + rec_td, both
// mapped in WeeklyUsageLine (this item), so the board prices the
// scoring read itself: the buy-low / sell-high companion to the
// Red Zone Leaders board (item 145), which prices the opportunity
// (red-zone opps) while this board prices the conversion. Ranked by
// TDs per game so a 2-game window can't outrank a 3-game one on raw
// totals. Pure NFL data (Sleeper's free public weekly stats), no
// league needed, so guests get the full board like the /targets,
// /red-zone, /air-yards, /deep-plays, /catch-rate, /yac, /ypr,
// /ypc, and /scrimmage pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const TOUCHDOWN_POSITIONS = ['RB', 'WR', 'TE'] as const;
export type TouchdownPosition = (typeof TOUCHDOWN_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const TOUCHDOWN_MIN_GAMES = 2;
/** Leaders kept per position. */
export const MAX_TOUCHDOWN_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface TouchdownLeader {
  player: PoolPlayer;
  /** Total touchdowns (rushing + receiving) over the recent window. */
  touchdowns: number;
  /** Rushing touchdowns in the window. */
  rushTd: number;
  /** Receiving touchdowns in the window. */
  recTd: number;
  /** Carries + receptions in the window (final tie-break). */
  touches: number;
  /** Touchdowns per game over the recent window. */
  touchdownsPerGame: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface TouchdownLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-position touchdown leaders over the last 3 completed weeks
 * (week < currentWeek, week >= currentWeek - 3), min 2 games,
 * ranked by touchdowns per game descending (ties broken by total
 * touchdowns, then touches), top 15 per position. Players with no
 * touchdowns never lead a board. Returns a Map keyed by position;
 * positions with no leaders are absent.
 */
export function buildTouchdownLeaders(
  input: TouchdownLeadersInput,
): Map<TouchdownPosition, TouchdownLeader[]> {
  const out = new Map<TouchdownPosition, TouchdownLeader[]>();
  for (const pos of TOUCHDOWN_POSITIONS) {
    const rows: TouchdownLeader[] = [];
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
      if (entries.length < TOUCHDOWN_MIN_GAMES) continue;

      const rushTd = entries.reduce((s, e) => s + e.line.rushTd, 0);
      const recTd = entries.reduce((s, e) => s + e.line.recTd, 0);
      const touchdowns = rushTd + recTd;
      if (touchdowns <= 0) continue;
      const touches = entries.reduce(
        (s, e) => s + e.line.rushAtt + e.line.receptions,
        0,
      );
      rows.push({
        player: p,
        touchdowns,
        rushTd,
        recTd,
        touches,
        touchdownsPerGame: round1(touchdowns / entries.length),
        games: entries.length,
      });
    }
    rows.sort(
      (a, b) =>
        b.touchdownsPerGame - a.touchdownsPerGame ||
        b.touchdowns - a.touchdowns ||
        b.touches - a.touches,
    );
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_TOUCHDOWN_LEADERS));
  }
  return out;
}
