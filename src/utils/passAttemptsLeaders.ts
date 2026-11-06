// Pass Attempts Leaders board (backlog item 167).
//
// Quarterback pass-attempt leaders over the last 3 completed weeks —
// the season-long "whose offense actually throws" reference board,
// and the volume companion to the Passing Leaders board (item 154),
// which shows attempts nowhere. Pass attempts are Sleeper's pass_att
// (completions pass_cmp), mapped in WeeklyUsageLine, so the board
// prices the volume read itself: a high-volume passer on a bad team
// still leads here, which is exactly the streamer / QB2-upside read
// behind every waiver add at the position. Ranked by attempts per
// game so a 2-game window can't outrank a 3-game one on raw totals.
// Pure NFL data (Sleeper's free public weekly stats), no league
// needed, so guests get the full board like the /passing,
// /passing-touchdowns, and /receiving-touchdowns pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const PASS_ATT_POSITIONS = ['QB'] as const;
export type PassAttPosition = (typeof PASS_ATT_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const PASS_ATT_MIN_GAMES = 2;
/** Leaders kept. */
export const MAX_PASS_ATT_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface PassAttLeader {
  player: PoolPlayer;
  /** Pass attempts over the recent window. */
  passAtt: number;
  /** Pass attempts per game over the recent window. */
  passAttPerGame: number;
  /** Pass completions over the recent window. */
  passCmp: number;
  /** Completion percentage over the recent window. */
  cmpPct: number;
  /** Passing yards over the recent window. */
  passYards: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface PassAttLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Quarterback pass-attempt leaders over the last 3 completed weeks
 * (week < currentWeek, week >= currentWeek - 3), min 2 games, ranked
 * by pass attempts per game descending (ties broken by total pass
 * attempts, then passing yards), top 15. Quarterbacks with no pass
 * attempts never lead the board. Returns a Map keyed by position; a
 * position entry is absent when no player at that position qualifies.
 */
export function buildPassAttemptsLeaders(
  input: PassAttLeadersInput,
): Map<PassAttPosition, PassAttLeader[]> {
  const out = new Map<PassAttPosition, PassAttLeader[]>();
  for (const pos of PASS_ATT_POSITIONS) {
    const rows: PassAttLeader[] = [];
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
      if (entries.length < PASS_ATT_MIN_GAMES) continue;

      const passAtt = entries.reduce((s, e) => s + e.line.passAtt, 0);
      if (passAtt <= 0) continue;
      const passCmp = entries.reduce((s, e) => s + e.line.passCmp, 0);
      const passYards = entries.reduce((s, e) => s + e.line.passYards, 0);
      rows.push({
        player: p,
        passAtt,
        passAttPerGame: round1(passAtt / entries.length),
        passCmp,
        cmpPct: round1((100 * passCmp) / passAtt),
        passYards,
        games: entries.length,
      });
    }
    rows.sort(
      (a, b) =>
        b.passAttPerGame - a.passAttPerGame ||
        b.passAtt - a.passAtt ||
        b.passYards - a.passYards,
    );
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_PASS_ATT_LEADERS));
  }
  return out;
}
