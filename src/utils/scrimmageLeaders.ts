// Scrimmage Yards Leaders board (backlog item 152).
//
// Per-position (RB/WR/TE) yards-from-scrimmage leaders over the last 3
// completed weeks — the season-long "who produces the most total
// yardage" reference board. Scrimmage yards are Sleeper's rush_yd +
// rec_yd, both already mapped in WeeklyUsageLine (items 150/151), so
// this board needs no new field: it prices the whole workload in one
// number, which is exactly where dual-threat backs and
// manufactured-touch receivers show up that the rush-only (YPC) and
// rec-only (YPR) boards miss. Distinct from Efficiency Leaders
// (item 105), which prices fantasy points per touch: this board
// prices total yardage itself, ranked by yards per game so a 2-game
// window can't outrank a 3-game one on raw totals. Pure NFL data
// (Sleeper's free public weekly stats), no league needed, so guests
// get the full board like the /targets, /red-zone, /air-yards,
// /deep-plays, /catch-rate, /yac, /ypr, and /ypc pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const SCRIMMAGE_POSITIONS = ['RB', 'WR', 'TE'] as const;
export type ScrimmagePosition = (typeof SCRIMMAGE_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const SCRIMMAGE_MIN_GAMES = 2;
/** 10+ touches (carries + receptions) so a 1-touch fluke can't top the board. */
export const SCRIMMAGE_MIN_TOUCHES = 10;
/** Leaders kept per position. */
export const MAX_SCRIMMAGE_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface ScrimmageLeader {
  player: PoolPlayer;
  /** Yards from scrimmage (rushing + receiving) over the recent window. */
  scrimmageYards: number;
  /** Rushing yards in the window. */
  rushYards: number;
  /** Receiving yards in the window. */
  recYards: number;
  /** Carries + receptions in the window. */
  touches: number;
  /** Scrimmage yards per game over the recent window. */
  scrimmagePerGame: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface ScrimmageLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-position scrimmage-yards leaders over the last 3 completed weeks
 * (week < currentWeek, week >= currentWeek - 3), min 2 games and 10
 * touches in the window, ranked by scrimmage yards per game
 * descending (ties broken by total scrimmage yards, then touches),
 * top 15 per position. Players with no scrimmage yards never lead a
 * board. Returns a Map keyed by position; positions with no leaders
 * are absent.
 */
export function buildScrimmageLeaders(
  input: ScrimmageLeadersInput,
): Map<ScrimmagePosition, ScrimmageLeader[]> {
  const out = new Map<ScrimmagePosition, ScrimmageLeader[]>();
  for (const pos of SCRIMMAGE_POSITIONS) {
    const rows: ScrimmageLeader[] = [];
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
      if (entries.length < SCRIMMAGE_MIN_GAMES) continue;

      const touches = entries.reduce(
        (s, e) => s + e.line.rushAtt + e.line.receptions,
        0,
      );
      // A leaders board has no room for a small-sample fluke.
      if (touches < SCRIMMAGE_MIN_TOUCHES) continue;
      const rushYards = entries.reduce((s, e) => s + e.line.rushYards, 0);
      const recYards = entries.reduce((s, e) => s + e.line.recYards, 0);
      const scrimmageYards = rushYards + recYards;
      if (scrimmageYards <= 0) continue;
      rows.push({
        player: p,
        scrimmageYards,
        rushYards,
        recYards,
        touches,
        scrimmagePerGame: round1(scrimmageYards / entries.length),
        games: entries.length,
      });
    }
    rows.sort(
      (a, b) =>
        b.scrimmagePerGame - a.scrimmagePerGame ||
        b.scrimmageYards - a.scrimmageYards ||
        b.touches - a.touches,
    );
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_SCRIMMAGE_LEADERS));
  }
  return out;
}
