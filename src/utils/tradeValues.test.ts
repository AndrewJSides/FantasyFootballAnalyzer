import { describe, expect, it } from 'vitest';
import {
  buildTradeValueChart,
  PACKAGE_FAIR_BAND,
  packageTotals,
  tierForValue,
  tradeValueDeltas,
  tradeValueOf,
  TRADE_VALUE_TIERS,
} from './tradeValues';
import type { PoolPlayer } from '@/types/draft';
import type { ValueLeague } from './projectionValues';

const league: ValueLeague = {
  budget: 200,
  teams: 10,
  rounds: 16,
  rosterSlots: {
    QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, K: 1, DST: 1, BENCH: 6,
  },
  scoring: 'ppr',
};

const mkPlayer = (id: string, name: string, pos: string, projPtsPpr: number | undefined): PoolPlayer =>
  ({
    id,
    name,
    pos,
    team: 'FA',
    projPtsStd: projPtsPpr == null ? undefined : projPtsPpr,
    projPts: projPtsPpr == null ? undefined : projPtsPpr,
    projPtsPpr,
  }) as PoolPlayer;

function pool(n: number, pos = 'RB', base = 300): PoolPlayer[] {
  return Array.from({ length: n }, (_, i) =>
    mkPlayer(`${pos}${i}`, `${pos} Player ${i}`, pos, base - i * 4),
  );
}

describe('tierForValue', () => {
  it('uses the documented fixed thresholds', () => {
    expect(tierForValue(100)).toBe(1);
    expect(tierForValue(60)).toBe(1);
    expect(tierForValue(59.9)).toBe(2);
    expect(tierForValue(35)).toBe(2);
    expect(tierForValue(34.9)).toBe(3);
    expect(tierForValue(15)).toBe(3);
    expect(tierForValue(14.9)).toBe(4);
  });

  it('names all four tiers', () => {
    expect(Object.keys(TRADE_VALUE_TIERS)).toHaveLength(4);
    expect(TRADE_VALUE_TIERS[1]).toBe('Elite');
  });
});

describe('buildTradeValueChart', () => {
  it('normalizes the top player to 100 and sorts by value', () => {
    const rows = buildTradeValueChart(pool(30, 'RB'), { league });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].value).toBe(100);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].value).toBeGreaterThanOrEqual(rows[i].value);
    }
  });

  it('assigns 1-based ranks within each position', () => {
    const rows = buildTradeValueChart(
      [...pool(20, 'RB'), ...pool(20, 'WR')],
      { league },
    );
    const rbRanks = rows.filter(r => r.player.pos === 'RB').map(r => r.posRank);
    expect(Math.min(...rbRanks)).toBe(1);
    expect(new Set(rbRanks).size).toBe(rbRanks.length);
  });

  it('excludes players with no projection', () => {
    const players = [...pool(20, 'RB'), mkPlayer('RBx', 'RB NoProj', 'RB', undefined)];
    const rows = buildTradeValueChart(players, { league });
    expect(rows.some(r => r.player.id === 'RBx')).toBe(false);
  });

  it('excludes K/DST entirely', () => {
    const players = [
      ...pool(20, 'RB'),
      mkPlayer('K1', 'K Kicker', 'K', 200),
      mkPlayer('DST1', 'D/ST Unit', 'DST', 200),
    ];
    const rows = buildTradeValueChart(players, { league });
    expect(rows.some(r => ['K', 'DST'].includes(r.player.pos))).toBe(false);
  });

  it('returns an empty chart when nobody has positive VOR', () => {
    expect(buildTradeValueChart([], { league })).toEqual([]);
  });

  it('tiers descend with value', () => {
    const rows = buildTradeValueChart(pool(60, 'RB'), { league });
    const tiers = rows.map(r => r.tier);
    expect(tiers[0]).toBe(1);
    expect(tiers[tiers.length - 1]).toBe(4);
  });
});

describe('tradeValueOf', () => {
  it('looks up values and returns 0 for players off the chart', () => {
    const rows = buildTradeValueChart(pool(20, 'RB'), { league });
    const id = rows[0].player.id;
    expect(tradeValueOf(rows, id)).toBe(rows[0].value);
    expect(tradeValueOf(rows, 'missing-id')).toBe(0);
  });
});

describe('packageTotals', () => {
  const values = new Map([
    ['a1', 80],
    ['a2', 30],
    ['b1', 60],
    ['b2', 45],
  ]);

  it('sums each side and names the higher side', () => {
    const v = packageTotals(values, ['a1'], ['b1', 'b2']);
    expect(v.sideATotal).toBe(80);
    expect(v.sideBTotal).toBe(105);
    expect(v.diff).toBe(25);
    expect(v.winner).toBe('b');
  });

  it('declares the higher side the winner past the fair band', () => {
    const v = packageTotals(values, ['a1', 'a2'], ['b1']);
    // 110 vs 60 -> diff 50
    expect(v.diff).toBe(50);
    expect(v.winner).toBe('a');
  });

  it('calls within-band deals fair', () => {
    const close = new Map([['x', 50], ['y', 54]]);
    const v = packageTotals(close, ['x'], ['y']);
    expect(v.diff).toBeLessThanOrEqual(PACKAGE_FAIR_BAND);
    expect(v.winner).toBe('fair');
  });

  it('values unknown ids at 0', () => {
    const v = packageTotals(values, ['a1', 'unknown'], ['b1']);
    expect(v.sideATotal).toBe(80);
  });
});

describe('tradeValueDeltas', () => {
  const snap = (date: string, values: Record<string, number>) => ({ date, values });

  it('returns null with fewer than two snapshots', () => {
    expect(tradeValueDeltas([])).toBeNull();
    expect(tradeValueDeltas([snap('2026-10-30', { a: 100 })])).toBeNull();
  });

  it('diffs the two most recent snapshots with one-decimal rounding', () => {
    const info = tradeValueDeltas([
      snap('2026-10-28', { a: 90, b: 40 }),
      snap('2026-10-29', { a: 88, b: 40 }),
      snap('2026-10-30', { a: 95.34, b: 37.76, c: 10 }),
    ]);
    expect(info).not.toBeNull();
    expect(info!.baselineDate).toBe('2026-10-29');
    expect(info!.currentDate).toBe('2026-10-30');
    expect(info!.deltaByPoolId.get('a')).toBe(7.3);
    expect(info!.deltaByPoolId.get('b')).toBe(-2.2);
  });

  it('skips players missing from the baseline snapshot', () => {
    const info = tradeValueDeltas([
      snap('2026-10-29', { a: 90 }),
      snap('2026-10-30', { a: 95, b: 50 }),
    ]);
    expect(info!.deltaByPoolId.has('b')).toBe(false);
    expect(info!.deltaByPoolId.get('a')).toBe(5);
  });

  it('handles unsorted input by date', () => {
    const info = tradeValueDeltas([
      snap('2026-10-30', { a: 95 }),
      snap('2026-10-29', { a: 90 }),
    ]);
    expect(info!.baselineDate).toBe('2026-10-29');
    expect(info!.currentDate).toBe('2026-10-30');
    expect(info!.deltaByPoolId.get('a')).toBe(5);
  });
});
