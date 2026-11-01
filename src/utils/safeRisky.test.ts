import { describe, expect, it } from 'vitest';
import type { ScoredPlayer } from './rosterScoring';
import { safeRiskyPicks } from './safeRisky';

function mockScored(over: Partial<ScoredPlayer> & { id: string }): ScoredPlayer {
  return {
    name: 'Test Player',
    position: 'WR',
    score: 15,
    player: { id: over.id, platformId: over.id, name: 'Test Player', position: 'WR', team: 'KC' } as never,
    nflTeam: 'KC',
    ppg: 15,
    last3: 15,
    projection: { projection: 15, baseline: 15, form: 15, matchupAdjustment: 0, games: 8 } as never,
    stdDev: 1,
    bye: null,
    onBye: false,
    matchup: null,
    injuredOut: false,
    injuryLabel: null,
    ...over,
  } as ScoredPlayer;
}

const steadyWeekly: Record<string, Record<number, number>> = {
  steady1: { 1: 15, 2: 16, 3: 14, 4: 15, 5: 16, 6: 14, 7: 15, 8: 16 },
};
const volatileWeekly: Record<string, Record<number, number>> = {
  wild1: { 1: 5, 2: 25, 3: 4, 4: 26, 5: 6, 6: 24, 7: 3, 8: 25 },
};
const weekly = { ...steadyWeekly, ...volatileWeekly };

const steady = mockScored({
  id: 'steady1',
  matchup: { opponent: 'IND', avgAllowed: 26, rank: 3, label: 'favorable' },
});
const wild = mockScored({
  id: 'wild1',
  matchup: { opponent: 'DEN', avgAllowed: 12, rank: 30, label: 'tough' },
});

describe('safeRiskyPicks', () => {
  it('ranks a steady, favorable-matchup starter as safest', () => {
    const { safe } = safeRiskyPicks([steady, wild], weekly, 2);
    expect(safe.length).toBeGreaterThan(0);
    expect(safe[0].player.player.id).toBe('steady1');
    expect(safe[0].reason).toContain('Steady');
    expect(safe[0].reason).toContain('IND');
  });

  it('ranks a volatile, tough-matchup starter as riskiest', () => {
    const { risky } = safeRiskyPicks([steady, wild], weekly, 2);
    expect(risky.length).toBeGreaterThan(0);
    expect(risky[0].player.player.id).toBe('wild1');
    expect(risky[0].reason).toContain('Volatile');
    expect(risky[0].reason).toContain('DEN');
  });

  it('excludes injured-out and bye players', () => {
    const hurt = mockScored({ id: 'steady1', injuredOut: true, injuryLabel: 'Out (Knee)' });
    const bye = mockScored({ id: 'steady1', onBye: true });
    const { safe, risky } = safeRiskyPicks([hurt, bye], steadyWeekly, 2);
    expect(safe).toHaveLength(0);
    expect(risky).toHaveLength(0);
  });

  it('skips players with fewer than 3 played weeks', () => {
    const rook = mockScored({ id: 'rook1' });
    const { safe, risky } = safeRiskyPicks([rook], { rook1: { 1: 12, 2: 18 } }, 2);
    expect(safe).toHaveLength(0);
    expect(risky).toHaveLength(0);
  });

  it('returns empty lists for empty input', () => {
    expect(safeRiskyPicks([], weekly)).toEqual({ safe: [], risky: [] });
  });

  it('caps each list at the requested count', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      mockScored({
        id: 'steady1',
        name: `Player ${i}`,
        matchup: { opponent: 'IND', avgAllowed: 26, rank: 3, label: 'favorable' },
      }),
    );
    const { safe, risky } = safeRiskyPicks(many, steadyWeekly, 2);
    expect(safe).toHaveLength(2);
    expect(risky).toHaveLength(2);
  });
});
