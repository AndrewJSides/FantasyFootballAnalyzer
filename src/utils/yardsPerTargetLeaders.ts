// Yards Per Target Leaders board (backlog item 160).
//
// Per-position (RB/WR/TE) yards-per-target leaders over the last 3
// completed weeks — the season-long "who makes the most of every
// look" reference board. YPT is Sleeper's rec_yd over rec_tgt, and
// the 10-target floor keeps a 1-for-40 spot start off the board
// (same floor discipline as the Catch Rate board's 10-target minimum,
// item 148). Distinct from YPR (item 150), which prices the per-catch
// efficiency, Catch Rate (item 148), which prices the conversion, and
// Air Yards (item 146), which prices the downfield opportunity: YPT
// blends catch rate and chunk yardage into the single per-target
// efficiency number, so a collapsing YPT is the earliest warning
// that a target hog's ceiling is capped. Pure NFL data (Sleeper's
// free public weekly stats), no league needed, so guests get the full
// board like the /targets, /red-zone, /air-yards, /deep-plays,
// /catch-rate, /yac, /ypr, /fantasy-points, and /snap-counts pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const YPT_POSITIONS = ['RB', 'WR', 'TE'] as const;
export type YptPosition = (typeof YPT_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const YPT_MIN_GAMES = 2;
/** 10+ targets so a 1-for-40 line can't top the board. */
export const YPT_MIN_TARGETS = 10;
/** Leaders kept per position. */
export const MAX_YPT_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface YptLeader {
  player: PoolPlayer;
  /** Receiving yards per target over the recent window. */
  ypt: number;
  /** Receiving yards in the window. */
  recYards: number;
  /** Targets in the window. */
  targets: number;
  /** Receptions in the window. */
  receptions: number;
  /** Receiving yards per game over the recent window. */
  recYardsPerGame: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface YptLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-position YPT leaders over the last 3 completed weeks
 * (week < currentWeek, week >= currentWeek - 3), min 2 games and 10
 * targets in the window, ranked by yards per target descending
 * (ties broken by receiving yards, then targets), top 15 per
 * position. Players with no targets or no receiving yards never
 * lead a board. Returns a Map keyed by position; positions with no
 * leaders are absent.
 */
export function buildYardsPerTargetLeaders(
  input: YptLeadersInput,
): Map<YptPosition, YptLeader[]> {
  const out = new Map<YptPosition, YptLeader[]>();
  for (const pos of YPT_POSITIONS) {
    const rows: YptLeader[] = [];
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
      if (entries.length < YPT_MIN_GAMES) continue;

      const targets = entries.reduce((s, e) => s + e.line.targets, 0);
      // A leaders board has no room for a small-sample fluke.
      if (targets < YPT_MIN_TARGETS) continue;
      const recYards = entries.reduce((s, e) => s + e.line.recYards, 0);
      if (recYards <= 0) continue;
      const receptions = entries.reduce((s, e) => s + e.line.receptions, 0);
      rows.push({
        player: p,
        ypt: round1(recYards / targets),
        recYards,
        targets,
        receptions,
        recYardsPerGame: round1(recYards / entries.length),
        games: entries.length,
      });
    }
    rows.sort((a, b) => b.ypt - a.ypt || b.recYards - a.recYards || b.targets - a.targets);
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_YPT_LEADERS));
  }
  return out;
}
