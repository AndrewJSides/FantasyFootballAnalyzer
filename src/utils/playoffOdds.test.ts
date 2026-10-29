// Playoff race: dominant teams are locks, winless teams are out, SOS ranks
// track opponent strength, and seeded runs are deterministic.

import { describe, it, expect } from 'vitest';
import { playoffRace } from './playoffOdds';
import type { League, Team, WeeklyMatchup } from '@/types';

function team(
  id: string,
  name: string,
  wins: number,
  losses: number,
  pointsFor: number,
): Team {
  return { id, name, wins, losses, ties: 0, pointsFor } as Team;
}

function matchup(week: number, a: string, b: string): WeeklyMatchup {
  return { week, team1Id: a, team1Points: 0, team2Id: b, team2Points: 0 };
}

const A = team('A', 'Alpha', 8, 0, 1200); // avg 150, dominant
const B = team('B', 'Beta', 6, 2, 1000); // avg 125
const C = team('C', 'Gamma', 3, 5, 900); // avg 112.5
const D = team('D', 'Delta', 1, 7, 800); // avg 100, weak

function league(overrides: Partial<League> = {}): League {
  return {
    id: 'test',
    name: 'Test League',
    platform: 'yahoo',
    season: 2026,
    draftType: 'snake',
    scoringType: 'ppr',
    totalTeams: 4,
    isLoaded: true,
    teams: [A, B, C, D],
    currentWeek: 9,
    playoffTeams: 2,
    futureSchedule: [
      matchup(9, 'A', 'D'),
      matchup(9, 'B', 'C'),
      matchup(10, 'A', 'D'),
      matchup(10, 'B', 'C'),
    ],
    ...overrides,
  } as League;
}

describe('playoffRace', () => {
  it('makes the dominant team a lock and the weak team a long shot', () => {
    const rows = playoffRace(league(), { simulations: 2000, seed: 42 });
    const byId = new Map(rows.map(r => [r.teamId, r]));
    expect(byId.get('A')!.playoffProb).toBeGreaterThanOrEqual(99);
    expect(byId.get('D')!.playoffProb).toBeLessThanOrEqual(5);
    expect(byId.get('B')!.playoffProb).toBeGreaterThan(
      byId.get('C')!.playoffProb,
    );
    // Sorted by probability, wins break ties.
    expect(rows.map(r => r.teamId)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('extracts remaining opponents in week order', () => {
    const rows = playoffRace(league(), { simulations: 10, seed: 1 });
    const a = rows.find(r => r.teamId === 'A')!;
    expect(a.remaining).toEqual([
      { week: 9, opponentId: 'D' },
      { week: 10, opponentId: 'D' },
    ]);
    expect(a.wins).toBe(8);
    expect(a.losses).toBe(0);
  });

  it('ranks schedule difficulty by opponent strength', () => {
    const rows = playoffRace(league(), { simulations: 10, seed: 1 });
    const byId = new Map(rows.map(r => [r.teamId, r]));
    // D faces the dominant A twice: toughest. A faces weak D twice: easiest.
    expect(byId.get('D')!.sosRank).toBe(1);
    expect(byId.get('A')!.sosRank).toBe(4);
    expect(byId.get('D')!.sos).toBeGreaterThan(byId.get('A')!.sos);
  });

  it('is deterministic for a fixed seed', () => {
    const run = () => playoffRace(league(), { simulations: 500, seed: 7 });
    expect(run()).toEqual(run());
  });

  it('ignores schedule weeks already played and returns empty without data', () => {
    const withPast = league({
      futureSchedule: [matchup(8, 'A', 'B'), ...league().futureSchedule!],
    });
    const rows = playoffRace(withPast, { simulations: 10, seed: 1 });
    const a = rows.find(r => r.teamId === 'A')!;
    expect(a.remaining.every(o => o.week >= 9)).toBe(true);

    expect(playoffRace(league({ futureSchedule: [] }))).toEqual([]);
    expect(playoffRace(league({ futureSchedule: undefined }))).toEqual([]);
    expect(playoffRace(league({ playoffTeams: undefined }))).toEqual([]);
  });
});
