// Kicker Leaders board (backlog item 170).
//
// The kickers actually producing over the last 3 completed
// weeks, ranked by standard kicker fantasy points per game — the
// "which kicker is hot" read the Kicker Streamers board (item 15)
// doesn't answer, since it ranks by this week's matchup instead.
// Pure NFL data (Sleeper's free public weekly kicker stats, via
// the shared weekly-usage fetch), no league needed, so guests
// get the full board like the skill-position leaders pages.
//
// Scoring is the same standard kicker scoring as the Streamers
// (FG made 3, PAT made 1, FG missed -1), so the two boards can't
// disagree on what a point is.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const KICKER_MIN_GAMES = 2;
/** Leaders kept on the board (32 kickers exist; top 15 lead). */
export const MAX_KICKER_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Standard kicker fantasy points for one weekly kicking line:
 * FG made 3, PAT made 1, FG missed -1 — the same scoring the
 * Kicker Streamers build uses (scripts/buildMatchupRatings.ts).
 */
export function scoreKickerWeek(line: WeeklyUsageLine): number {
  const fgm = line.fgm ?? 0;
  const fga = line.fga ?? fgm;
  const xpm = line.xpm ?? 0;
  return fgm * 3 + xpm - (fga - fgm);
}

export interface KickerLeader {
  player: PoolPlayer;
  /** Standard kicker fantasy points in the window. */
  fantasyPts: number;
  /** Standard kicker fantasy points per game over the window. */
  fantasyPtsPerGame: number;
  /** Field goals made in the window. */
  fgMade: number;
  /** Field goals attempted in the window. */
  fgAtt: number;
  /** Field-goal percentage in the window (null with no attempts). */
  fgPct: number | null;
  /** Extra points made in the window. */
  patMade: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface KickerLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id. */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Kicker leaders over the last 3 completed weeks (week <
 * currentWeek, week >= currentWeek - 3), min 2 games in the window,
 * ranked by standard kicker fantasy points per game descending (ties
 * broken by total fantasy points, then field goals made), top 15.
 * Kickers scoring zero or fewer points in the window never lead a board.
 * Returns a flat list (no position tabs — there is only K).
 */
export function buildKickerLeaders(
  input: KickerLeadersInput,
): KickerLeader[] {
  const rows: KickerLeader[] = [];
  for (const p of input.poolPlayers) {
    if (p.pos.toUpperCase() !== 'K') continue;
    const entries = Object.entries(input.usageBySleeperId[p.sleeperId ?? ''] ?? {})
      .map(([w, line]) => ({ week: Number(w), line }))
      .filter(
        e =>
          Number.isFinite(e.week) &&
          e.week < input.currentWeek &&
          e.week >= input.currentWeek - 3,
      );
    if (entries.length < KICKER_MIN_GAMES) continue;

    const fantasyPts = entries.reduce((s, e) => s + scoreKickerWeek(e.line), 0);
    if (fantasyPts <= 0) continue;
    const fgMade = entries.reduce((s, e) => s + (e.line.fgm ?? 0), 0);
    const fgAtt = entries.reduce((s, e) => s + (e.line.fga ?? e.line.fgm ?? 0), 0);
    const patMade = entries.reduce((s, e) => s + (e.line.xpm ?? 0), 0);
    rows.push({
      player: p,
      fantasyPts,
      fantasyPtsPerGame: round1(fantasyPts / entries.length),
      fgMade,
      fgAtt,
      fgPct: fgAtt > 0 ? round1((fgMade / fgAtt) * 100) : null,
      patMade,
      games: entries.length,
    });
  }
  rows.sort(
    (a, b) =>
      b.fantasyPtsPerGame - a.fantasyPtsPerGame ||
      b.fantasyPts - a.fantasyPts ||
      b.fgMade - a.fgMade,
  );
  return rows.slice(0, MAX_KICKER_LEADERS);
}
