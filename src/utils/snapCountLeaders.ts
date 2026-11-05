// Snap Count Leaders board (backlog item 159).
//
// Per-position (RB/WR/TE) snap-share leaders over the last 3
// completed weeks — the season-long "who is actually on the field"
// reference board. Snap share is the purest opportunity read: a
// player can only score when he is on the field, and a rising share
// usually comes before rising fantasy points. Ranked by snap share
// (total offensive snaps / total team offensive snaps over the
// window) so a 2-game window can't outrank a 3-game one on raw
// totals. QBs are excluded — starters sit near 100% of snaps, so
// ranking them is noise; FantasyPros' snap-count analysis likewise
// focuses on the skill positions. Pure NFL data (Sleeper's free
// public weekly stats), no league needed, so guests get the full
// board like the /targets, /red-zone, /air-yards, /deep-plays,
// /catch-rate, /yac, /ypr, /ypc, /scrimmage, /touchdowns,
// /passing, /target-volume, /first-downs, /touches, and
// /fantasy-points pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const SNAP_COUNT_POSITIONS = ['RB', 'WR', 'TE'] as const;
export type SnapCountPosition = (typeof SNAP_COUNT_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const SNAP_COUNT_MIN_GAMES = 2;
/** Leaders kept. */
export const MAX_SNAP_COUNT_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface SnapCountLeader {
  player: PoolPlayer;
  /** Total offensive snaps over the recent window. */
  snaps: number;
  /** Snap share over the recent window, as a percentage (0–100). */
  snapSharePct: number;
  /** Offensive snaps per game over the recent window. */
  snapsPerGame: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface SnapCountLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-position snap-share leaders over the last 3 completed weeks
 * (week < currentWeek, week >= currentWeek - 3), min 2 games,
 * ranked by snap share descending (ties broken by total snaps,
 * then games played), top 15 per position. Weeks with no team-snap
 * denominator are skipped for the share but still count as a game
 * played. Players with no snaps never lead the board. Returns a Map
 * keyed by position; a position's entry is absent when no player
 * qualifies.
 */
export function buildSnapCountLeaders(
  input: SnapCountLeadersInput,
): Map<SnapCountPosition, SnapCountLeader[]> {
  const out = new Map<SnapCountPosition, SnapCountLeader[]>();
  for (const pos of SNAP_COUNT_POSITIONS) {
    const rows: SnapCountLeader[] = [];
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
      if (entries.length < SNAP_COUNT_MIN_GAMES) continue;

      const snaps = entries.reduce((s, e) => s + e.line.offSnaps, 0);
      if (snaps <= 0) continue;
      // The share prices only weeks with a team-snap denominator, so
      // a missing denominator can't inflate the share past 100%.
      const shareEntries = entries.filter(e => e.line.teamSnaps > 0);
      const shareSnaps = shareEntries.reduce((s, e) => s + e.line.offSnaps, 0);
      const teamSnaps = shareEntries.reduce((s, e) => s + e.line.teamSnaps, 0);
      if (teamSnaps <= 0) continue;
      rows.push({
        player: p,
        snaps,
        snapSharePct: round1((shareSnaps / teamSnaps) * 100),
        snapsPerGame: round1(snaps / entries.length),
        games: entries.length,
      });
    }
    rows.sort(
      (a, b) =>
        b.snapSharePct - a.snapSharePct ||
        b.snaps - a.snaps ||
        b.games - a.games,
    );
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_SNAP_COUNT_LEADERS));
  }
  return out;
}
