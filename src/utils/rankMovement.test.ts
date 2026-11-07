// Rank movement (backlog item 181): per-position rank change vs last
// week's board, keyed by pool player id.
import { describe, it, expect } from 'vitest';
import type { WeeklyRankRow } from '@/utils/weeklyRankings';
import type { PoolPlayer } from '@/types/draft';
import { rankMovements, movementLabel } from './rankMovement';

function row(id: string, pos: string, posRank: number): WeeklyRankRow {
  return {
    player: { id, pos } as PoolPlayer,
    total: null,
    games: null,
    ppg: null,
    last3: null,
    projection: null,
    matchup: null,
    consistency: null,
    owner: null,
    soleBack: null,
    posRank,
  };
}

describe('rankMovements', () => {
  it('marks climbs, falls, holds, and new entries', () => {
    const current = [
      row('a', 'RB', 1),
      row('b', 'RB', 2),
      row('c', 'RB', 3),
      row('d', 'RB', 4),
    ];
    const previous = [
      row('a', 'RB', 3),
      row('b', 'RB', 1),
      row('c', 'RB', 3),
    ];
    const m = rankMovements(current, previous);
    expect(m.get('a')).toEqual({ kind: 'up', delta: 2, previousRank: 3, currentRank: 1 });
    expect(m.get('b')).toEqual({ kind: 'down', delta: -1, previousRank: 1, currentRank: 2 });
    expect(m.get('c')).toEqual({ kind: 'same', delta: 0, previousRank: 3, currentRank: 3 });
    expect(m.get('d')).toEqual({ kind: 'new', delta: 0, previousRank: null, currentRank: 4 });
  });

  it('ignores players who fell off this week\u2019s board', () => {
    const m = rankMovements([row('a', 'WR', 1)], [row('a', 'WR', 1), row('gone', 'WR', 2)]);
    expect(m.has('gone')).toBe(false);
    expect(m.size).toBe(1);
  });
});

describe('movementLabel', () => {
  it('names the direction, spots, and both ranks', () => {
    expect(movementLabel({ kind: 'up', delta: 2, previousRank: 3, currentRank: 1 }, 'RB')).toBe(
      'Up 2 spots at RB vs last week (was RB3, now RB1)',
    );
    expect(movementLabel({ kind: 'down', delta: -1, previousRank: 1, currentRank: 2 }, 'WR')).toBe(
      'Down 1 spot at WR vs last week (was WR1, now WR2)',
    );
    expect(movementLabel({ kind: 'same', delta: 0, previousRank: 3, currentRank: 3 }, 'TE')).toBe(
      'Held at TE3 vs last week',
    );
    expect(movementLabel({ kind: 'new', delta: 0, previousRank: null, currentRank: 4 }, 'QB')).toBe(
      'New to the QB top 40 this week',
    );
  });
});
