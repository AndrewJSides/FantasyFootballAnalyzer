// Perfect-lineup record — backlog item 76: each team's W-L if every manager
// had fielded his best legal lineup every completed week. Competitor source:
// League Charter's "Perfect-lineup record" ("What everyone's record would be
// with the best possible lineup each week", https://www.leaguecharter.com/ —
// public feature description only). Their numbers are theirs; ours are
// TraderApe's own: bestLineupPoints from lineups.ts (the same math the
// lineup awards and the Lineup Efficiency table run on, so the three can
// never disagree), re-deciding each completed matchup with both sides'
// best-possible scores.
//
// Hides itself (returns []) when the sync fetched no weekly lineups (Yahoo,
// old snapshots, guest mode), in best-ball leagues (starters are
// auto-optimized there, so a "perfect lineup" re-decision measures nothing),
// or when no completed matchup has a scoreable lineup on both sides. The
// live current week is excluded, mirroring completedMatchups: partial scores
// would re-decide games that aren't over.

import type { League } from '@/types';
import { completedMatchups } from './completedMatchups';
import { bestLineupPoints } from './lineups';

export interface PerfectLineupRow {
  teamId: string;
  teamName: string;
  /** Completed matchups where both sides had a scoreable lineup. */
  weeks: number;
  optWins: number;
  optLosses: number;
  optTies: number;
  /** Same matchups' actual results, from the matchup scores. */
  actWins: number;
  actLosses: number;
  actTies: number;
  /**
   * (optWins + 0.5 * optTies) - (actWins + 0.5 * actTies), one decimal.
   * Positive = the manager left wins on the bench; negative = he won games
   * his best lineup wouldn't have (his opponent's lineup decisions helped).
   */
  winSwing: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

type LeagueSlice = Pick<
  League,
  'matchups' | 'status' | 'currentWeek' | 'weeklyLineups' | 'teams' | 'isBestBall'
>;

export function buildPerfectLineupRecord(league: LeagueSlice): PerfectLineupRow[] {
  if (league.isBestBall) return [];
  const lineups = league.weeklyLineups ?? [];
  if (lineups.length === 0) return [];
  const matchups = completedMatchups(league);
  if (matchups.length === 0) return [];

  // Best-possible score per team per week. A week is scoreable only when
  // every slot is a modeled one (bestLineupPoints returns null otherwise).
  const bestByTeamWeek = new Map<string, number>();
  for (const l of lineups) {
    const best = bestLineupPoints(l);
    if (best === null) continue;
    bestByTeamWeek.set(`${l.teamId}:${l.week}`, best);
  }

  const names = new Map(league.teams.map(t => [t.id, t.name]));
  const agg = new Map<
    string,
    { optW: number; optL: number; optT: number; actW: number; actL: number; actT: number; weeks: number }
  >();
  const bump = (teamId: string) => {
    let a = agg.get(teamId);
    if (!a) {
      a = { optW: 0, optL: 0, optT: 0, actW: 0, actL: 0, actT: 0, weeks: 0 };
      agg.set(teamId, a);
    }
    return a;
  };

  for (const m of matchups) {
    const best1 = bestByTeamWeek.get(`${m.team1Id}:${m.week}`);
    const best2 = bestByTeamWeek.get(`${m.team2Id}:${m.week}`);
    // Both sides must be scoreable, or the re-decision is fiction.
    if (best1 == null || best2 == null) continue;
    const a1 = bump(m.team1Id);
    const a2 = bump(m.team2Id);
    a1.weeks += 1;
    a2.weeks += 1;
    // Optimal result.
    if (best1 > best2) {
      a1.optW += 1;
      a2.optL += 1;
    } else if (best2 > best1) {
      a2.optW += 1;
      a1.optL += 1;
    } else {
      a1.optT += 1;
      a2.optT += 1;
    }
    // Actual result, same matchup.
    if (m.team1Points > m.team2Points) {
      a1.actW += 1;
      a2.actL += 1;
    } else if (m.team2Points > m.team1Points) {
      a2.actW += 1;
      a1.actL += 1;
    } else {
      a1.actT += 1;
      a2.actT += 1;
    }
  }

  const rows: PerfectLineupRow[] = [];
  for (const [teamId, a] of agg) {
    if (a.weeks === 0) continue;
    const optScore = a.optW + 0.5 * a.optT;
    const actScore = a.actW + 0.5 * a.actT;
    rows.push({
      teamId,
      teamName: names.get(teamId) ?? teamId,
      weeks: a.weeks,
      optWins: a.optW,
      optLosses: a.optL,
      optTies: a.optT,
      actWins: a.actW,
      actLosses: a.actL,
      actTies: a.actT,
      winSwing: round1(optScore - actScore),
    });
  }
  // Best perfect-lineup record first; ties break on the swing — the team
  // that left the most wins on the bench ranks first, since the table's
  // story is lineup management, not team quality.
  rows.sort((a, b) => {
    const pctA = (a.optWins + 0.5 * a.optTies) / a.weeks;
    const pctB = (b.optWins + 0.5 * b.optTies) / b.weeks;
    return pctB - pctA || b.winSwing - a.winSwing || a.actWins - b.actWins;
  });
  return rows;
}
