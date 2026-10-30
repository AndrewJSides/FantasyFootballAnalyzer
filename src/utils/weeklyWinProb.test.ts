// weeklyWinProb: Monte Carlo weekly win probability + swing players.

import { describe, it, expect } from 'vitest';
import type { Player } from '@/types';
import type { ScoredPlayer } from '@/utils/rosterScoring';
import {
  monteCarloWinProb,
  playerScoreDistribution,
  quantileSorted,
  scoreDistributionFromSamples,
} from './weeklyWinProb';

function starter(
  id: string,
  teamId: string,
  score: number,
  stdDev: number | null,
): ScoredPlayer & { teamId: string } {
  return {
    id,
    name: id,
    teamId,
    score,
    stdDev,
    player: { id, name: id } as Player,
  } as ScoredPlayer & { teamId: string };
}

describe('playerScoreDistribution', () => {
  it('uses the player\u2019s own std dev when available', () => {
    const d = playerScoreDistribution(starter('a', 'A', 15, 4));
    expect(d).toEqual({ mean: 15, std: 4 });
  });

  it('falls back to 45% of the mean (min 3) with fewer than 2 games', () => {
    const d = playerScoreDistribution(starter('a', 'A', 20, null));
    expect(d).toEqual({ mean: 20, std: 9 });
    const low = playerScoreDistribution(starter('b', 'A', 4, null));
    expect(low.std).toBe(3);
  });
});

describe('monteCarloWinProb', () => {
  it('is deterministic with a seed', () => {
    const a = [starter('a1', 'A', 15, 3), starter('a2', 'A', 12, 2)];
    const b = [starter('b1', 'B', 14, 3), starter('b2', 'B', 12, 2)];
    const first = monteCarloWinProb(a, b, { seed: 7, simulations: 1000 });
    const second = monteCarloWinProb(a, b, { seed: 7, simulations: 1000 });
    expect(first).toEqual(second);
  });

  it('is ~50/50 for evenly matched lineups', () => {
    const a = [starter('a1', 'A', 15, 3), starter('a2', 'A', 12, 2)];
    const b = [starter('b1', 'B', 15, 3), starter('b2', 'B', 12, 2)];
    const { winProbA } = monteCarloWinProb(a, b, { seed: 11 });
    expect(Math.abs(winProbA - 50)).toBeLessThan(2);
  });

  it('favors the stronger side, complementary to 100', () => {
    const a = [starter('a1', 'A', 15, 6), starter('a2', 'A', 12, 5)];
    const b = [starter('b1', 'B', 18, 6), starter('b2', 'B', 16, 5)];
    const { winProbA } = monteCarloWinProb(a, b, { seed: 11 });
    expect(winProbA).toBeLessThan(50);
    expect(winProbA).toBeGreaterThan(0);
  });

  it('high volatility pulls a favorite\u2019s probability toward 50', () => {
    const a = [starter('a1', 'A', 20, 0), starter('a2', 'A', 18, 0)];
    const b = [starter('b1', 'B', 17, 0), starter('b2', 'B', 16, 0)];
    const steady = monteCarloWinProb(a, b, { seed: 11, simulations: 5000 });
    const wildA = [starter('a1', 'A', 20, 8), starter('a2', 'A', 18, 8)];
    const wild = monteCarloWinProb(wildA, b, { seed: 11, simulations: 5000 });
    // No volatility: the projected gap decides everything, near-certainty.
    expect(steady.winProbA).toBeGreaterThan(95);
    // With volatile favorites, the underdog wins much more often.
    expect(wild.winProbA).toBeLessThan(steady.winProbA);
  });

  it('names the highest-variance starters as swing players', () => {
    const a = [starter('boom', 'A', 15, 10), starter('steady-a', 'A', 12, 1)];
    const b = [starter('bust', 'B', 15, 8), starter('steady-b', 'B', 12, 1)];
    const { swingPlayers } = monteCarloWinProb(a, b, { seed: 11 });
    expect(swingPlayers).toHaveLength(3);
    expect(swingPlayers[0].name).toBe('boom');
    expect(swingPlayers[1].name).toBe('bust');
    // Shares are variance shares: boom's 100 vs bust's 64, so boom > bust.
    expect(swingPlayers[0].swingShare).toBeGreaterThan(swingPlayers[1].swingShare);
    expect(
      swingPlayers.reduce((s, p) => s + p.swingShare, 0),
    ).toBeLessThanOrEqual(100);
  });

  it('returns no swing players when every starter has zero variance', () => {
    const a = [starter('a1', 'A', 15, 0)];
    const b = [starter('b1', 'B', 15, 0)];
    const { swingPlayers, winProbA } = monteCarloWinProb(a, b, { seed: 11 });
    expect(swingPlayers).toEqual([]);
    // No variance at all: identical projections split the ties.
    expect(winProbA).toBeCloseTo(50, 0);
  });
});

