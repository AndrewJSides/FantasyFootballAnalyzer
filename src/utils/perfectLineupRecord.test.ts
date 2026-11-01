import { describe, it, expect } from 'vitest';
import type { League, WeeklyLineup, WeeklyMatchup } from '@/types';
import { buildPerfectLineupRecord } from './perfectLineupRecord';

// Minimal scoreable lineup: one QB slot, starters + bench with points.
const lineup = (teamId: string, week: number, starterPts: number, benchPts: number[]): WeeklyLineup => ({
  week,
  teamId,
  slots: ['QB'],
  starters: [{ id: `${teamId}-qb`, name: 'QB', pos: 'QB', points: starterPts }],
  bench: benchPts.map((p, i) => ({ id: `${teamId}-b${i}`, name: `B${i}`, pos: 'QB', points: p })),
});

const matchup = (week: number, t1: number, t2: number): WeeklyMatchup => ({
  week,
  team1Id: 'a',
  team1Points: t1,
  team2Id: 'b',
  team2Points: t2,
});

const baseLeague = {
  teams: [
    { id: 'a', name: 'Alpha' },
    { id: 'b', name: 'Beta' },
  ],
  status: 'live',
  currentWeek: 3,
  isBestBall: false,
} as unknown as League;

describe('buildPerfectLineupRecord', () => {
  it('re-decides each completed matchup on best-possible lineups', () => {
    // W1: A starts 10 (best 10), B starts 8 (best 20) -> actual A wins, optimal B wins.
    // W2: A starts 15 (best 15), B starts 12 (best 12) -> both win both ways.
    const league = {
      ...baseLeague,
      matchups: [matchup(1, 10, 8), matchup(2, 15, 12)],
      weeklyLineups: [
        lineup('a', 1, 10, [5]),
        lineup('b', 1, 8, [20]),
        lineup('a', 2, 15, [3]),
        lineup('b', 2, 12, [4]),
      ],
    } as unknown as League;
    const rows = buildPerfectLineupRecord(league);
    expect(rows).toHaveLength(2);
    const a = rows.find(r => r.teamId === 'a')!;
    const b = rows.find(r => r.teamId === 'b')!;
    // Optimal: A 1-1 (wins W2, loses W1), B 1-1 (wins W1, loses W2).
    expect([a.optWins, a.optLosses, a.optTies]).toEqual([1, 1, 0]);
    expect([b.optWins, b.optLosses, b.optTies]).toEqual([1, 1, 0]);
    // Actual: A 2-0, B 0-2.
    expect([a.actWins, a.actLosses, a.actTies]).toEqual([2, 0, 0]);
    expect([b.actWins, b.actLosses, b.actTies]).toEqual([0, 2, 0]);
    // A left nothing on the bench in W1 — B did: B's 20-pt bench QB would
    // have won W1 optimally. A stole that win (-1); B left it on the bench (+1).
    expect(a.winSwing).toBe(-1);
    expect(b.winSwing).toBe(1);
    expect(a.weeks).toBe(2);
  });

  it('counts ties when best-possible scores are equal', () => {
    const league = {
      ...baseLeague,
      matchups: [matchup(1, 10, 12)],
      weeklyLineups: [lineup('a', 1, 10, []), lineup('b', 1, 12, [])],
    } as unknown as League;
    const rows = buildPerfectLineupRecord(league);
    // Best: 10 vs 12 -> B wins optimally; actual B wins too.
    expect(rows.find(r => r.teamId === 'b')!.optWins).toBe(1);
    const tied = {
      ...baseLeague,
      matchups: [matchup(1, 10, 10)],
      weeklyLineups: [lineup('a', 1, 10, []), lineup('b', 1, 10, [])],
    } as unknown as League;
    const tiedRows = buildPerfectLineupRecord(tied);
    expect(tiedRows.find(r => r.teamId === 'a')!.optTies).toBe(1);
    expect(tiedRows.find(r => r.teamId === 'a')!.winSwing).toBe(0);
  });

  it('skips matchups where either side has no scoreable lineup', () => {
    const league = {
      ...baseLeague,
      matchups: [matchup(1, 10, 8), matchup(2, 15, 12)],
      // B has no W2 lineup: W2 is skipped for both teams.
      weeklyLineups: [lineup('a', 1, 10, [5]), lineup('b', 1, 8, [20]), lineup('a', 2, 15, [3])],
    } as unknown as League;
    const rows = buildPerfectLineupRecord(league);
    expect(rows.find(r => r.teamId === 'a')!.weeks).toBe(1);
    expect(rows.find(r => r.teamId === 'b')!.weeks).toBe(1);
  });

  it('excludes the in-progress week', () => {
    const league = {
      ...baseLeague,
      currentWeek: 2,
      matchups: [matchup(1, 10, 8), matchup(2, 50, 1)],
      weeklyLineups: [
        lineup('a', 1, 10, [5]),
        lineup('b', 1, 8, [20]),
        lineup('a', 2, 50, []),
        lineup('b', 2, 1, []),
      ],
    } as unknown as League;
    const rows = buildPerfectLineupRecord(league);
    expect(rows.find(r => r.teamId === 'a')!.weeks).toBe(1);
  });

  it('hides with no weekly lineups, in best-ball leagues, or with no completed matchups', () => {
    const noLineups = { ...baseLeague, matchups: [matchup(1, 10, 8)] } as unknown as League;
    expect(buildPerfectLineupRecord(noLineups)).toEqual([]);
    const bestBall = {
      ...baseLeague,
      isBestBall: true,
      matchups: [matchup(1, 10, 8)],
      weeklyLineups: [lineup('a', 1, 10, []), lineup('b', 1, 8, [])],
    } as unknown as League;
    expect(buildPerfectLineupRecord(bestBall)).toEqual([]);
    const noMatchups = {
      ...baseLeague,
      weeklyLineups: [lineup('a', 1, 10, []), lineup('b', 1, 8, [])],
    } as unknown as League;
    expect(buildPerfectLineupRecord(noMatchups)).toEqual([]);
  });

  it('ranks by optimal win pct first', () => {
    // A: optimal 1-0 (pct 1.0). B: optimal 0-1. A ranks first.
    const league = {
      ...baseLeague,
      matchups: [matchup(1, 10, 8)],
      weeklyLineups: [lineup('a', 1, 10, [30]), lineup('b', 1, 8, [9])],
    } as unknown as League;
    const rows = buildPerfectLineupRecord(league);
    expect(rows[0].teamId).toBe('a');
    expect(rows[0].optWins).toBe(1);
  });
});
