// Points Per Snap Leaders board (backlog item 189).
//
// Per-position (RB/WR/TE) full-PPR-points-per-offensive-snap leaders
// over the last 3 completed weeks — the season-long "who makes the most
// of every snap he's on the field for" reference board. Pts/snap is
// Sleeper's pts_ppr over off_snp, and the 20-snap floor keeps a
// one-snap touchdown off the board (same floor discipline as
// FullTime Fantasy's 20-snap efficiency requirement, and the YPT
// board's 10-target minimum, item 188). Distinct from Efficiency
// (item 105), which prices the per-touch read, and Snap Count Leaders
// (item 159), which ranks volume: a part-time back can be wildly
// efficient per snap while a workhorse grinds volume, and a low
// pts/snap player is living on snaps, not production. Both components
// are already mapped in WeeklyUsageLine, so no new fetch or field
// mapping. Pure NFL data (Sleeper's free public weekly stats), no
// league needed, so guests get the full board like the /ypt, /rookies,
// and /efficiency pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const PTS_PER_SNAP_POSITIONS = ['RB', 'WR', 'TE'] as const;
export type PtsPerSnapPosition = (typeof PTS_PER_SNAP_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const PTS_PER_SNAP_MIN_GAMES = 2;
/** 20+ snaps so a one-snap touchdown can't top the board. */
export const PTS_PER_SNAP_MIN_SNAPS = 20;
/** Leaders kept per position. */
export const MAX_PTS_PER_SNAP_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface PtsPerSnapLeader {
  player: PoolPlayer;
  /** Full-PPR points per offensive snap over the recent window. */
  ptsPerSnap: number;
  /** Full-PPR points in the window. */
  points: number;
  /** Offensive snaps in the window. */
  snaps: number;
  /** Full-PPR points per game over the window. */
  ptsPerGame: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface PtsPerSnapLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-position points-per-snap leaders over the last 3 completed weeks
 * (week < currentWeek, week >= currentWeek - 3), min 2 games and 20
 * snaps in the window, ranked by points per snap descending (ties
 * broken by points per game, then snaps), top 15 per position. Players
 * with no snaps or no points never lead a board. Returns a Map keyed
 * by position; positions with no leaders are absent.
 */
export function buildPtsPerSnapLeaders(
  input: PtsPerSnapLeadersInput,
): Map<PtsPerSnapPosition, PtsPerSnapLeader[]> {
  const out = new Map<PtsPerSnapPosition, PtsPerSnapLeader[]>();
  for (const pos of PTS_PER_SNAP_POSITIONS) {
    const rows: PtsPerSnapLeader[] = [];
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
      if (entries.length < PTS_PER_SNAP_MIN_GAMES) continue;

      const snaps = entries.reduce((s, e) => s + e.line.offSnaps, 0);
      // A leaders board has no room for a small-sample fluke.
      if (snaps < PTS_PER_SNAP_MIN_SNAPS) continue;
      const points = entries.reduce((s, e) => s + e.line.ptsPpr, 0);
      if (points <= 0) continue;
      rows.push({
        player: p,
        ptsPerSnap: round2(points / snaps),
        points: round1(points),
        snaps,
        ptsPerGame: round1(points / entries.length),
        games: entries.length,
      });
    }
    rows.sort(
      (a, b) => b.ptsPerSnap - a.ptsPerSnap || b.ptsPerGame - a.ptsPerGame || b.snaps - a.snaps,
    );
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_PTS_PER_SNAP_LEADERS));
  }
  return out;
}
