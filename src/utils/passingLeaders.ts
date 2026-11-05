// Passing Leaders board (backlog item 154).
//
// Quarterback passing leaders over the last 3 completed weeks —
// the season-long "who is throwing for the most yardage" reference
// board, and the first leaders board for the QB position (every
// board before it is RB/WR/TE). Pass yards are Sleeper's pass_yd
// and pass TDs are pass_td, both mapped in WeeklyUsageLine (this
// item), so the board prices the passing-volume read itself: the
// QB start/sit and streamer companion to the QB Streamers section
// (item 39), which prices one week while this board prices the
// last-three trend. Ranked by pass yards per game so a 2-game
// window can't outrank a 3-game one on raw totals. Pure NFL data
// (Sleeper's free public weekly stats), no league needed, so
// guests get the full board like the /targets, /red-zone,
// /air-yards, /deep-plays, /catch-rate, /yac, /ypr, /ypc,
// /scrimmage, and /touchdowns pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const PASSING_POSITIONS = ['QB'] as const;
export type PassingPosition = (typeof PASSING_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const PASSING_MIN_GAMES = 2;
/** Leaders kept. */
export const MAX_PASSING_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface PassingLeader {
  player: PoolPlayer;
  /** Passing yards over the recent window. */
  passYards: number;
  /** Passing yards per game over the recent window. */
  passYardsPerGame: number;
  /** Passing touchdowns in the window. */
  passTd: number;
  /** Passing touchdowns per game over the recent window. */
  passTdPerGame: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface PassingLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Quarterback passing leaders over the last 3 completed weeks
 * (week < currentWeek, week >= currentWeek - 3), min 2 games,
 * ranked by passing yards per game descending (ties broken by
 * total passing yards, then passing touchdowns), top 15.
 * Players with no passing yards never lead the board. Returns a
 * Map keyed by position; the QB entry is absent when no QB
 * qualifies.
 */
export function buildPassingLeaders(
  input: PassingLeadersInput,
): Map<PassingPosition, PassingLeader[]> {
  const out = new Map<PassingPosition, PassingLeader[]>();
  for (const pos of PASSING_POSITIONS) {
    const rows: PassingLeader[] = [];
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
      if (entries.length < PASSING_MIN_GAMES) continue;

      const passYards = entries.reduce((s, e) => s + e.line.passYards, 0);
      if (passYards <= 0) continue;
      const passTd = entries.reduce((s, e) => s + e.line.passTd, 0);
      rows.push({
        player: p,
        passYards,
        passYardsPerGame: round1(passYards / entries.length),
        passTd,
        passTdPerGame: round1(passTd / entries.length),
        games: entries.length,
      });
    }
    rows.sort(
      (a, b) =>
        b.passYardsPerGame - a.passYardsPerGame ||
        b.passYards - a.passYards ||
        b.passTd - a.passTd,
    );
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_PASSING_LEADERS));
  }
  return out;
}
