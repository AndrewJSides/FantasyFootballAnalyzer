// YPC Leaders board (backlog item 151).
//
// Per-position (RB/WR/TE) yards-per-carry leaders over the last 3
// completed weeks — the season-long "who earns chunk yardage on every
// carry" reference board. YPC is Sleeper's rush_yd over rush attempts,
// and the 15-carry floor keeps a 1-for-40 spot start off the board
// (same floor discipline as the YPR board's 10-reception minimum,
// item 150, and the Catch Rate board's 10-target minimum, item 148).
// Distinct from Efficiency Leaders (item 105), which prices fantasy
// points per touch, and from Opportunity Share (item 108), which
// prices workload share: this board prices the per-carry efficiency
// itself, and a collapsing YPC is the earliest warning that a
// bellcow's ceiling is capped. Pure NFL data (Sleeper's free public
// weekly stats), no league needed, so guests get the full board like
// the /targets, /red-zone, /air-yards, /deep-plays, /catch-rate,
// /yac, and /ypr pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const YPC_POSITIONS = ['RB', 'WR', 'TE'] as const;
export type YpcPosition = (typeof YPC_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const YPC_MIN_GAMES = 2;
/** 15+ carries so a 1-for-40 line can't top the board. */
export const YPC_MIN_CARRIES = 15;
/** Leaders kept per position. */
export const MAX_YPC_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface YpcLeader {
  player: PoolPlayer;
  /** Rushing yards per carry over the recent window. */
  ypc: number;
  /** Rushing yards in the window. */
  rushYards: number;
  /** Carries in the window. */
  carries: number;
  /** Rushing yards per game over the recent window. */
  rushYardsPerGame: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface YpcLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-position YPC leaders over the last 3 completed weeks
 * (week < currentWeek, week >= currentWeek - 3), min 2 games and 15
 * carries in the window, ranked by yards per carry descending
 * (ties broken by rushing yards, then carries), top 15 per
 * position. Players with no carries or no rushing yards never
 * lead a board. Returns a Map keyed by position; positions with no
 * leaders are absent.
 */
export function buildYpcLeaders(input: YpcLeadersInput): Map<YpcPosition, YpcLeader[]> {
  const out = new Map<YpcPosition, YpcLeader[]>();
  for (const pos of YPC_POSITIONS) {
    const rows: YpcLeader[] = [];
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
      if (entries.length < YPC_MIN_GAMES) continue;

      const carries = entries.reduce((s, e) => s + e.line.rushAtt, 0);
      // A leaders board has no room for a small-sample fluke.
      if (carries < YPC_MIN_CARRIES) continue;
      const rushYards = entries.reduce((s, e) => s + e.line.rushYards, 0);
      if (rushYards <= 0) continue;
      rows.push({
        player: p,
        ypc: round1(rushYards / carries),
        rushYards,
        carries,
        rushYardsPerGame: round1(rushYards / entries.length),
        games: entries.length,
      });
    }
    rows.sort((a, b) => b.ypc - a.ypc || b.rushYards - a.rushYards || b.carries - a.carries);
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_YPC_LEADERS));
  }
  return out;
}
