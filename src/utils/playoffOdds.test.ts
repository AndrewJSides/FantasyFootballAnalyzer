// Playoff race: dominant teams are locks, winless teams are out, SOS ranks
// track opponent strength, and seeded runs are deterministic.

import { describe, it, expect } from 'vitest';
import {
  playoffRace,
  simulateBracketChampion,
  simulateBracketRounds,
  mulberry32,
} from './playoffOdds';
import type { BracketSeed } from './playoffOdds';
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
    expect(a.remaining.map(o => [o.week, o.opponentId])).toEqual([
      [9, 'D'],
      [10, 'D'],
    ]);
    expect(a.remaining.every(o => o.winProb >= 0 && o.winProb <= 100)).toBe(true);
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

  it('prices per-game win probability on the same simulations', () => {
    const rows = playoffRace(league(), { simulations: 5000, seed: 42 });
    const byId = new Map(rows.map(r => [r.teamId, r]));
    // A (avg 150) vs D (avg 100) is a heavy favorite; B vs C is close.
    const aVsD = byId.get('A')!.remaining[0].winProb;
    const dVsA = byId.get('D')!.remaining[0].winProb;
    expect(aVsD).toBeGreaterThan(90);
    expect(dVsA).toBeLessThan(10);
    // Complementary within rounding.
    expect(Math.abs(aVsD + dVsA - 100)).toBeLessThanOrEqual(0.1);
    const bVsC = byId.get('B')!.remaining[0].winProb;
    // B outscores C by ~12.5/game: a clear favorite, not a coin flip, not a lock.
    expect(bVsC).toBeGreaterThan(50);
    expect(bVsC).toBeLessThan(80);
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

  it('projects final records from the same simulations', () => {
    const rows = playoffRace(league(), { simulations: 2000, seed: 42 });
    const byId = new Map(rows.map(r => [r.teamId, r]));
    const a = byId.get('A')!;
    const d = byId.get('D')!;
    // Dominant team nearly sweeps its two soft games; weak team nearly none.
    expect(a.projectedWins).toBeGreaterThanOrEqual(9.5);
    expect(a.projectedWins).toBeLessThanOrEqual(10);
    expect(d.projectedWins).toBeGreaterThanOrEqual(1);
    expect(d.projectedWins).toBeLessThanOrEqual(1.5);
    expect(d.projectedLosses).toBeGreaterThanOrEqual(8.5);
    // Wins + losses + ties must account for every played + remaining game.
    for (const r of rows) {
      const total = r.projectedWins + r.projectedLosses + r.ties;
      expect(total).toBeCloseTo(10, 1);
    }
    // One-decimal precision.
    for (const r of rows) {
      expect(r.projectedWins).toBe(Math.round(r.projectedWins * 10) / 10);
      expect(r.projectedLosses).toBe(Math.round(r.projectedLosses * 10) / 10);
    }
  });

  it('is deterministic for projected records with a seed', () => {
    const first = playoffRace(league(), { simulations: 500, seed: 7 });
    const second = playoffRace(league(), { simulations: 500, seed: 7 });
    expect(first.map(r => [r.projectedWins, r.projectedLosses])).toEqual(
      second.map(r => [r.projectedWins, r.projectedLosses]),
    );
  });

  it('projects final seeds from the same simulations', () => {
    const rows = playoffRace(league(), { simulations: 2000, seed: 42 });
    const byId = new Map(rows.map(r => [r.teamId, r]));
    const a = byId.get('A')!;
    const b = byId.get('B')!;
    const c = byId.get('C')!;
    const d = byId.get('D')!;
    // Dominant A is nearly the 1 seed; weak D is nearly the 4 seed.
    expect(a.projectedSeed).toBeLessThan(1.5);
    expect(b.projectedSeed).toBeLessThan(c.projectedSeed);
    expect(c.projectedSeed).toBeLessThan(d.projectedSeed);
    expect(d.projectedSeed).toBeGreaterThan(3.5);
    // Every sim assigns seeds 1..4, so the league mean seed is always 2.5.
    const meanSeed =
      (a.projectedSeed + b.projectedSeed + c.projectedSeed + d.projectedSeed) / 4;
    expect(meanSeed).toBeCloseTo(2.5, 1);
    for (const r of rows) {
      expect(r.projectedSeed).toBeGreaterThanOrEqual(1);
      expect(r.projectedSeed).toBeLessThanOrEqual(4);
      // One-decimal precision.
      expect(r.projectedSeed).toBe(Math.round(r.projectedSeed * 10) / 10);
    }
    // Deterministic with a seed.
    const again = playoffRace(league(), { simulations: 2000, seed: 42 });
    expect(again.map(r => r.projectedSeed)).toEqual(rows.map(r => r.projectedSeed));
  });

  it('marks clinched, eliminated, and alive teams', () => {
    const x = team('X', 'Ex', 8, 0, 1200); // 8 wins already: can't miss top 2
    const z = team('Z', 'Zed', 4, 4, 920); // 4-4: second spot is up for grabs
    const w = team('W', 'Dub', 4, 4, 896); // 4-4: the rival for it
    const y = team('Y', 'Why', 0, 8, 800); // 0 wins: can't catch anyone
    const lg = league({
      teams: [x, z, w, y],
      playoffTeams: 2,
      futureSchedule: [matchup(9, 'X', 'Y'), matchup(9, 'Z', 'W'), matchup(10, 'X', 'Y'), matchup(10, 'Z', 'W')],
    });
    const rows = playoffRace(lg, { simulations: 2000, seed: 42 });
    const byId = new Map(rows.map(r => [r.teamId, r]));
    // X never finishes worse than 8 wins: clinched. Y can never reach 2: eliminated.
    expect(byId.get('X')!.playoffStatus).toBe('clinched');
    expect(byId.get('Y')!.playoffStatus).toBe('eliminated');
    // Z wins the second spot in some sims and loses it in others: alive.
    expect(byId.get('Z')!.playoffStatus).toBe('alive');
  });

  it('prices championship odds on fully simulated brackets', () => {
    const rows = playoffRace(league(), { simulations: 2000, seed: 42 });
    const byId = new Map(rows.map(r => [r.teamId, r]));
    const a = byId.get('A')!;
    const b = byId.get('B')!;
    const c = byId.get('C')!;
    const d = byId.get('D')!;
    // Bounds, one-decimal precision.
    for (const r of rows) {
      expect(r.championProb).toBeGreaterThanOrEqual(0);
      expect(r.championProb).toBeLessThanOrEqual(100);
      expect(r.championProb).toBe(Math.round(r.championProb * 10) / 10);
    }
    // The dominant team is the title favorite; C and D never make the
    // playoff field here, so neither can win the title.
    expect(a.championProb).toBeGreaterThan(60);
    expect(a.championProb).toBeGreaterThan(b.championProb);
    expect(b.championProb).toBeGreaterThanOrEqual(c.championProb);
    expect(c.championProb).toBeGreaterThanOrEqual(d.championProb);
    expect(c.championProb).toBe(0);
    expect(d.championProb).toBe(0);
    // No title without a playoff berth.
    for (const r of rows) {
      expect(r.championProb).toBeLessThanOrEqual(r.playoffProb);
    }
    // Every sim crowns exactly one champion: the shares sum to ~100.
    const total = rows.reduce((sum, r) => sum + r.championProb, 0);
    expect(total).toBeGreaterThan(99.5);
    expect(total).toBeLessThan(100.5);
    // Deterministic with a seed (covers the bracket sim's rand usage).
    const again = playoffRace(league(), { simulations: 2000, seed: 42 });
    expect(again.map(r => r.championProb)).toEqual(rows.map(r => r.championProb));
  });

  it('never crowns a team that misses the playoffs in every sim', () => {
    const x = team('X', 'Ex', 8, 0, 1200);
    const z = team('Z', 'Zed', 4, 4, 920);
    const w = team('W', 'Dub', 4, 4, 896);
    const y = team('Y', 'Why', 0, 8, 800);
    const lg = league({
      teams: [x, z, w, y],
      playoffTeams: 2,
      futureSchedule: [matchup(9, 'X', 'Y'), matchup(9, 'Z', 'W'), matchup(10, 'X', 'Y'), matchup(10, 'Z', 'W')],
    });
    const rows = playoffRace(lg, { simulations: 2000, seed: 42 });
    const byId = new Map(rows.map(r => [r.teamId, r]));
    expect(byId.get('Y')!.playoffStatus).toBe('eliminated');
    expect(byId.get('Y')!.championProb).toBe(0);
    expect(byId.get('X')!.championProb).toBeGreaterThan(50);
  });

  it('records per-round advancement odds aligned with the bracket rounds', () => {
    const lg = league({
      teams: [
        team('A', 'Alpha', 8, 0, 1200),
        team('B', 'Beta', 5, 3, 1000),
        team('C', 'Gamma', 4, 4, 960),
        team('D', 'Delta', 3, 5, 920),
        team('E', 'Epsilon', 2, 6, 880),
        team('F', 'Zeta', 1, 7, 840),
      ],
      totalTeams: 6,
      playoffTeams: 6,
      futureSchedule: [
        matchup(9, 'A', 'F'),
        matchup(9, 'B', 'E'),
        matchup(9, 'C', 'D'),
        matchup(10, 'A', 'E'),
        matchup(10, 'B', 'D'),
        matchup(10, 'C', 'F'),
      ],
    });
    const rows = playoffRace(lg, { simulations: 2000, seed: 42 });
    const byId = new Map(rows.map(r => [r.teamId, r]));
    for (const r of rows) {
      // 6-team bracket: quarterfinal, semifinal, final.
      expect(r.roundProbs).toHaveLength(3);
      for (const p of r.roundProbs) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(100);
        expect(p).toBe(Math.round(p * 10) / 10);
      }
      // Nested counts: no later-round win without the earlier one.
      expect(r.roundProbs[0]).toBeGreaterThanOrEqual(r.roundProbs[1]);
      expect(r.roundProbs[1]).toBeGreaterThanOrEqual(r.roundProbs[2]);
      // The final round's winners are the champions.
      expect(r.roundProbs[2]).toBe(r.championProb);
    }
    // Dominant A is always a top-two seed, so it byes the quarters.
    expect(byId.get('A')!.roundProbs[0]).toBe(100);
    expect(byId.get('A')!.roundProbs[2]).toBeGreaterThan(
      byId.get('F')!.roundProbs[2],
    );
    // Deterministic with a seed.
    const again = playoffRace(lg, { simulations: 2000, seed: 42 });
    expect(again.map(r => r.roundProbs)).toEqual(rows.map(r => r.roundProbs));
  });

  it('aligns roundProbs with championProb on the 2-team bracket', () => {
    const rows = playoffRace(league(), { simulations: 2000, seed: 42 });
    for (const r of rows) {
      expect(r.roundProbs).toHaveLength(1);
      expect(r.roundProbs[0]).toBe(r.championProb);
    }
  });
});

