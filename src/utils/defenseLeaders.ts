// Defense Leaders board (backlog item 169).
//
// The team defenses actually producing over the last 3 completed
// weeks, ranked by standard D/ST fantasy points per game — the
// "which defense is hot" read the D/ST Streamers board (item 14)
// doesn't answer, since it ranks by this week's matchup instead.
// Pure NFL data (Sleeper's free public weekly team-defense stats,
// via the shared weekly-usage fetch), no league needed, so guests
// get the full board like the skill-position leaders pages.
//
// Scoring is the same standard D/ST scoring as the Streamers
// (sack 1, INT 2, fumble recovery 2, defensive TD 6, safety 2,
// blocked kick 2, points-allowed brackets 10/7/4/1/0/-1/-4), so the
// two boards can't disagree on what a point is.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const DEFENSE_MIN_GAMES = 2;
/** Leaders kept on the board (32 defenses exist; top 15 lead). */
export const MAX_DEFENSE_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Points-allowed bracket in standard D/ST scoring. */
export function ptsAllowedBracket(ptsAllow: number): number {
  if (ptsAllow <= 0) return 10;
  if (ptsAllow <= 6) return 7;
  if (ptsAllow <= 13) return 4;
  if (ptsAllow <= 20) return 1;
  if (ptsAllow <= 27) return 0;
  if (ptsAllow <= 34) return -1;
  return -4;
}

/**
 * Standard D/ST fantasy points for one weekly defensive line:
 * sack 1, INT 2, fumble recovery 2, defensive TD 6, safety 2,
 * blocked kick 2, plus the points-allowed bracket.
 */
export function scoreDefenseWeek(line: WeeklyUsageLine): number {
  return (
    (line.sacks ?? 0) * 1 +
    (line.defInt ?? 0) * 2 +
    (line.fumRec ?? 0) * 2 +
    (line.defTd ?? 0) * 6 +
    (line.safeties ?? 0) * 2 +
    (line.blkKick ?? 0) * 2 +
    ptsAllowedBracket(line.ptsAllow ?? 0)
  );
}

export interface DefenseLeader {
  player: PoolPlayer;
  /** Standard D/ST fantasy points in the window. */
  fantasyPts: number;
  /** Standard D/ST fantasy points per game over the window. */
  fantasyPtsPerGame: number;
  /** Sacks in the window. */
  sacks: number;
  /** Takeaways in the window (interceptions + fumble recoveries). */
  takeaways: number;
  /** Defensive touchdowns in the window. */
  defTd: number;
  /** Points allowed per game over the window. */
  ptsAllowedPerGame: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface DefenseLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (defense rows keyed by team
   *  abbreviation, e.g. "HOU"). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Team-defense leaders over the last 3 completed weeks (week <
 * currentWeek, week >= currentWeek - 3), min 2 games in the window,
 * ranked by standard D/ST fantasy points per game descending (ties
 * broken by total fantasy points, then sacks), top 15. Defenses
 * scoring zero or fewer points in the window never lead a board.
 * Returns a flat list (no position tabs — there is only DST).
 */
export function buildDefenseLeaders(
  input: DefenseLeadersInput,
): DefenseLeader[] {
  const rows: DefenseLeader[] = [];
  for (const p of input.poolPlayers) {
    if (p.pos.toUpperCase() !== 'DST') continue;
    const entries = Object.entries(input.usageBySleeperId[p.sleeperId ?? ''] ?? {})
      .map(([w, line]) => ({ week: Number(w), line }))
      .filter(
        e =>
          Number.isFinite(e.week) &&
          e.week < input.currentWeek &&
          e.week >= input.currentWeek - 3,
      );
    if (entries.length < DEFENSE_MIN_GAMES) continue;

    const fantasyPts = entries.reduce((s, e) => s + scoreDefenseWeek(e.line), 0);
    if (fantasyPts <= 0) continue;
    const sacks = entries.reduce((s, e) => s + (e.line.sacks ?? 0), 0);
    const takeaways = entries.reduce(
      (s, e) => s + (e.line.defInt ?? 0) + (e.line.fumRec ?? 0),
      0,
    );
    const defTd = entries.reduce((s, e) => s + (e.line.defTd ?? 0), 0);
    const ptsAllow = entries.reduce((s, e) => s + (e.line.ptsAllow ?? 0), 0);
    rows.push({
      player: p,
      fantasyPts,
      fantasyPtsPerGame: round1(fantasyPts / entries.length),
      sacks,
      takeaways,
      defTd,
      ptsAllowedPerGame: round1(ptsAllow / entries.length),
      games: entries.length,
    });
  }
  rows.sort(
    (a, b) =>
      b.fantasyPtsPerGame - a.fantasyPtsPerGame ||
      b.fantasyPts - a.fantasyPts ||
      b.sacks - a.sacks,
  );
  return rows.slice(0, MAX_DEFENSE_LEADERS);
}
