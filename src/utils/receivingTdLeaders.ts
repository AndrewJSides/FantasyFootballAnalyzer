// Receiving Touchdowns Leaders board (backlog item 166).
//
// Per-position (RB/WR/TE) receiving-touchdown leaders over the last 3
// completed weeks — the season-long "who is actually finding the end
// zone as a pass-catcher" reference board, and the TD-regression
// companion to the Receiving Yards board (item 161), which shows rec
// TD only as a secondary column. Rec TDs are Sleeper's rec_td,
// already mapped in WeeklyUsageLine, so the board prices the
// through-the-air scoring read itself: the red-zone-specialist read
// behind every WR/TE start/sit call and waiver add. Ranked by rec
// TDs per game so a 2-game window can't outrank a 3-game one on raw
// totals. Pure NFL data (Sleeper's free public weekly stats), no
// league needed, so guests get the full board like the
// /receiving-yards, /receptions, /passing-touchdowns, and
// /rushing-touchdowns pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const REC_TD_POSITIONS = ['RB', 'WR', 'TE'] as const;
export type RecTdPosition = (typeof REC_TD_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const REC_TD_MIN_GAMES = 2;
/** Leaders kept per position. */
export const MAX_REC_TD_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface RecTdLeader {
  player: PoolPlayer;
  /** Receiving touchdowns over the recent window. */
  recTd: number;
  /** Receiving touchdowns per game over the recent window. */
  recTdPerGame: number;
  /** Receiving yards over the recent window. */
  recYards: number;
  /** Receptions over the recent window. */
  receptions: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface RecTdLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-position receiving-touchdown leaders over the last 3 completed
 * weeks (week < currentWeek, week >= currentWeek - 3), min 2 games,
 * ranked by receiving touchdowns per game descending (ties broken by
 * total receiving touchdowns, then receiving yards), top 15 per
 * position. Players with no receiving touchdowns never lead the board.
 * Returns a Map keyed by position; a position entry is absent when
 * no player at that position qualifies.
 */
export function buildReceivingTdLeaders(
  input: RecTdLeadersInput,
): Map<RecTdPosition, RecTdLeader[]> {
  const out = new Map<RecTdPosition, RecTdLeader[]>();
  for (const pos of REC_TD_POSITIONS) {
    const rows: RecTdLeader[] = [];
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
      if (entries.length < REC_TD_MIN_GAMES) continue;

      const recTd = entries.reduce((s, e) => s + e.line.recTd, 0);
      if (recTd <= 0) continue;
      const recYards = entries.reduce((s, e) => s + e.line.recYards, 0);
      const receptions = entries.reduce((s, e) => s + e.line.receptions, 0);
      rows.push({
        player: p,
        recTd,
        recTdPerGame: round1(recTd / entries.length),
        recYards,
        receptions,
        games: entries.length,
      });
    }
    rows.sort(
      (a, b) =>
        b.recTdPerGame - a.recTdPerGame ||
        b.recTd - a.recTd ||
        b.recYards - a.recYards,
    );
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_REC_TD_LEADERS));
  }
  return out;
}
