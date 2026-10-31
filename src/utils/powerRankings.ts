// Team Power Rankings — backlog item 56: a single backward-looking
// team-strength number per team. Each team's season scoring average,
// shrunk toward the league mean with the same 2-game shrinkage the
// Playoff Race sims run on, so a one-week explosion can't over-swing a
// rating. Ranked best first, with a last-3-weeks form trend.
//
// FantasyPros' League Analyzer publishes a power ranking as its headline
// in-season team rating (public feature description only); this one is
// TraderApe's own completed-week matchup scores, so no data source was
// copied and no copied content ships. Team Grades answers the
// forward-looking version of this question (projected ROS points); this
// is the backward-looking complement: what each team has actually done.
//
// Hides itself (returns []) when the sync fetched no completed matchups
// (old snapshots, guest mode). The live current week is excluded,
// mirroring completedMatchups: partial scores would punish teams mid-week.

import type { League } from '@/types';
import { completedMatchups } from './completedMatchups';

export type PowerTrend = 'hot' | 'steady' | 'cold';

export interface PowerRankingRow {
  teamId: string;
  teamName: string;
  /** Completed weeks the team scored in. */
  weeks: number;
  /** Season scoring average over completed weeks, one decimal. */
  avg: number;
  /** Avg shrunk toward the league mean (2 shrink games), one decimal. */
  rating: number;
  /** Avg over the 3 most recent completed weeks; null under 3 weeks. */
  last3: number | null;
  /** vs the team's own season avg (±5%); null when last3 is null. */
  trend: PowerTrend | null;
}

/** Shrinkage games — matches the Playoff Race model's pull to the mean. */
const SHRINK_GAMES = 2;

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildPowerRankings(
  league: Pick<League, 'matchups' | 'status' | 'currentWeek' | 'teams'>,
): PowerRankingRow[] {
  const matchups = completedMatchups(league);
  if (matchups.length === 0) return [];

  // week -> teamId -> points, newest weeks last for the last-3 read.
  const byWeek = new Map<number, Map<string, number>>();
  for (const m of matchups) {
    let sheet = byWeek.get(m.week);
    if (!sheet) {
      sheet = new Map();
      byWeek.set(m.week, sheet);
    }
    sheet.set(m.team1Id, m.team1Points);
    sheet.set(m.team2Id, m.team2Points);
  }
  const weeksAsc = [...byWeek.keys()].sort((a, b) => a - b);

  // Per-team score lists in week order. A team's "last 3" is its own three
  // most recent played weeks, so a bye or a playoff-bracket week off never
  // reads as a cold streak.
  const lists = new Map<string, number[]>();
  for (const week of weeksAsc) {
    for (const [id, pts] of byWeek.get(week)!) {
      let list = lists.get(id);
      if (!list) {
        list = [];
        lists.set(id, list);
      }
      list.push(pts);
    }
  }

  const avgs = [...lists.values()].map(l => l.reduce((s, p) => s + p, 0) / l.length);
  const leagueMean = avgs.reduce((s, a) => s + a, 0) / Math.max(1, avgs.length);

  const teams = new Map(league.teams.map(t => [t.id, t]));
  const rows: PowerRankingRow[] = [];
  for (const [id, list] of lists) {
    const avg = round1(list.reduce((s, p) => s + p, 0) / list.length);
    const rating = round1(
      (avg * list.length + leagueMean * SHRINK_GAMES) / (list.length + SHRINK_GAMES),
    );
    let last3: number | null = null;
    let trend: PowerTrend | null = null;
    if (list.length >= 3) {
      const recent = list.slice(-3);
      last3 = round1(recent.reduce((s, p) => s + p, 0) / 3);
      trend = last3 > avg * 1.05 ? 'hot' : last3 < avg * 0.95 ? 'cold' : 'steady';
    }
    rows.push({
      teamId: id,
      teamName: teams.get(id)?.name ?? id,
      weeks: list.length,
      avg,
      rating,
      last3,
      trend,
    });
  }

  rows.sort((a, b) => b.rating - a.rating || b.avg - a.avg);
  return rows;
}
