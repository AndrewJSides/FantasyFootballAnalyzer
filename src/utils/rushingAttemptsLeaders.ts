// Rushing Attempts Leaders board (backlog item 168).
//
// Per-position (RB/WR/TE) rushing-attempt leaders over the last 3
// completed weeks — the season-long "whose backfield actually feeds
// him" reference board, and the workload companion to the Rushing
// Yards board (item 162), which shows carries only as a supporting
// column. Attempts per game is the plainest ground-volume read:
// unlike YPC (item 151, per carry) or Scrimmage Yards (item 152,
// rush + receiving combined), it prices the raw workload itself, so
// a high-volume grinder on a bad offense still leads. Pure NFL data
// (Sleeper's free public weekly stats), no league needed, so guests
// get the full board like the /rushing-yards, /pass-attempts, and
// /receiving-yards pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const RUSH_ATT_POSITIONS = ['RB', 'WR', 'TE'] as const;
export type RushAttPosition = (typeof RUSH_ATT_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const RUSH_ATT_MIN_GAMES = 2;
/** Leaders kept per position. */
export const MAX_RUSH_ATT_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface RushAttLeader {
  player: PoolPlayer;
  /** Rushing attempts in the window. */
  rushAtt: number;
  /** Rushing attempts per game over the recent window. */
  rushAttPerGame: number;
  /** Rushing yards in the window. */
  rushYards: number;
  /** Yards per carry over the recent window (0 when no carries). */
  ypc: number;
  /** Rushing touchdowns in the window. */
  rushTd: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface RushAttLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-position rushing-attempt leaders over the last 3 completed
 * weeks (week < currentWeek, week >= currentWeek - 3), min 2 games
 * in the window, ranked by rushing attempts per game descending
 * (ties broken by total rushing attempts, then rushing yards), top 15
 * per position. Players with no rushing attempts never lead a board.
 * Returns a Map keyed by position; positions with no leaders are
 * absent.
 */
export function buildRushingAttemptsLeaders(
  input: RushAttLeadersInput,
): Map<RushAttPosition, RushAttLeader[]> {
  const out = new Map<RushAttPosition, RushAttLeader[]>();
  for (const pos of RUSH_ATT_POSITIONS) {
    const rows: RushAttLeader[] = [];
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
      if (entries.length < RUSH_ATT_MIN_GAMES) continue;

      const rushAtt = entries.reduce((s, e) => s + e.line.rushAtt, 0);
      if (rushAtt <= 0) continue;
      const rushYards = entries.reduce((s, e) => s + e.line.rushYards, 0);
      const rushTd = entries.reduce((s, e) => s + e.line.rushTd, 0);
      rows.push({
        player: p,
        rushAtt,
        rushAttPerGame: round1(rushAtt / entries.length),
        rushYards,
        ypc: round1(rushYards / rushAtt),
        rushTd,
        games: entries.length,
      });
    }
    rows.sort(
      (a, b) =>
        b.rushAttPerGame - a.rushAttPerGame ||
        b.rushAtt - a.rushAtt ||
        b.rushYards - a.rushYards,
    );
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_RUSH_ATT_LEADERS));
  }
  return out;
}
