// Rushing Yards Leaders board (backlog item 162).
//
// Per-position (RB/WR/TE) rushing-yards leaders over the last 3
// completed weeks — the season-long "who is actually producing on
// the ground" reference board. Rushing yards per game is the
// plainest ground-production read: unlike YPC (item 151, per
// carry), Scrimmage Yards (item 152, rush + receiving combined),
// or Touchdowns (item 153, scoring only), it prices the raw
// rushing yardage itself, so a high-volume grinder who never
// breaks a big run still leads. Pure NFL data (Sleeper's free
// public weekly stats), no league needed, so guests get the full
// board like the /targets, /red-zone, /air-yards, /deep-plays,
// /catch-rate, /yac, /ypr, /fantasy-points, /snap-counts,
// /yards-per-target, and /receiving-yards pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const RUSH_YARDS_POSITIONS = ['RB', 'WR', 'TE'] as const;
export type RushYardsPosition = (typeof RUSH_YARDS_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const RUSH_YARDS_MIN_GAMES = 2;
/** Leaders kept per position. */
export const MAX_RUSH_YARDS_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface RushYardsLeader {
  player: PoolPlayer;
  /** Rushing yards in the window. */
  rushYards: number;
  /** Rushing yards per game over the recent window. */
  rushYardsPerGame: number;
  /** Carries in the window. */
  carries: number;
  /** Rushing touchdowns in the window. */
  rushTd: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface RushYardsLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-position rushing-yards leaders over the last 3 completed
 * weeks (week < currentWeek, week >= currentWeek - 3), min 2 games
 * in the window, ranked by rushing yards per game descending
 * (ties broken by total rushing yards, then carries), top 15
 * per position. Players with no rushing yards never lead a board.
 * Returns a Map keyed by position; positions with no leaders are
 * absent.
 */
export function buildRushingYardsLeaders(
  input: RushYardsLeadersInput,
): Map<RushYardsPosition, RushYardsLeader[]> {
  const out = new Map<RushYardsPosition, RushYardsLeader[]>();
  for (const pos of RUSH_YARDS_POSITIONS) {
    const rows: RushYardsLeader[] = [];
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
      if (entries.length < RUSH_YARDS_MIN_GAMES) continue;

      const rushYards = entries.reduce((s, e) => s + e.line.rushYards, 0);
      if (rushYards <= 0) continue;
      const carries = entries.reduce((s, e) => s + e.line.rushAtt, 0);
      const rushTd = entries.reduce((s, e) => s + e.line.rushTd, 0);
      rows.push({
        player: p,
        rushYards,
        rushYardsPerGame: round1(rushYards / entries.length),
        carries,
        rushTd,
        games: entries.length,
      });
    }
    rows.sort(
      (a, b) =>
        b.rushYardsPerGame - a.rushYardsPerGame ||
        b.rushYards - a.rushYards ||
        b.carries - a.carries,
    );
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_RUSH_YARDS_LEADERS));
  }
  return out;
}
