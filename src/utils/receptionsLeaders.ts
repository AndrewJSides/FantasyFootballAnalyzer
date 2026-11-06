// Receptions Leaders board (backlog item 163).
//
// Per-position (RB/WR/TE) receptions leaders over the last 3
// completed weeks — the season-long "who is actually seeing the
// ball completed to him" reference board. Receptions per game is
// the plainest catch-volume read: unlike Target Volume (item 155,
// targets), Catch Rate (item 148, conversion), YPR (item 150, per
// catch), or Receiving Yards (item 161, yardage), it prices the
// raw catch count itself, so a high-volume possession receiver who
// never breaks a big play still leads — the PPR floor read. Pure
// NFL data (Sleeper's free public weekly stats), no league needed,
// so guests get the full board like the /targets, /red-zone,
// /air-yards, /deep-plays, /catch-rate, /yac, /ypr,
// /fantasy-points, /snap-counts, /yards-per-target,
// /receiving-yards, and /rushing-yards pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const RECEPTIONS_POSITIONS = ['RB', 'WR', 'TE'] as const;
export type ReceptionsPosition = (typeof RECEPTIONS_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const RECEPTIONS_MIN_GAMES = 2;
/** Leaders kept per position. */
export const MAX_RECEPTIONS_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface ReceptionsLeader {
  player: PoolPlayer;
  /** Receptions in the window. */
  receptions: number;
  /** Receptions per game over the recent window. */
  receptionsPerGame: number;
  /** Targets in the window. */
  targets: number;
  /** Receiving yards in the window. */
  recYards: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface ReceptionsLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-position receptions leaders over the last 3 completed
 * weeks (week < currentWeek, week >= currentWeek - 3), min 2 games
 * in the window, ranked by receptions per game descending
 * (ties broken by total receptions, then targets), top 15
 * per position. Players with no receptions never lead a board.
 * Returns a Map keyed by position; positions with no leaders are
 * absent.
 */
export function buildReceptionsLeaders(
  input: ReceptionsLeadersInput,
): Map<ReceptionsPosition, ReceptionsLeader[]> {
  const out = new Map<ReceptionsPosition, ReceptionsLeader[]>();
  for (const pos of RECEPTIONS_POSITIONS) {
    const rows: ReceptionsLeader[] = [];
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
      if (entries.length < RECEPTIONS_MIN_GAMES) continue;

      const receptions = entries.reduce((s, e) => s + e.line.receptions, 0);
      if (receptions <= 0) continue;
      const targets = entries.reduce((s, e) => s + e.line.targets, 0);
      const recYards = entries.reduce((s, e) => s + e.line.recYards, 0);
      rows.push({
        player: p,
        receptions,
        receptionsPerGame: round1(receptions / entries.length),
        targets,
        recYards,
        games: entries.length,
      });
    }
    rows.sort(
      (a, b) =>
        b.receptionsPerGame - a.receptionsPerGame ||
        b.receptions - a.receptions ||
        b.targets - a.targets,
    );
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_RECEPTIONS_LEADERS));
  }
  return out;
}
