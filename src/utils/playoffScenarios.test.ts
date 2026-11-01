// Playoff Scenarios (backlog item 72): forced results move the modeled
// playoff odds in the right direction, presets build picks, and invalid
// inputs return null.

import { describe, it, expect } from 'vitest';
import { playoffRace } from './playoffOdds';
import { runScenario, scenarioPreset } from './playoffScenarios';
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

const A = team('A', 'Alpha', 8, 0, 1200); // avg 150, lock
const B = team('B', 'Beta', 5, 3, 1000); // avg 125, bubble
const C = team('C', 'Gamma', 5, 3, 900); // avg 112.5, bubble
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

describe('playoffRace forceResults', () => {
  it('forces the named games by fiat in both team orientations', () => {
    const base = playoffRace(league(), { simulations: 2000, seed: 7 });
    const forced = playoffRace(league(), {
      simulations: 2000,
      seed: 7,
      forceResults: [
        { teamId: 'B', week: 9, result: 'loss' },
        { teamId: 'B', week: 10, result: 'loss' },
      ],
    });
    const prob = (rows: ReturnType<typeof playoffRace>, id: string) =>
      rows.find(r => r.teamId === id)!.playoffProb;
    expect(prob(forced, 'B')).toBeLessThan(prob(base, 'B'));
    expect(prob(forced, 'C')).toBeGreaterThan(prob(base, 'C'));
    // The forced games read as locks in the game-by-game win probabilities.
    const b = forced.find(r => r.teamId === 'B')!;
    expect(b.remaining.map(o => o.winProb)).toEqual([0, 0]);
  });

  it('ignores forced entries naming a week the team does not play', () => {
    const base = playoffRace(league(), { simulations: 2000, seed: 7 });
    const forced = playoffRace(league(), {
      simulations: 2000,
      seed: 7,
      forceResults: [{ teamId: 'B', week: 11, result: 'win' }],
    });
    const prob = (rows: ReturnType<typeof playoffRace>, id: string) =>
      rows.find(r => r.teamId === id)!.playoffProb;
    expect(prob(forced, 'B')).toBe(prob(base, 'B'));
  });

  it('forceNextGame still forces the earliest remaining game (clinchWatch)', () => {
    const rows = playoffRace(league(), {
      simulations: 2000,
      seed: 7,
      forceNextGame: { teamId: 'D', result: 'win' },
    });
    const d = rows.find(r => r.teamId === 'D')!;
    // D's week-9 game vs A is forced to a win.
    expect(d.remaining[0].winProb).toBe(100);
    expect(d.remaining[1].winProb).toBeLessThan(100);
  });
});

describe('runScenario', () => {
  it('returns null with no picks, an unknown team, or no playoff field', () => {
    expect(runScenario(league(), 'C', {}, { seed: 7 })).toBeNull();
    expect(runScenario(league(), 'ZZZ', { 9: 'win' }, { seed: 7 })).toBeNull();
    expect(
      runScenario(league({ playoffTeams: undefined }), 'C', { 9: 'win' }, { seed: 7 }),
    ).toBeNull();
  });

  it('a win-out scenario raises the bubble team vs the modeled base', () => {
    const run = runScenario(league(), 'C', { 9: 'win', 10: 'win' }, { seed: 7 })!;
    expect(run.pickCount).toBe(2);
    expect(run.oddsDelta).toBeGreaterThan(0);
    expect(run.winsDelta).toBeGreaterThan(0);
    expect(run.entry.playoffProb).toBe(run.base.playoffProb + run.oddsDelta);
  });

  it('a lose-out scenario lowers the contender vs the modeled base', () => {
    const run = runScenario(league(), 'B', { 9: 'loss', 10: 'loss' }, { seed: 7 })!;
    expect(run.oddsDelta).toBeLessThan(0);
    expect(run.winsDelta).toBeLessThan(0);
  });

  it('scenarioPreset forces every listed week', () => {
    expect(scenarioPreset([9, 10, 11], 'win')).toEqual({
      9: 'win',
      10: 'win',
      11: 'win',
    });
    expect(scenarioPreset([], 'loss')).toEqual({});
  });
});
