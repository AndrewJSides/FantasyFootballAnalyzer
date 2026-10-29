// Buy Low / Sell High market-target engine (backlog item 16).
import { describe, it, expect } from 'vitest';
import { marketTargets } from './buyLowSellHigh';
import type { PoolPlayer } from '@/types/draft';
import { valueLeagueFor } from './tradeAnalysis';
import { DEFAULT_VOR_CONFIG } from './projectionValues';

function poolPlayer(overrides: Partial<PoolPlayer> & { id: string; name: string }): PoolPlayer {
  return {
    pos: 'WR',
    team: 'DAL',
    projPtsPpr: 280,
    sleeperId: `s-${overrides.id}`,
    ...overrides,
  } as PoolPlayer;
}

const CURRENT_WEEK = 8;

// VOR prices each player against the pool's own replacement level, so the
// fixtures need a realistic tail of filler players — otherwise every
// target VORs at ~0 and the VOR floor filters them all out.
function filler(pos: string, count: number, base: number, step: number): PoolPlayer[] {
  return Array.from({ length: count }, (_, i) => {
    const pts = base - i * step;
    return {
      id: `${pos}-f${i}`,
      name: `${pos} Filler ${i}`,
      pos,
      team: 'FA',
      projPtsPpr: pts,
      sleeperId: `s-${pos}-f${i}`,
    } as PoolPlayer;
  });
}

const TAIL = [
  ...filler('QB', 20, 380, 8),
  ...filler('RB', 60, 300, 4),
  ...filler('WR', 60, 280, 4),
  ...filler('TE', 30, 220, 5),
];

function withTail(players: PoolPlayer[]): PoolPlayer[] {
  return [...players, ...TAIL];
}

// Weeks 1-4 strong, weeks 5-7 slumping: baseline stays high while the
// last-3 dips, so the gap clears the 3-point threshold.
const COLD = { 1: 24, 2: 24, 3: 24, 4: 24, 5: 10, 6: 10, 7: 10 };
// Weeks 1-4 quiet, weeks 5-7 hot: the mirror image.
const HOT = { 1: 8, 2: 8, 3: 8, 4: 8, 5: 24, 6: 24, 7: 24 };
// Flat, no signal either way.
const FLAT = { 1: 15, 2: 15, 3: 15, 4: 15, 5: 15, 6: 15, 7: 15 };

function input(
  players: PoolPlayer[],
  weeklyPoints: Record<string, Record<number, number>>,
  extra: Record<string, unknown> = {},
) {
  return {
    poolPlayers: players,
    weeklyPoints,
    currentWeek: CURRENT_WEEK,
    valueLeague: valueLeagueFor(null),
    vorCfg: DEFAULT_VOR_CONFIG,
    ...extra,
  };
}

describe('marketTargets', () => {
  it('flags an underperformer as buy-low and an overperformer as sell-high', () => {
    const cold = poolPlayer({ id: 'wr-cold', name: 'Cold Receiver' });
    const hot = poolPlayer({ id: 'wr-hot', name: 'Hot Receiver' });
    const flat = poolPlayer({ id: 'wr-flat', name: 'Flat Receiver' });
    const { buyLow, sellHigh } = marketTargets(
      input(withTail([cold, hot, flat]), {
        's-wr-cold': COLD,
        's-wr-hot': HOT,
        's-wr-flat': FLAT,
      }),
    );
    expect(buyLow.map(t => t.player.id)).toEqual(['wr-cold']);
    expect(sellHigh.map(t => t.player.id)).toEqual(['wr-hot']);
    expect(buyLow[0].gap).toBeGreaterThanOrEqual(3);
    expect(sellHigh[0].gap).toBeLessThanOrEqual(-3);
    // Plain-language reasons name both numbers.
    expect(buyLow[0].reasons[0]).toContain('under TraderApe');
    expect(buyLow[0].reasons[0]).toContain('forward projection');
    expect(sellHigh[0].reasons[0]).toContain('peak sell window');
  });

  it('names the owning team from teamByPoolId', () => {
    const cold = poolPlayer({ id: 'wr-cold', name: 'Cold Receiver' });
    const { buyLow } = marketTargets(
      input(withTail([cold]), { 's-wr-cold': COLD }, {
        teamByPoolId: new Map([['wr-cold', 'Delta Squad']]),
      }),
    );
    expect(buyLow[0].rosteredBy).toBe('Delta Squad');
  });

  it('requires 2+ recent stat lines and skips players with no data', () => {
    const oneGame = poolPlayer({ id: 'wr-one', name: 'One Game' });
    const noData = poolPlayer({ id: 'wr-none', name: 'No Data' });
    const { buyLow, sellHigh } = marketTargets(
      input(withTail([oneGame, noData]), {
        // One cold week isn't enough to earn a flag.
        's-wr-one': { 7: 2 },
      }),
    );
    expect(buyLow).toEqual([]);
    expect(sellHigh).toEqual([]);
  });

  it('skips sub-replacement assets even when they slump', () => {
    const scrub = poolPlayer({
      id: 'wr-scrub',
      name: 'Scrub Receiver',
      projPtsPpr: 20,
    });
    const { buyLow, sellHigh } = marketTargets(
      input(withTail([scrub]), { 's-wr-scrub': COLD }),
    );
    expect(buyLow).toEqual([]);
    expect(sellHigh).toEqual([]);
  });

  it('caps each side at 6, biggest gaps first', () => {
    const players = Array.from({ length: 9 }, (_, i) =>
      poolPlayer({
        id: `wr-cold-${i}`,
        name: `Cold ${i}`,
        sleeperId: `s-wr-cold-${i}`,
      }),
    );
    const weekly: Record<string, Record<number, number>> = {};
    for (const p of players) weekly[p.sleeperId!] = COLD;
    const { buyLow } = marketTargets(input(withTail(players), weekly));
    expect(buyLow.length).toBe(6);
    const gaps = buyLow.map(t => t.gap);
    expect([...gaps].sort((a, b) => b - a)).toEqual(gaps);
  });

  it('skips K/DST and positions without matchup data', () => {
    const kicker = poolPlayer({
      id: 'k-cold',
      name: 'Cold Kicker',
      pos: 'K',
      sleeperId: 's-k-cold',
    });
    const { buyLow, sellHigh } = marketTargets(
      input(withTail([kicker]), { 's-k-cold': COLD }),
    );
    expect(buyLow).toEqual([]);
    expect(sellHigh).toEqual([]);
  });
});
