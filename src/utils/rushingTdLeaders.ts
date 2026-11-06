// Rushing Touchdowns Leaders board (backlog item 165).
//
// Per-position (RB/WR/TE) rushing-touchdown leaders over the last 3
// completed weeks — the season-long "who is actually finding the end
// zone on the ground" reference board, and the TD-regression
// companion to the Rushing Yards board (item 162), which shows rush
// TD only as a secondary column. Rush TDs are Sleeper's rush_td,
// already mapped in WeeklyUsageLine, so the board prices the
// ground-game scoring read itself: the goal-line-vulture read behind
// every RB start/sit call and waiver add. Ranked by rush TDs per game
// so a 2-game window can't outrank a 3-game one on raw totals.
// Pure NFL data (Sleeper's free public weekly stats), no league
// needed, so guests get the full board like the /rushing-yards,
// /receiving-yards, /receptions, and /passing-touchdowns pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const RUSH_TD_POSITIONS = ['RB', 'WR', 'TE'] as const;
export type RushTdPosition = (typeof RUSH_TD_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const RUSH_TD_MIN_GAMES = 2;
/** Leaders kept per position. */
export const MAX_RUSH_TD_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface RushTdLeader {
  player: PoolPlayer;
  /** Rushing touchdowns over the recent window. */
  rushTd: number;
  /** Rushing touchdowns per game over the recent window. */
  rushTdPerGame: number;
  /** Rushing yards over the recent window. */
  rushYards: number;
  /** Carries over the recent window. */
  carries: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface RushTdLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-position rushing-touchdown leaders over the last 3 completed
 * weeks (week < currentWeek, week >= currentWeek - 3), min 2 games,
 * ranked by rushing touchdowns per game descending (ties broken by
 * total rushing touchdowns, then rushing yards), top 15 per
 * position. Players with no rushing touchdowns never lead the board.
 * Returns a Map keyed by position; a position entry is absent when
 * no player at that position qualifies.
 */
export function buildRushingTdLeaders(
  input: RushTdLeadersInput,
): Map<RushTdPosition, RushTdLeader[]> {
  const out = new Map<RushTdPosition, RushTdLeader[]>();
  for (const pos of RUSH_TD_POSITIONS) {
    const rows: RushTdLeader[] = [];
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
      if (entries.length < RUSH_TD_MIN_GAMES) continue;

      const rushTd = entries.reduce((s, e) => s + e.line.rushTd, 0);
      if (rushTd <= 0) continue;
      const rushYards = entries.reduce((s, e) => s + e.line.rushYards, 0);
      const carries = entries.reduce((s, e) => s + e.line.rushAtt, 0);
      rows.push({
        player: p,
        rushTd,
        rushTdPerGame: round1(rushTd / entries.length),
        rushYards,
        carries,
        games: entries.length,
      });
    }
    rows.sort(
      (a, b) =>
        b.rushTdPerGame - a.rushTdPerGame ||
        b.rushTd - a.rushTd ||
        b.rushYards - a.rushYards,
    );
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_RUSH_TD_LEADERS));
  }
  return out;
}
