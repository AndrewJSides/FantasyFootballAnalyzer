// Backlog item 126: Sleeper team totals sum the published lines over an
// optimal lineup's starters, skip missing lines, and total to null when
// no starter has a line.

import { describe, expect, it } from 'vitest';
import type { Player } from '@/types';
import type { ScoredPlayer } from '@/utils/rosterScoring';
import { sleeperLineupTotal } from './sleeperTeamTotals';

function starter(platformId: string): ScoredPlayer {
  return {
    player: { id: platformId, platformId, name: platformId } as Player,
  } as ScoredPlayer;
}

const ids = new Map([
  ['qb', '9001'],
  ['rb', '9002'],
  ['wr', '9003'],
]);

describe('sleeperLineupTotal', () => {
  it('sums the published lines over the starters', () => {
    const out = sleeperLineupTotal(
      [starter('qb'), starter('rb')],
      ids,
      { '9001': 18.4, '9002': 6.2 },
    );
    expect(out?.total).toBeCloseTo(24.6, 10);
    expect(out?.counted).toBe(2);
    expect(out?.starters).toBe(2);
  });

  it('skips starters with no published line and reports partial coverage', () => {
    const out = sleeperLineupTotal(
      [starter('qb'), starter('rb'), starter('wr')],
      ids,
      { '9001': 18.4 },
    );
    expect(out).toEqual({ total: 18.4, counted: 1, starters: 3 });
  });

  it('returns null when no starter has a line', () => {
    expect(
      sleeperLineupTotal([starter('qb')], ids, { '9999': 10 }),
    ).toBeNull();
    expect(sleeperLineupTotal([starter('qb')], ids, undefined)).toBeNull();
    expect(sleeperLineupTotal([], ids, { '9001': 18.4 })).toBeNull();
  });

  it('skips non-finite lines', () => {
    const out = sleeperLineupTotal(
      [starter('qb'), starter('rb')],
      ids,
      { '9001': NaN, '9002': 6.2 },
    );
    expect(out).toEqual({ total: 6.2, counted: 1, starters: 2 });
  });
});
