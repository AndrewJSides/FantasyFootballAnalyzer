// Receiving Yards Leaders board (backlog item 161).
//
// Per-position (RB/WR/TE) receiving-yards leaders over the last 3
// completed weeks — the season-long "who is actually producing
// through the air" reference board. Receiving yards per game is the
// plainest production read: unlike YPR (item 150, per catch), YPT
// (item 160, per target), Catch Rate (item 148, conversion), or Air
// Yards (item 146, downfield opportunity), it prices the raw yardage
// itself, so a high-volume chain-mover who never breaks a big play
// still leads. Pure NFL data (Sleeper's free public weekly stats),
// no league needed, so guests get the full board like the /targets,
// /red-zone, /air-yards, /deep-plays, /catch-rate, /yac, /ypr,
// /fantasy-points, /snap-counts, and /yards-per-target pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const REC_YARDS_POSITIONS = ['RB', 'WR', 'TE'] as const;
export type RecYardsPosition = (typeof REC_YARDS_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const REC_YARDS_MIN_GAMES = 2;
/** Leaders kept per position. */
export const MAX_REC_YARDS_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface RecYardsLeader {
  player: PoolPlayer;
  /** Receiving yards in the window. */
  recYards: number;
  /** Receiving yards per game over the recent window. */
  recYardsPerGame: number;
  /** Targets in the window. */
  targets: number;
  /** Receptions in the window. */
  receptions: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface RecYardsLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-position receiving-yards leaders over the last 3 completed
 * weeks (week < currentWeek, week >= currentWeek - 3), min 2 games
 * in the window, ranked by receiving yards per game descending
 * (ties broken by total receiving yards, then receptions), top 15
 * per position. Players with no receiving yards never lead a board.
 * Returns a Map keyed by position; positions with no leaders are
 * absent.
 */
export function buildReceivingYardsLeaders(
  input: RecYardsLeadersInput,
): Map<RecYardsPosition, RecYardsLeader[]> {
  const out = new Map<RecYardsPosition, RecYardsLeader[]>();
  for (const pos of REC_YARDS_POSITIONS) {
    const rows: RecYardsLeader[] = [];
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
      if (entries.length < REC_YARDS_MIN_GAMES) continue;

      const recYards = entries.reduce((s, e) => s + e.line.recYards, 0);
      if (recYards <= 0) continue;
      const targets = entries.reduce((s, e) => s + e.line.targets, 0);
      const receptions = entries.reduce((s, e) => s + e.line.receptions, 0);
      rows.push({
        player: p,
        recYards,
        recYardsPerGame: round1(recYards / entries.length),
        targets,
        receptions,
        games: entries.length,
      });
    }
    rows.sort(
      (a, b) =>
        b.recYardsPerGame - a.recYardsPerGame ||
        b.recYards - a.recYards ||
        b.receptions - a.receptions,
    );
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_REC_YARDS_LEADERS));
  }
  return out;
}
