// swapImpact: win-probability deltas for the game plan's close-call swaps.

import { describe, it, expect } from 'vitest';
import type { Player } from '@/types';
import type { ScoredPlayer } from '@/utils/rosterScoring';
import type { SwapFlag } from '@/utils/gamePlan';
import {
  priceSwapImpacts,
  SWAP_IMPACT_SEED,
  SWAP_IMPACT_SIMS,
} from './swapImpact';

type LineupStarter = ScoredPlayer & { teamId: string };

function starter(
  id: string,
  teamId: string,
  score: number,
  stdDev: number | null,
): LineupStarter {
  return {
    id,
    name: id,
    teamId,
    score,
    stdDev,
    player: { id, name: id } as Player,
  } as LineupStarter;
}

function flag(
  slot: string,
  starterId: string,
  challenger: ScoredPlayer,
): SwapFlag {
  const s = starter(starterId, 'A', 10, 3);
  return {
    slot,
    starterId,
    starterName: s.name,
    starterScore: s.score,
    challengerId: challenger.id,
    challenger,
    challengerName: challenger.name,
    challengerScore: challenger.score,
    gain: challenger.score - s.score,
    kind: challenger.score > s.score ? 'upgrade' : 'toss-up',
    note: 'note',
  };
}

describe('priceSwapImpacts', () => {
  const focus = [starter('a1', 'A', 15, 3), starter('a2', 'A', 12, 2)];
  const opp = [starter('b1', 'B', 14, 3), starter('b2', 'B', 12, 2)];

  it('returns an empty list for no flags', () => {
    expect(priceSwapImpacts(focus, opp, [])).toEqual([]);
  });

  it('returns an empty list when a side has no starters', () => {
    const f = [flag('RB', 'a1', starter('c1', 'A', 20, 3))];
    expect(priceSwapImpacts([], opp, f)).toEqual([]);
    expect(priceSwapImpacts(focus, [], f)).toEqual([]);
  });

  it('is deterministic with the default seed', () => {
    const flags = [flag('RB', 'a1', starter('c1', 'A', 16, 3))];
    const first = priceSwapImpacts(focus, opp, flags);
    const second = priceSwapImpacts(focus, opp, flags);
    expect(first).toEqual(second);
  });

  it('lifts the win chance when the challenger is much better', () => {
    const flags = [flag('RB', 'a2', starter('c1', 'A', 25, 3))];
    const [impact] = priceSwapImpacts(focus, opp, flags, {
      seed: SWAP_IMPACT_SEED,
      simulations: SWAP_IMPACT_SIMS,
    });
    expect(impact.gain).toBeGreaterThan(0);
    expect(impact.winProbAfter).toBeGreaterThan(impact.winProbBefore);
  });

  it('drops the win chance when the challenger is much worse', () => {
    const flags = [flag('RB', 'a1', starter('c1', 'A', 2, 3))];
    const [impact] = priceSwapImpacts(focus, opp, flags, {
      seed: SWAP_IMPACT_SEED,
      simulations: SWAP_IMPACT_SIMS,
    });
    expect(impact.gain).toBeLessThan(0);
    expect(impact.winProbAfter).toBeLessThan(impact.winProbBefore);
  });

  it('skips flags whose starter is not in the focus lineup', () => {
    const flags = [
      flag('RB', 'nope', starter('c1', 'A', 25, 3)),
      flag('WR', 'a2', starter('c2', 'A', 20, 3)),
    ];
    const impacts = priceSwapImpacts(focus, opp, flags);
    expect(impacts).toHaveLength(1);
    expect(impactSlot(impacts[0])).toBe('WR');
  });

  it('reports probabilities on the 0..100 scale, one decimal', () => {
    const flags = [flag('RB', 'a1', starter('c1', 'A', 16, 3))];
    const [impact] = priceSwapImpacts(focus, opp, flags);
    for (const n of [impact.winProbBefore, impact.winProbAfter]) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(100);
      expect(n).toBe(Math.round(n * 10) / 10);
    }
    expect(impact.gain).toBe(
      Math.round((impact.winProbAfter - impact.winProbBefore) * 10) / 10,
    );
  });
});

function impactSlot(i: { slot: string }): string {
  return i.slot;
}
