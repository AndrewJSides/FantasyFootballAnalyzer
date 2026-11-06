import { describe, expect, it } from 'vitest';
import {
  fixBlurb,
  suggestFairnessFixes,
  type FairnessFix,
} from './tradeFairness';
import { analyzeTradeValue } from './tradeAnalysis';
import type { Player } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
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

const mkPlayer = (id: string, name: string, pos: string, proj: number): PoolPlayer =>
  ({ id, name, pos, team: 'FA', projPts: proj, projPtsPpr: proj }) as PoolPlayer;

const star = mkPlayer('star', 'Star One', 'RB', 320);
const mid = mkPlayer('mid', 'Mid One', 'RB', 220);
const base = mkPlayer('base', 'Base One', 'RB', 150);
const bench = mkPlayer('bench', 'Bench One', 'RB', 200);
const depth = mkPlayer('depth', 'Depth One', 'RB', 170);
// Filler keeps VOR's replacement level sane without touching the fixtures.
const filler = Array.from({ length: 30 }, (_, i) =>
  mkPlayer(`rb${i}`, `RB Player ${i}`, 'RB', 260 - i * 4),
);
const pool = { players: [star, mid, base, bench, depth, ...filler] } as DraftPoolFile;

const mkRoster = (p: PoolPlayer): Player =>
  ({ id: p.id, name: p.name, position: p.pos, team: p.team }) as Player;

const baseOpts = {
  valueLeague: league,
  pool,
};

describe('suggestFairnessFixes', () => {
  it('returns nothing when the trade is already even', () => {
    const twin = mkPlayer('twin', 'Twin One', 'RB', 320);
    const withTwin = { players: [star, twin, ...filler] } as DraftPoolFile;
    expect(suggestFairnessFixes({ ...baseOpts, pool: withTwin, sideA: [star], sideB: [twin] })).toEqual([]);
  });

  it('suggests adding the loser-side roster player that evens the deal', () => {
    // A gives star, B gives base: A wins by the star-minus-base VOR gap.
    // bench's VOR is between the gap and twice the gap, so adding it to B
    // strictly shrinks the margin.
    const fixes = suggestFairnessFixes({
      ...baseOpts,
      sideA: [star],
      sideB: [base],
      rosterB: [mkRoster(bench)],
    });
    expect(fixes.length).toBeGreaterThan(0);
    const top = fixes[0];
    expect(top.action).toBe('add');
    expect(top.side).toBe('B');
    expect(top.player.id).toBe('bench');
    expect(top.newMargin).toBeLessThan(baseMargin([star], [base]));
  });

  it('suggests removing a player from the winning side', () => {
    // A gives star + depth, B gives mid: A wins. Dropping depth off A's
    // deal strictly shrinks the margin.
    const fixes = suggestFairnessFixes({ ...baseOpts, sideA: [star, depth], sideB: [mid] });
    const removeFix = fixes.find(f => f.action === 'remove' && f.player.id === 'depth');
    expect(removeFix).toBeDefined();
    expect(removeFix!.side).toBe('A');
    expect(removeFix!.newMargin).toBeLessThan(baseMargin([star, depth], [mid]));
  });

  it('never removes the winning side\u2019s only player', () => {
    const fixes = suggestFairnessFixes({
      ...baseOpts,
      sideA: [star],
      sideB: [mid],
      rosterB: [mkRoster(bench)],
    });
    expect(fixes.every(f => f.action !== 'remove')).toBe(true);
  });

  it('returns nothing when a pick already evens the trade', () => {
    // Star vs base is lopsided on players alone, but a pick on the losing
    // side worth exactly the margin makes the pick-adjusted totals even —
    // the fixes must price on the same totals as the verdict, not suggest
    // a player tweak for a deal the pick already balanced.
    const fixes = suggestFairnessFixes({
      ...baseOpts,
      sideA: [star],
      sideB: [base],
      pickVorB: baseMargin([star], [base]),
    });
    expect(fixes).toEqual([]);
  });

  it('never suggests a player already changing hands', () => {
    // star is on Side A already — the roster listing him must not produce
    // a "add star to Side B" fix.
    const fixes = suggestFairnessFixes({
      ...baseOpts,
      sideA: [star],
      sideB: [base],
      rosterB: [mkRoster(star), mkRoster(bench)],
    });
    expect(fixes.every(f => f.player.id !== 'star')).toBe(true);
  });

  it('falls back to the bundled pool in manual mode (no roster)', () => {
    const fixes = suggestFairnessFixes({ ...baseOpts, sideA: [star], sideB: [base] });
    expect(fixes.length).toBeGreaterThan(0);
    expect(fixes.every(f => f.action === 'add' && f.side === 'B')).toBe(true);
  });

  it('caps suggestions at max', () => {
    const fixes = suggestFairnessFixes({
      ...baseOpts,
      sideA: [star],
      sideB: [base],
      rosterB: [mkRoster(bench), mkRoster(mid)],
      max: 1,
    });
    expect(fixes.length).toBeLessThanOrEqual(1);
  });

  it('sorts best improvement first', () => {
    const fixes = suggestFairnessFixes({
      ...baseOpts,
      sideA: [star],
      sideB: [base],
      rosterB: [mkRoster(bench), mkRoster(mid)],
    });
    for (let i = 1; i < fixes.length; i++) {
      expect(fixes[i].newMargin).toBeGreaterThanOrEqual(fixes[i - 1].newMargin);
    }
  });
});

describe('fixBlurb', () => {
  const addFix: FairnessFix = {
    action: 'add',
    side: 'B',
    player: bench,
    newMargin: 0,
    newWinner: 'even',
  };
  it('names the add and the even result', () => {
    expect(fixBlurb(addFix)).toBe('Add Bench One to Side B — makes the trade even.');
  });
  it('uses custom side names', () => {
    expect(fixBlurb(addFix, 'Alpha', 'Delta')).toBe('Add Bench One to Delta — makes the trade even.');
  });
  it('names the remove and the remaining gap', () => {
    const removeFix: FairnessFix = {
      action: 'remove',
      side: 'A',
      player: depth,
      newMargin: 4.2,
      newWinner: 'B',
    };
    expect(fixBlurb(removeFix, 'Alpha', 'Delta')).toBe(
      'Remove Depth One from Alpha — Delta still leads by 4.2 VOR.',
    );
  });
});

// Helper: the pre-fix margin for the same sides, priced by the real
// verdict so tests assert strict improvement without duplicating its math.
function baseMargin(sideA: PoolPlayer[], sideB: PoolPlayer[]): number {
  return analyzeTradeValue(sideA, sideB, league, pool).margin;
}
