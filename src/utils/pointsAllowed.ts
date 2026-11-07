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
//
// Backlog item 190 extends the board to K + DST: the K tab ranks defenses by
// the points they give to opposing kickers (kickerGenerosity.2026.json, the
// same table the Kicker Streamers price from) and the DST tab ranks OFFENSES
// by the points opposing defenses score against them
// (defenseGenerosity.2026.json, the same table the D/ST Streamers price
// from) — the flip PFN's board uses for its DST column.

import allowedJson from '@/data/matchupAllowed.2026.json';
import kickerGenerosityJson from '@/data/kickerGenerosity.2026.json';
import defenseGenerosityJson from '@/data/defenseGenerosity.2026.json';

export type AllowedPosition = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST';

export interface AllowedRow {
  /** Canonical team abbreviation (JAC/WAS style). For DST rows this is the
   *  offense giving points up to opposing defenses. */
  team: string;
  /** Fantasy points per game this team allowed (skill/K) or gave up (DST)
   *  to the position. */
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

interface GenerosityFile {
  season: number;
  weeks: [number, number];
  teams: Record<
    string,
    { generosityAvg: number; generosityRank: number; ownAvg: number }
  >;
  generatedAt?: string;
}

// JSON imports widen tuples to arrays; assert through unknown so the
// tuple type in AllowedFile holds (same pattern as matchupRating.ts).
const ALLOWED = allowedJson as unknown as AllowedFile;
const KICKER_GENEROSITY = kickerGenerosityJson as unknown as GenerosityFile;
const DEFENSE_GENEROSITY =
  defenseGenerosityJson as unknown as GenerosityFile;

export const ALLOWED_POSITIONS: AllowedPosition[] = [
  'QB',
  'RB',
  'WR',
  'TE',
  'K',
  'DST',
];

/** How the board's target reads in prose ("to QBs" / "to kickers" /
 *  "to opposing defenses"). */
export function allowedTargetLabel(position: AllowedPosition): string {
  switch (position) {
    case 'K':
      return 'kickers';
    case 'DST':
      return 'opposing defenses';
    default:
      return `${position}s`;
  }
}

/** What the ranked teams are: defenses for every tab except DST, where the
 *  ranked teams are offenses (the flip: an offense gives points to the
 *  defense facing it). */
export function allowedSubjectLabel(
  position: AllowedPosition,
): 'defenses' | 'offenses' {
  return position === 'DST' ? 'offenses' : 'defenses';
}

/** How the matchup read names the manager's player ("your QB" / "your
 *  kicker" / "your defense"). */
export function allowedYourLabel(position: AllowedPosition): string {
  switch (position) {
    case 'K':
      return 'kicker';
    case 'DST':
      return 'defense';
    default:
      return position;
  }
}

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
  if (position === 'K' || position === 'DST') {
    // Generosity tables: rank 1 = gives the most to the position, same
    // softest-first reading as the skill-position board.
    const file =
      position === 'K' ? KICKER_GENEROSITY : DEFENSE_GENEROSITY;
    const rows: AllowedRow[] = Object.entries(file.teams)
      .map(([team, entry]) => ({
        team,
        avg: entry.generosityAvg,
        rank: entry.generosityRank,
      }))
      .sort((a, b) => b.avg - a.avg || a.team.localeCompare(b.team));
    return { position, weeks: file.weeks, rows };
  }
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
