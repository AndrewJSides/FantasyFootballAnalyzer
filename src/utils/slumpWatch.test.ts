// slumpWatch tests: dip flags, sample floors, rostered inclusion,
// ranking order.
import { describe, it, expect } from 'vitest';
import {
  slumpCandidates,
  BASELINE_MIN_GAMES,
  RECENT_MIN_GAMES,
  BASELINE_FLOOR,
  DIP_RATIO,
  MAX_SLUMPS,
  type SlumpWatchInput,
} from './slumpWatch';
import type { PoolPlayer } from '@/types/draft';

function player(id: string, pos = 'WR'): PoolPlayer {
  return {
    id,
    name: `Player ${id}`,
    team: 'DAL',
    pos,
    posRank: 10,
    overallRank: 60,
    tier: 2,
    bye: 7,
    baseValue: null,
    projPtsPpr: 120,
    sleeperId: id,
  } as PoolPlayer;
}

/** Weekly points helper: weeks 1-8 completed, current week 9. */
function input(
  points: Record<string, Record<number, number>>,
  overrides: Partial<SlumpWatchInput> = {},
): SlumpWatchInput {
  const poolPlayers = Object.keys(points).map(id => player(id));
  return { poolPlayers, weeklyPoints: points, currentWeek: 9, ...overrides };
}

// Baseline = weeks 1-5, recent = weeks 6-8.
const slumpSeries = {
  '1': 18, '2': 20, '3': 16, '4': 18, '5': 18, // baseline 18.0
  '6': 6, '7': 8, '8': 7,                     // recent 7.0 -> 0.39x
};

describe('slumpCandidates', () => {
  it('flags a player down 40%+ from his own baseline', () => {
    const out = slumpCandidates(input({ a: slumpSeries }));
    expect(out).toHaveLength(1);
    expect(out[0].player.id).toBe('a');
    expect(out[0].last3).toBe(7);
    expect(out[0].baseline).toBe(18);
    expect(out[0].dip).toBeCloseTo(0.39, 1);
    expect(out[0].last3Weeks).toBe(3);
    expect(out[0].baselineWeeks).toBe(5);
  });

  it('ignores players below the baseline floor', () => {
    // 50% drop but only 4 pts/game before — noise, not a slump.
    const out = slumpCandidates(
      input({
        a: { '1': 4, '2': 4, '3': 4, '4': 4, '5': 4, '6': 2, '7': 2, '8': 2 },
      }),
    );
    expect(out).toHaveLength(0);
  });

  it('ignores dips under the ratio threshold', () => {
    // 14 recent vs 18 baseline = 0.78x — cooling, not a slump.
    const out = slumpCandidates(
      input({
        a: { '1': 18, '2': 18, '3': 18, '4': 18, '5': 18, '6': 14, '7': 14, '8': 14 },
      }),
    );
    expect(out).toHaveLength(0);
  });

  it('requires the baseline sample', () => {
    // Only 2 baseline games — too thin to judge a slump.
    const out = slumpCandidates(
      input({ a: { '4': 18, '5': 18, '6': 6, '7': 8, '8': 7 } }),
    );
    expect(out).toHaveLength(0);
  });

  it('requires the recent sample', () => {
    // Only 1 recent game.
    const out = slumpCandidates(
      input({
        a: { '1': 18, '2': 20, '3': 16, '4': 18, '5': 18, '8': 7 },
      }),
    );
    expect(out).toHaveLength(0);
  });

  it('keeps rostered players in league mode and names the owner', () => {
    const p = player('a');
    const out = slumpCandidates({
      poolPlayers: [p],
      weeklyPoints: { a: slumpSeries },
      teamByPoolId: new Map([['a', 'Rivals']]),
      currentWeek: 9,
    });
    expect(out).toHaveLength(1);
    expect(out[0].rosteredBy).toBe('Rivals');
  });

  it('resolves league-mode weekly points via platformIdByPoolId', () => {
    const p = player('pool-a');
    const out = slumpCandidates({
      poolPlayers: [p],
      weeklyPoints: { 'yh-1': slumpSeries },
      platformIdByPoolId: new Map([['pool-a', 'yh-1']]),
      currentWeek: 9,
    });
    expect(out).toHaveLength(1);
    expect(out[0].player.id).toBe('pool-a');
  });

  it('ranks steepest dip first, then higher baseline', () => {
    const out = slumpCandidates(
      input({
        a: { '1': 18, '2': 18, '3': 18, '4': 18, '5': 18, '6': 9, '7': 9, '8': 9 },
        b: { '1': 20, '2': 20, '3': 20, '4': 20, '5': 20, '6': 4, '7': 4, '8': 4 },
      }),
    );
    expect(out.map(c => c.player.id)).toEqual(['b', 'a']);
  });

  it('caps the list at MAX_SLUMPS', () => {
    const points: Record<string, Record<number, number>> = {};
    for (let i = 0; i < MAX_SLUMPS + 3; i++) points[`p${i}`] = slumpSeries;
    expect(slumpCandidates(input(points))).toHaveLength(MAX_SLUMPS);
  });

  it('exports the documented thresholds', () => {
    expect(BASELINE_MIN_GAMES).toBe(3);
    expect(RECENT_MIN_GAMES).toBe(2);
    expect(BASELINE_FLOOR).toBe(12);
    expect(DIP_RATIO).toBe(0.6);
  });
});
