// Fantasy points allowed by NFL defense per skill position (backlog item
// 102): FantasyPros' weekly "Fantasy Points Allowed: Best & Worst Matchups"
// series (https://www.fantasypros.com/2026/10/fantasy-points-allowed-best-worst-matchups-week-7-2026/)
// and the same board shape on PFN / Edgehalla (public feature descriptions
// only) rank every defense by fantasy points allowed per game to each
// position, rank 1 = softest. TraderApe already prices exactly this data in
// src/data/matchupAllowed.2026.json (per-team per-position avg + rank from
// completed weeks, Sleeper's free weekly stats via `npm run fetch:matchups`);
// this module just boards it, softest first. Implemented from TraderApe's
// own data, no copied content.

import allowedJson from '@/data/matchupAllowed.2026.json';

export type AllowedPosition = 'QB' | 'RB' | 'WR' | 'TE';

export interface AllowedRow {
  /** Canonical team abbreviation (JAC/WAS style). */
  team: string;
  /** Fantasy points per game this defense allowed to the position. */
  avg: number;
  /** 1 = allows the most (softest), 32 = allows the fewest. */
  rank: number;
}

export interface PointsAllowedBoard {
  position: AllowedPosition;
  /** First and last completed week that fed the averages. */
  weeks: [number, number];
  /** One row per NFL team, sorted by avg desc (rank 1 first). */
  rows: AllowedRow[];
}

interface AllowedFile {
  season: number;
  weeks: [number, number];
  teams: Record<string, Record<string, { avg: number; rank: number }>>;
  generatedAt: string;
}

// JSON imports widen tuples to arrays; assert through unknown so the
// tuple type in AllowedFile holds (same pattern as matchupRating.ts).
const ALLOWED = allowedJson as unknown as AllowedFile;

export const ALLOWED_POSITIONS: AllowedPosition[] = ['QB', 'RB', 'WR', 'TE'];

/** Matchup read in the same favorable/tough/neutral language as the
 *  weekly matchup chips (same <=10 / >=23 thresholds). */
export function allowedRead(
  rank: number,
): 'favorable' | 'tough' | 'neutral' {
  if (rank <= 10) return 'favorable';
  if (rank >= 23) return 'tough';
  return 'neutral';
}

export function buildPointsAllowedBoard(
  position: AllowedPosition,
): PointsAllowedBoard {
  const rows: AllowedRow[] = Object.entries(ALLOWED.teams)
    .filter(([, byPos]) => byPos[position] != null)
    .map(([team, byPos]) => ({
      team,
      avg: byPos[position].avg,
      rank: byPos[position].rank,
    }))
    .sort((a, b) => b.avg - a.avg || a.team.localeCompare(b.team));
  return { position, weeks: ALLOWED.weeks, rows };
}