describe('quantileSorted', () => {
  it('computes nearest-rank quantiles', () => {
    const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(quantileSorted(sorted, 0.1)).toBe(10);
    expect(quantileSorted(sorted, 0.5)).toBe(50);
    expect(quantileSorted(sorted, 0.9)).toBe(90);
  });

  it('clamps out-of-range queries and empty input', () => {
    expect(quantileSorted([5], 0)).toBe(5);
    expect(quantileSorted([5], 1)).toBe(5);
    expect(quantileSorted([], 0.5)).toBe(0);
  });
});

describe('scoreDistributionFromSamples', () => {
  it('rounds P10/median/P90 to 1dp with p10 <= median <= p90', () => {
    const samples = Array.from({ length: 101 }, (_, i) => i * 0.333);
    const d = scoreDistributionFromSamples(samples);
    expect(d.p10).toBeLessThanOrEqual(d.median);
    expect(d.median).toBeLessThanOrEqual(d.p90);
    expect([d.p10, d.median, d.p90].every(n => Number.isInteger(n * 10))).toBe(true);
  });
});

describe('monteCarloWinProb distributions', () => {
  it('returns ordered, seeded-stable per-team score distributions', () => {
    const a = [starter('a1', 'A', 15, 3), starter('a2', 'A', 12, 2)];
    const b = [starter('b1', 'B', 14, 3), starter('b2', 'B', 12, 2)];
    const first = monteCarloWinProb(a, b, { seed: 7, simulations: 2000 });
    const second = monteCarloWinProb(a, b, { seed: 7, simulations: 2000 });
    expect(first.distA).toEqual(second.distA);
    expect(first.distB).toEqual(second.distB);
    for (const d of [first.distA, first.distB]) {
      expect(d.p10).toBeLessThanOrEqual(d.median);
      expect(d.median).toBeLessThanOrEqual(d.p90);
    }
  });

  it('centers the median on the projected total for normal scores', () => {
    const a = [starter('a1', 'A', 15, 3), starter('a2', 'A', 12, 2)];
    const b = [starter('b1', 'B', 14, 3), starter('b2', 'B', 12, 2)];
    const { distA, distB } = monteCarloWinProb(a, b, { seed: 3 });
    // Projected totals are 27 and 26; symmetric normals keep medians close.
    expect(Math.abs(distA.median - 27)).toBeLessThan(1.5);
    expect(Math.abs(distB.median - 26)).toBeLessThan(1.5);
  });

  it('collapses to a point when every starter has zero variance', () => {
    const a = [starter('a1', 'A', 15, 0)];
    const b = [starter('b1', 'B', 14, 0)];
    const { distA, distB } = monteCarloWinProb(a, b, { seed: 9, simulations: 500 });
    expect(distA).toEqual({ p10: 15, median: 15, p90: 15 });
    expect(distB).toEqual({ p10: 14, median: 14, p90: 14 });
  });
});