describe('simulateBracketRounds', () => {
  const seeds = (n: number): BracketSeed[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `S${i + 1}`,
      seed: i + 1,
      rating: 100,
    }));
  const favorFirst = () => 1;
  const favorSecond = () => 0;
  const fresh = () => mulberry32(1234);
  const ids = (rounds: BracketSeed[][]) =>
    rounds.map(r => r.map(s => s.id));

  it('returns empty for no entrants and a single round for one entrant', () => {
    expect(simulateBracketRounds([], favorFirst, fresh())).toEqual([]);
    expect(ids(simulateBracketRounds(seeds(1), favorFirst, fresh()))).toEqual([
      ['S1'],
    ]);
  });

  it('plays the 6-team shape round by round, byeing the top two seeds', () => {
    // First side always wins: 3 beats 6, 4 beats 5; 1 beats 3, 2 beats 4;
    // 1 beats 2 in the final.
    expect(ids(simulateBracketRounds(seeds(6), favorFirst, fresh()))).toEqual([
      ['S1', 'S2', 'S3', 'S4'],
      ['S1', 'S2'],
      ['S1'],
    ]);
    // Second side always wins: 6 beats 3, 5 beats 4; then 6 beats 1,
    // 5 beats 2; 5 beats 6 in the final.
    expect(ids(simulateBracketRounds(seeds(6), favorSecond, fresh()))).toEqual(
      [['S1', 'S2', 'S5', 'S6'], ['S5', 'S6'], ['S5']],
    );
  });

  it('plays the 4-team semifinal shape round by round', () => {
    expect(ids(simulateBracketRounds(seeds(4), favorSecond, fresh()))).toEqual([
      ['S3', 'S4'],
      ['S3'],
    ]);
  });

  it('agrees with simulateBracketChampion on the champion', () => {
    for (let i = 0; i < 20; i++) {
      const rounds = simulateBracketRounds(seeds(6), mulberry32(i), fresh());
      const last = rounds[rounds.length - 1];
      expect(last).toHaveLength(1);
      expect(simulateBracketChampion(seeds(6), mulberry32(i), fresh())).toBe(
        last[0].id,
      );
    }
  });
});

