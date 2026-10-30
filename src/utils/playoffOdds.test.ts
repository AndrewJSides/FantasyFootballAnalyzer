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
});
