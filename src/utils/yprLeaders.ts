// YPR Leaders board (backlog item 150).
//
// Per-position (RB/WR/TE) yards-per-reception leaders over the last 3
// completed weeks — the season-long "who earns chunk yardage on every
// catch" reference board. YPR is Sleeper's rec_yd over receptions, and
// the 10-reception floor keeps a 1-for-40 spot start off the board
// (same floor discipline as the Catch Rate board's 10-target minimum,
// item 148). Distinct from Air Yards (item 146), which prices the
// downfield opportunity, Deep Plays (item 147), which prices the
// converted big play, and YAC (item 149), which prices what happens
// after the catch: this board prices the per-catch efficiency itself,
// and a collapsing YPR is the earliest warning that a possession
// receiver's ceiling is capped. Pure NFL data (Sleeper's free public
// weekly stats), no league needed, so guests get the full board like
// the /targets, /red-zone, /air-yards, /deep-plays, /catch-rate, and
// /yac pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const YPR_POSITIONS = ['RB', 'WR', 'TE'] as const;
export type YprPosition = (typeof YPR_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const YPR_MIN_GAMES = 2;
/** 10+ receptions so a 1-for-40 line can't top the board. */
export const YPR_MIN_RECEPTIONS = 10;
/** Leaders kept per position. */
export const MAX_YPR_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface YprLeader {
  player: PoolPlayer;
  /** Receiving yards per reception over the recent window. */
  ypr: number;
  /** Receiving yards in the window. */
  recYards: number;
  /** Receptions in the window. */
  receptions: number;
  /** Receiving yards per game over the recent window. */
  recYardsPerGame: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface YprLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-position YPR leaders over the last 3 completed weeks
 * (week < currentWeek, week >= currentWeek - 3), min 2 games and 10
 * receptions in the window, ranked by yards per reception descending
 * (ties broken by receiving yards, then receptions), top 15 per
 * position. Players with no receptions or no receiving yards never
 * lead a board. Returns a Map keyed by position; positions with no
 * leaders are absent.
 */
export function buildYprLeaders(input: YprLeadersInput): Map<YprPosition, YprLeader[]> {
  const out = new Map<YprPosition, YprLeader[]>();
  for (const pos of YPR_POSITIONS) {
    const rows: YprLeader[] = [];
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
      if (entries.length < YPR_MIN_GAMES) continue;

      const receptions = entries.reduce((s, e) => s + e.line.receptions, 0);
      // A leaders board has no room for a small-sample fluke.
      if (receptions < YPR_MIN_RECEPTIONS) continue;
      const recYards = entries.reduce((s, e) => s + e.line.recYards, 0);
      if (recYards <= 0) continue;
      rows.push({
        player: p,
        ypr: round1(recYards / receptions),
        recYards,
        receptions,
        recYardsPerGame: round1(recYards / entries.length),
        games: entries.length,
      });
    }
    rows.sort((a, b) => b.ypr - a.ypr || b.recYards - a.recYards || b.receptions - a.receptions);
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_YPR_LEADERS));
  }
  return out;
}