describe('simulateBracketChampion', () => {
  const seeds = (n: number): BracketSeed[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `S${i + 1}`,
      seed: i + 1,
      rating: 100,
    }));
  const favorFirst = () => 1;
  const favorSecond = () => 0;
  const fresh = () => mulberry32(1234);

  it('crowns the top seed when it always wins', () => {
    expect(simulateBracketChampion(seeds(6), favorFirst, fresh())).toBe('S1');
    expect(simulateBracketChampion(seeds(4), favorFirst, fresh())).toBe('S1');
    expect(simulateBracketChampion(seeds(5), favorFirst, fresh())).toBe('S1');
    expect(simulateBracketChampion(seeds(2), favorFirst, fresh())).toBe('S1');
    expect(simulateBracketChampion(seeds(1), favorFirst, fresh())).toBe('S1');
  });

  it('follows the standard 6-team shape (3v6, 4v5 quarters; top seeds byed)', () => {
    // Second side always wins: seed 6 beats seed 3, seed 5 beats seed 4;
    // then seed 6 beats seed 1, seed 5 beats seed 2; seed 5 wins the final.
    expect(simulateBracketChampion(seeds(6), favorSecond, fresh())).toBe('S5');
    // First side always wins: 3 beats 6, 4 beats 5; 1 beats 3, 2 beats 4;
    // 1 beats 2 in the final.
    expect(simulateBracketChampion(seeds(6), favorFirst, fresh())).toBe('S1');
  });

  it('follows the 4-team semifinal shape (1v4, 2v3)', () => {
    // Seed 4 beats seed 1, seed 3 beats seed 2; seed 3 beats seed 4.
    expect(simulateBracketChampion(seeds(4), favorSecond, fresh())).toBe('S3');
  });

  it('always crowns an entrant and returns empty for no entrants', () => {
    const ids = new Set(seeds(6).map(s => s.id));
    for (let i = 0; i < 20; i++) {
      expect(ids.has(simulateBracketChampion(seeds(6), mulberry32(i), fresh()))).toBe(true);
    }
    expect(simulateBracketChampion([], favorFirst, fresh())).toBe('');
  });
});
