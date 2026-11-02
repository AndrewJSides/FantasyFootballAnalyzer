import { describe, expect, it } from 'vitest';
import { buildTeamScoringTrend } from '@/utils/teamScoringTrend';
import type { League } from '@/types';

const baseLeague = {
  status: 'live',
  currentWeek: 8,
  teams: [
    { id: 't1', name: 'Alpha' },
    { id: 't2', name: 'Beta' },
    { id: 't3', name: 'Gamma' },
    { id: 't4', name: 'Delta' },
  ],
  matchups: [
    { week: 1, team1Id: 't1', team1Points: 120, team2Id: 't2', team2Points: 100 },
    { week: 1, team1Id: 't3', team1Points: 90, team2Id: 't4', team2Points: 110 },
    { week: 2, team1Id: 't1', team1Points: 80, team2Id: 't3', team2Points: 130 },
    { week: 2, team1Id: 't2', team1Points: 95, team2Id: 't4', team2Points: 105 },
    // Week 8 is live — excluded from the trend.
    { week: 8, team1Id: 't1', team1Points: 60, team2Id: 't2', team2Points: 40 },
  ],
  weeklyLineups: [
    {
      week: 1,
      teamId: 't1',
      slots: ['QB', 'RB'],
      starters: [
        { name: 'A', pos: 'QB', points: 25 },
        { name: 'B', pos: 'RB', points: 20 },
      ],
      bench: [{ name: 'C', pos: 'QB', points: 30 }],
    },
  ],
} as unknown as League;

describe('buildTeamScoringTrend', () => {
  it('builds one row per completed week with the league average', () => {
    const trend = buildTeamScoringTrend(baseLeague, 't1');
    expect(trend).not.toBeNull();
    expect(trend!.weeks.map(w => w.week)).toEqual([1, 2]);
    // Week 1 league average: (120 + 100 + 90 + 110) / 4 = 105.
    expect(trend!.weeks[0].leagueAvg).toBeCloseTo(105, 5);
    expect(trend!.weeks[0].points).toBe(120);
    // Week 2 league average: (80 + 130 + 95 + 105) / 4 = 102.5.
    expect(trend!.weeks[1].leagueAvg).toBeCloseTo(102.5, 5);
    expect(trend!.seasonAvg).toBeCloseTo(100, 5);
    expect(trend!.bestWeek).toBe(1);
  });

  it('prices the best lineup where weekly lineups exist', () => {
    const trend = buildTeamScoringTrend(baseLeague, 't1');
    // QB C (30) + RB B (20) = 50 beats the actual 45 started.
    expect(trend!.weeks[0].bestLineup).toBe(50);
    expect(trend!.weeks[1].bestLineup).toBeNull();
  });

  it('returns null with no completed games', () => {
    const empty = buildTeamScoringTrend(
      { ...baseLeague, matchups: [] } as unknown as League,
      't1',
    );
    expect(empty).toBeNull();
  });

  it('keeps all weeks for a final league and skips zeroed matchups', () => {
    const league = {
      ...baseLeague,
      status: 'final',
      currentWeek: 18,
      matchups: [
        { week: 8, team1Id: 't1', team1Points: 0, team2Id: 't2', team2Points: 0 },
        { week: 9, team1Id: 't1', team1Points: 111, team2Id: 't2', team2Points: 99 },
      ],
    } as unknown as League;
    const trend = buildTeamScoringTrend(league, 't1');
    expect(trend!.weeks.map(w => w.week)).toEqual([9]);
    expect(trend!.weeks[0].leagueAvg).toBeCloseTo(105, 5);
  });
});
