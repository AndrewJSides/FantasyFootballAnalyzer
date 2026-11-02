import { describe, expect, it } from 'vitest';
import {
  auctionDollars,
  buildTradeValueChart,
  leagueAuctionSpend,
  PACKAGE_FAIR_BAND,
  packageTotals,
  tierForValue,
  tradeValueDeltas,
  tradeValueMovers,
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

describe('tradeValueMovers', () => {
  const snap = (date: string, values: Record<string, number>) => ({ date, values });

  it('returns null with fewer than two snapshots', () => {
    expect(tradeValueMovers([])).toBeNull();
    expect(tradeValueMovers([snap('2026-11-01', { a: 100 })])).toBeNull();
  });

  it('splits risers and fallers sorted by value change', () => {
    const info = tradeValueMovers([
      snap('2026-11-01', { a: 90, b: 80, c: 70, d: 60 }),
      snap('2026-11-02', { a: 96, b: 72, c: 71, d: 60 }),
    ]);
    expect(info).not.toBeNull();
    expect(info!.baselineDate).toBe('2026-11-01');
    expect(info!.currentDate).toBe('2026-11-02');
    expect(info!.risers.map(m => m.poolId)).toEqual(['a']);
    expect(info!.risers[0].valueDelta).toBe(6);
    expect(info!.risers[0].oldRank).toBe(1);
    expect(info!.risers[0].newRank).toBe(1);
    expect(info!.risers[0].rankDelta).toBe(0);
    expect(info!.fallers.map(m => m.poolId)).toEqual(['b']);
    expect(info!.fallers[0].valueDelta).toBe(-8);
  });

  it('reports rank movement across snapshots', () => {
    const info = tradeValueMovers(
      [
        snap('2026-11-01', { a: 90, b: 80 }),
        snap('2026-11-02', { a: 84, b: 88 }),
      ],
      1.5,
    );
    expect(info!.risers[0].poolId).toBe('b');
    expect(info!.risers[0].oldRank).toBe(2);
    expect(info!.risers[0].newRank).toBe(1);
    expect(info!.risers[0].rankDelta).toBe(1);
    expect(info!.fallers[0].poolId).toBe('a');
    expect(info!.fallers[0].rankDelta).toBe(-1);
  });

  it('cuts noise below minDelta and caps at the limit', () => {
    const info = tradeValueMovers(
      [
        snap('2026-11-01', { a: 90, b: 80, c: 70 }),
        snap('2026-11-02', { a: 91, b: 85, c: 66 }),
      ],
      1.5,
      1,
    );
    // a's +1 move is noise; limit 1 caps each side
    expect(info!.risers.map(m => m.poolId)).toEqual(['b']);
    expect(info!.fallers.map(m => m.poolId)).toEqual(['c']);
  });

  it('skips players missing from the baseline snapshot', () => {
    const info = tradeValueMovers([
      snap('2026-11-01', { a: 90 }),
      snap('2026-11-02', { a: 95, b: 50 }),
    ]);
    expect(info!.risers.map(m => m.poolId)).toEqual(['a']);
    expect(info!.fallers).toEqual([]);
  });
});

describe('auctionDollars', () => {
  const rows = buildTradeValueChart(pool(30, 'RB'), { league });

  it('distributes the budget proportional to chart value in whole dollars', () => {
    const dollars = auctionDollars(rows, 2000);
    expect(dollars.size).toBe(rows.length);
    const top = rows[0];
    // Top player gets the biggest share; shares track the value ratios.
    expect(dollars.get(top.player.id)!).toBeGreaterThan(
      dollars.get(rows[rows.length - 1].player.id)!,
    );
    const second = rows[1];
    const expected = Math.round((second.value / rows.reduce((s, r) => s + r.value, 0)) * 2000);
    expect(dollars.get(second.player.id)).toBe(expected);
    for (const d of dollars.values()) expect(Number.isInteger(d)).toBe(true);
  });

  it('returns an empty map for empty rows or non-positive budgets', () => {
    expect(auctionDollars([], 2000).size).toBe(0);
    expect(auctionDollars(rows, 0).size).toBe(0);
    expect(auctionDollars(rows, -50).size).toBe(0);
  });
});

describe('leagueAuctionSpend', () => {
  const team = (picks: { auctionValue?: number }[]) =>
    ({ draftPicks: picks }) as never;

  it('sums auction spend across teams and returns null with no priced picks', () => {
    expect(
      leagueAuctionSpend({ teams: [team([{ auctionValue: 55 }, { auctionValue: 12 }]), team([{ auctionValue: 33 }])] } as never),
    ).toBe(100);
    expect(leagueAuctionSpend({ teams: [team([{ auctionValue: 0 }]), team([])] } as never)).toBeNull();
    expect(leagueAuctionSpend({ teams: [] } as never)).toBeNull();
  });
});
