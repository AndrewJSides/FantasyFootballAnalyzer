// Team scoring trend (backlog item 94): per completed week, the team's
// actual score, the league's average score that week, and the best lineup
// the team could have fielded. Pure data logic — the chart component file
// exports only the component (react-refresh rule).

import type { League } from '@/types';
import { completedMatchups } from '@/utils/completedMatchups';
import { bestLineupPoints } from '@/utils/lineups';

export interface TeamScoringWeek {
  week: number;
  /** The team's actual fantasy points that week. */
  points: number;
  /** Mean of every team's score in the completed matchups that week. */
  leagueAvg: number;
  /** Best legal lineup from league.weeklyLineups, null when unavailable. */
  bestLineup: number | null;
}

export interface TeamScoringTrend {
  weeks: TeamScoringWeek[];
  seasonAvg: number;
  bestWeek: number | null;
}

/**
 * Builds one row per completed week the team played, ordered by week.
 * Returns null when the team has no completed games (guest mode, old
 * snapshots, week 1 of a fresh season) — the section hides.
 */
export function buildTeamScoringTrend(
  league: Pick<League, 'matchups' | 'status' | 'currentWeek' | 'weeklyLineups'>,
  teamId: string,
): TeamScoringTrend | null {
  const matches = completedMatchups(league);
  const bestByWeek = new Map<number, number>();
  for (const lineup of league.weeklyLineups ?? []) {
    if (lineup.teamId !== teamId) continue;
    const pts = bestLineupPoints(lineup);
    if (pts !== null && !bestByWeek.has(lineup.week)) bestByWeek.set(lineup.week, pts);
  }

  const weeks: TeamScoringWeek[] = [];
  // League average per week, over both sides of every completed matchup
  // that actually scored (mirrors the TeamDetail weekly-rows filter).
  const weekScores = new Map<number, number[]>();
  for (const m of matches) {
    if (m.team1Points === 0 && m.team2Points === 0) continue;
    if (m.team1Points > 0) weekScores.set(m.week, [...(weekScores.get(m.week) ?? []), m.team1Points]);
    if (m.team2Points > 0) weekScores.set(m.week, [...(weekScores.get(m.week) ?? []), m.team2Points]);
  }

  for (const m of matches) {
    const isTeam1 = m.team1Id === teamId;
    const isTeam2 = m.team2Id === teamId;
    if (!isTeam1 && !isTeam2) continue;
    const points = isTeam1 ? m.team1Points : m.team2Points;
    const oppPoints = isTeam1 ? m.team2Points : m.team1Points;
    if (points === 0 && oppPoints === 0) continue;
    const scores = weekScores.get(m.week) ?? [];
    weeks.push({
      week: m.week,
      points,
      leagueAvg: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : points,
      bestLineup: bestByWeek.get(m.week) ?? null,
    });
  }
  weeks.sort((a, b) => a.week - b.week);
  if (weeks.length === 0) return null;

  let bestWeek = weeks[0].week;
  let bestPoints = weeks[0].points;
  let sum = 0;
  for (const w of weeks) {
    sum += w.points;
    if (w.points > bestPoints) {
      bestPoints = w.points;
      bestWeek = w.week;
    }
  }
  return { weeks, seasonAvg: sum / weeks.length, bestWeek };
}
