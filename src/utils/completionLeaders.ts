// Completion Percentage Leaders board (backlog item 191).
//
// Quarterbacks ranked by completion percentage over the last 3
// completed weeks — the season-long "is he actually hitting his
// receivers" reference board. The accuracy read the volume boards
// can't give: the Passing Yards board (item 154) ranks yardage and
// the Pass Attempts board (item 167) ranks volume, so a QB can lead
// both on 45 attempts a game while completing 55% and nothing on
// the site says so — and the Passer Rating board (item 186) buries
// accuracy inside its four-component blend. Completion % is the
// plainest single-number accuracy read, and the last uncovered
// column on the standard QB stat line (FantasyPros' QB stats pages
// and fantasyfootballers.org's QB cheat sheet both publish a Pass
// Comp% column; researched Nov 7, 2026 for feature shape only).
// Priced on Sleeper's free public weekly stats: completions over
// attempts summed across the window (pass_cmp / pass_att), so the
// board prices the window rate, not an average of weekly rates.
// Pure NFL data, no league needed, so guests get the full board
// like the /passing, /pass-attempts, /qb-rushing, and
// /passer-rating pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const COMPLETION_MIN_GAMES = 2;
/** Minimum pass attempts per game on average — a trick-play passer
 *  going 3-for-3 must not top an accuracy board. Starters throw
 *  ~30 a game; 20 keeps every real starter and every spot starter
 *  with a real workload (same floor as the Passer Rating board,
 *  item 186). */
export const COMPLETION_MIN_ATTEMPTS_PER_GAME = 20;
/** Leaders kept. */
export const MAX_COMPLETION_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface CompletionLeader {
  player: PoolPlayer;
  /** Completion percentage over the recent window (0..100, one decimal). */
  cmpPct: number;
  /** Completions in the window. */
  passCmp: number;
  /** Pass attempts in the window. */
  passAtt: number;
  /** Passing yards in the window (tiebreak). */
  passYards: number;
  /** Passing yards per attempt over the window. */
  ydsPerAtt: number;
  /** Passing touchdowns in the window. */
  passTd: number;
  /** Interceptions thrown in the window. */
  passInt: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface CompletionLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * QB completion-percentage leaders over the last 3 completed weeks
 * (week < currentWeek, week >= currentWeek - 3), min 2 games and min
 * 20 pass attempts per game on average, ranked by completion
 * percentage descending (ties broken by total passing yards, then
 * passing touchdowns), top 15. QBs with no pass attempts never lead
 * the board. Returns the leaders array (empty when none).
 */
export function buildCompletionLeaders(
  input: CompletionLeadersInput,
): CompletionLeader[] {
  const rows: CompletionLeader[] = [];
  for (const p of input.poolPlayers) {
    if (p.pos.toUpperCase() !== 'QB') continue;
    const entries = Object.entries(input.usageBySleeperId[p.sleeperId ?? ''] ?? {})
      .map(([w, line]) => ({ week: Number(w), line }))
      .filter(
        e =>
          Number.isFinite(e.week) &&
          e.week < input.currentWeek &&
          e.week >= input.currentWeek - 3,
      );
    if (entries.length < COMPLETION_MIN_GAMES) continue;

    const passAtt = entries.reduce((s, e) => s + e.line.passAtt, 0);
    if (passAtt < COMPLETION_MIN_ATTEMPTS_PER_GAME * entries.length) continue;
    const passCmp = entries.reduce((s, e) => s + e.line.passCmp, 0);
    const passYards = entries.reduce((s, e) => s + e.line.passYards, 0);
    const passTd = entries.reduce((s, e) => s + e.line.passTd, 0);
    const passInt = entries.reduce((s, e) => s + (e.line.passInt ?? 0), 0);
    if (passAtt <= 0) continue;

    rows.push({
      player: p,
      cmpPct: round1((passCmp / passAtt) * 100),
      passCmp,
      passAtt,
      passYards,
      ydsPerAtt: round1(passYards / passAtt),
      passTd,
      passInt,
      games: entries.length,
    });
  }
  rows.sort(
    (a, b) =>
      b.cmpPct - a.cmpPct ||
      b.passYards - a.passYards ||
      b.passTd - a.passTd,
  );
  return rows.slice(0, MAX_COMPLETION_LEADERS);
}
