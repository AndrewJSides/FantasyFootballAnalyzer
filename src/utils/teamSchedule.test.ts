// teamSchedule: one team's season fixture list (backlog item 47).

import { describe, expect, it } from 'vitest';
import type { League, Team, WeeklyMatchup } from '@/types';
import { buildTeamSchedule } from './teamSchedule';

function mkTeam(id: string, name: string, extra: Partial<Team> = {}): Team {
  return {
    id,
    name,
    wins: 0,
    losses: 0,
    ties: 0,
    pointsFor: 0,
    ...extra,
  } as Team;
}

function league(fixture: {
  teams: Team[];
  matchups?: WeeklyMatchup[];
  futureSchedule?: WeeklyMatchup[];
  currentWeek?: number;
}): League {
  return {
    id: 'lg',
    platform: 'yahoo',
    name: 'League',
    season: 2026,
    draftType: 'snake',
    teams: fixture.teams,
    matchups: fixture.matchups ?? [],
    futureSchedule: fixture.futureSchedule ?? [],
    status: 'live',
    currentWeek: fixture.currentWeek ?? 8,
  } as League;
}

const TEAMS = [
  mkTeam('a', 'Alpha', { wins: 5, losses: 2, pointsFor: 700 }),
  mkTeam('b', 'Bravo', { wins: 2, losses: 5, pointsFor: 560 }),
  mkTeam('c', 'Charlie', { wins: 4, losses: 3, pointsFor: 650 }),
];

function matchup(week: number, a: string, b: string, aPts = 0, bPts = 0): WeeklyMatchup {
  return { week, team1Id: a, team1Points: aPts, team2Id: b, team2Points: bPts };
}

describe('buildTeamSchedule', () => {
  it('lists past games in week order with result, score, and opponent name', () => {
    const lg = league({
      teams: TEAMS,
      matchups: [
        matchup(2, 'b', 'a', 110.5, 120.2),
        matchup(1, 'a', 'c', 100.0, 90.0),
        matchup(3, 'c', 'b', 105.0, 95.0), // not alpha's game
      ],
    });
    const { past } = buildTeamSchedule(lg, 'a');
    expect(past.map(g => g.week)).toEqual([1, 2]);
    expect(past[0]).toMatchObject({
      opponentId: 'c',
      opponentName: 'Charlie',
      teamScore: 100.0,
      oppScore: 90.0,
      result: 'W',
    });
    expect(past[1]).toMatchObject({ opponentId: 'b', result: 'W' });
  });

  it('labels losses and ties from the team\'s perspective', () => {
    const lg = league({
      teams: TEAMS,
      matchups: [
        matchup(1, 'a', 'b', 90.0, 120.0),
        matchup(2, 'b', 'a', 100.0, 100.0),
      ],
    });
    const { past } = buildTeamSchedule(lg, 'a');
    expect(past.map(g => g.result)).toEqual(['L', 'T']);
    expect(past[0].teamScore).toBe(90.0);
    expect(past[0].oppScore).toBe(120.0);
  });

  it('skips unscored 0-0 matchups', () => {
    const lg = league({
      teams: TEAMS,
      matchups: [matchup(1, 'a', 'b', 0, 0), matchup(2, 'a', 'c', 110.0, 100.0)],
    });
    const { past } = buildTeamSchedule(lg, 'a');
    expect(past.map(g => g.week)).toEqual([2]);
  });

  it('lists future opponents with win probabilities that complement', () => {
    const lg = league({
      teams: TEAMS,
      futureSchedule: [
        matchup(9, 'b', 'a'),
        matchup(8, 'a', 'c'),
      ],
    });
    const { future } = buildTeamSchedule(lg, 'a');
    expect(future.map(g => g.week)).toEqual([8, 9]);
    expect(future[0]).toMatchObject({ opponentId: 'c', opponentName: 'Charlie' });
    const wp = future.map(g => g.winProb);
    for (const p of wp) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    }
    // Alpha is the stronger team, so it is favored in both games.
    expect(wp[0]).toBeGreaterThan(50);
    expect(wp[1]).toBeGreaterThan(50);
    // Complementary with the other side's view (within rounding).
    const other = buildTeamSchedule(lg, 'b').future.find(g => g.opponentId === 'a');
    expect(Math.abs(wp[1] + (other?.winProb ?? 0) - 100)).toBeLessThan(0.2);
  });

  it('returns empty lists when there is no data', () => {
    const { past, future } = buildTeamSchedule(league({ teams: TEAMS }), 'a');
    expect(past).toEqual([]);
    expect(future).toEqual([]);
  });
});
