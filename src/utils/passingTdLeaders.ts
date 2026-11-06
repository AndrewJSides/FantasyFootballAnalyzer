// Passing Touchdowns Leaders board (backlog item 164).
//
// Quarterback passing-touchdown leaders over the last 3 completed
// weeks — the season-long "who is actually putting the ball in the
// end zone through the air" reference board, and the QB scoring
// companion to the Passing Leaders yardage board (item 154), which
// shows pass TD only as a secondary column. Pass TDs are Sleeper's
// pass_td, already mapped in WeeklyUsageLine, so the board prices
// the scoring read itself: the QB start/sit and streamer companion
// to the QB Streamers section (item 39), which prices one week while
// this board prices the last-three trend. Ranked by pass TDs per
// game so a 2-game window can't outrank a 3-game one on raw totals.
// Pure NFL data (Sleeper's free public weekly stats), no league
// needed, so guests get the full board like the /passing,
// /targets, /red-zone, /air-yards, /deep-plays, /catch-rate, /yac,
// /ypr, /ypc, /scrimmage, /touchdowns, and /receptions pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const PASSING_TD_POSITIONS = ['QB'] as const;
export type PassingTdPosition = (typeof PASSING_TD_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const PASSING_TD_MIN_GAMES = 2;
/** Leaders kept. */
export const MAX_PASSING_TD_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface PassingTdLeader {
  player: PoolPlayer;
  /** Passing touchdowns over the recent window. */
  passTd: number;
  /** Passing touchdowns per game over the recent window. */
  passTdPerGame: number;
  /** Passing yards over the recent window. */
  passYards: number;
  /** Passing yards per game over the recent window. */
  passYardsPerGame: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface PassingTdLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Quarterback passing-touchdown leaders over the last 3 completed
 * weeks (week < currentWeek, week >= currentWeek - 3), min 2 games,
 * ranked by passing touchdowns per game descending (ties broken by
 * total passing touchdowns, then passing yards), top 15.
 * Players with no passing touchdowns never lead the board. Returns a
 * Map keyed by position; the QB entry is absent when no QB
 * qualifies.
 */
export function buildPassingTdLeaders(
  input: PassingTdLeadersInput,
): Map<PassingTdPosition, PassingTdLeader[]> {
  const out = new Map<PassingTdPosition, PassingTdLeader[]>();
  for (const pos of PASSING_TD_POSITIONS) {
    const rows: PassingTdLeader[] = [];
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
      if (entries.length < PASSING_TD_MIN_GAMES) continue;

      const passTd = entries.reduce((s, e) => s + e.line.passTd, 0);
      if (passTd <= 0) continue;
      const passYards = entries.reduce((s, e) => s + e.line.passYards, 0);
      rows.push({
        player: p,
        passTd,
        passTdPerGame: round1(passTd / entries.length),
        passYards,
        passYardsPerGame: round1(passYards / entries.length),
        games: entries.length,
      });
    }
    rows.sort(
      (a, b) =>
        b.passTdPerGame - a.passTdPerGame ||
        b.passTd - a.passTd ||
        b.passYards - a.passYards,
    );
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_PASSING_TD_LEADERS));
  }
  return out;
}
