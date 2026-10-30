// Lineup efficiency — how well each manager sets his weekly lineup: the
// points his actual starters scored vs the points his best legal lineup would
// have scored, summed over completed weeks. Best-vs-actual per week reuses
// lineups.ts's bestLineupPoints/actualPoints (the same math the lineup awards
// run on), so the awards and this table can never disagree.
//
// Hides itself (returns []) when the sync fetched no weekly lineups (Yahoo,
// old snapshots, guest mode), in best-ball leagues (starters are
// auto-optimized there, so "efficiency" measures nothing), or when no
// completed week has scoreable lineups. The live current week is excluded,
// mirroring completedMatchups: partial scores would punish teams mid-week.

import type { League } from '@/types';
import { actualPoints, bestLineupPoints } from './lineups';

export interface LineupEfficiencyRow {
  teamId: string;
  teamName: string;
  /** Completed weeks with a scoreable lineup. */
  weeks: number;
  /** Sum of actual starter points over the scored weeks, 2dp. */
  actual: number;
  /** Sum of best-legal-lineup points over the scored weeks, 2dp. */
  best: number;
  /** actual / best * 100, one decimal. */
  efficiency: number;
  /** Points left on the bench over the scored weeks, 2dp. */
  leftOnBench: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildLineupEfficiency(
  league: Pick<
    League,
    'weeklyLineups' | 'status' | 'currentWeek' | 'teams' | 'isBestBall'
  >,
): LineupEfficiencyRow[] {
  if (league.isBestBall) return [];
  const lineups = league.weeklyLineups ?? [];
  if (lineups.length === 0) return [];
  // Same cutoff as completedMatchups: the in-progress week's partial scores
  // are not a final lineup.
  const currentWeek =
    league.status === 'live' && league.currentWeek ? league.currentWeek : null;
  const names = new Map(league.teams.map(t => [t.id, t.name]));
  const agg = new Map<
    string,
    { actual: number; best: number; weeks: number }
  >();
  for (const l of lineups) {
    if (currentWeek !== null && l.week >= currentWeek) continue;
    const best = bestLineupPoints(l);
    if (best === null) continue; // Unknown slot type — week unscoreable.
    const a = agg.get(l.teamId) ?? { actual: 0, best: 0, weeks: 0 };
    a.actual += actualPoints(l);
    a.best += best;
    a.weeks += 1;
    agg.set(l.teamId, a);
  }
  const rows: LineupEfficiencyRow[] = [];
  for (const [teamId, a] of agg) {
    if (a.weeks === 0 || a.best <= 0) continue;
    const actual = Math.round(a.actual * 100) / 100;
    const best = Math.round(a.best * 100) / 100;
    rows.push({
      teamId,
      teamName: names.get(teamId) ?? teamId,
      weeks: a.weeks,
      actual,
      best,
      efficiency: round1((actual / best) * 100),
      leftOnBench: Math.round((best - actual) * 100) / 100,
    });
  }
  rows.sort((a, b) => b.efficiency - a.efficiency || b.actual - a.actual);
  return rows;
}
