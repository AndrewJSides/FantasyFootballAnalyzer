// buildProjectionDisagreements: the join between TraderApe's weekly board
// and Sleeper's weekly projections — gaps, sides, caps, and the
// missing-number exclusions.
import { describe, it, expect } from 'vitest';
import { buildProjectionDisagreements } from './projectionDisagreements';
import type { WeeklyRankRow } from './weeklyRankings';
import type { PoolPlayer } from '@/types/draft';

function row(
  id: string,
  name: string,
  projection: number | null,
  sleeperId?: string,
): WeeklyRankRow {
  return {
    player: {
      id,
      name,
      pos: 'WR',
      team: 'DAL',
      sleeperId: sleeperId ?? `sid-${id}`,
    } as PoolPlayer,
    total: null,
    games: null,
    ppg: null,
    last3: null,
    projection,
    matchup: null,
    consistency: null,
    owner: null,
    posRank: 1,
  };
}

describe('buildProjectionDisagreements', () => {
  it('splits bullish and bearish by gap sign, largest gap first', () => {
    const r = buildProjectionDisagreements(
      [
        row('a', 'Bull Big', 20),
        row('b', 'Bull Small', 13),
        row('c', 'Bear Big', 5),
        row('d', 'Bear Small', 11),
      ],
      { 'sid-a': 14, 'sid-b': 12, 'sid-c': 12, 'sid-d': 12 },
      5,
    );
    expect(r.bullish.map(d => d.name)).toEqual(['Bull Big', 'Bull Small']);
    expect(r.bullish[0].gap).toBe(6);
    expect(r.bearish.map(d => d.name)).toEqual(['Bear Big', 'Bear Small']);
    expect(r.bearish[0].gap).toBe(-7);
  });

  it('caps each side at the limit', () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      row(`b${i}`, `Bull ${i}`, 20 + i),
    );
    const sleeper: Record<string, number> = {};
    rows.forEach((_, i) => {
      sleeper[`sid-b${i}`] = 10;
    });
    const r = buildProjectionDisagreements(rows, sleeper, 5);
    expect(r.bullish).toHaveLength(5);
    expect(r.bullish[0].name).toBe('Bull 7');
  });

  it('drops rows with no TraderApe projection, no Sleeper id, or no Sleeper line', () => {
    const r = buildProjectionDisagreements(
      [
        row('a', 'No Projection', null),
        row('b', 'No Sleeper Id', 20, ''),
        row('c', 'No Sleeper Line', 20),
        row('d', 'Kept', 20),
      ],
      { 'sid-d': 15 },
      5,
    );
    expect(r.bullish.map(d => d.name)).toEqual(['Kept']);
    expect(r.bearish).toEqual([]);
  });

  it('drops zero gaps — agreement is not a disagreement', () => {
    const r = buildProjectionDisagreements([row('a', 'Agreed', 15)], { 'sid-a': 15 }, 5);
    expect(r.bullish).toEqual([]);
    expect(r.bearish).toEqual([]);
  });

  it('rounds both numbers and the gap to one decimal', () => {
    const r = buildProjectionDisagreements([row('a', 'Rounded', 15.26)], { 'sid-a': 12.24 }, 5);
    expect(r.bullish[0]).toMatchObject({ traderApe: 15.3, sleeper: 12.2, gap: 3 });
  });
});
