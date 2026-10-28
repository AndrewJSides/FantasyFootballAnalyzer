import { describe, expect, it } from 'vitest';
import { expandSlots, optimalLineup, type OptimalLineupPlayer } from './optimalLineup';
import type { RosterSlots } from '@/types';

const SLOTS: RosterSlots = {
  QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, K: 1, DST: 1, BENCH: 6, IR: 0,
};

const p = (id: string, name: string, position: string, score: number): OptimalLineupPlayer => ({
  id, name, position, score,
});

describe('expandSlots', () => {
  it('expands counts in display order and skips bench/IR', () => {
    expect(expandSlots(SLOTS)).toEqual(['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DST']);
  });
});

describe('optimalLineup', () => {
  it('fills each slot with the best eligible player', () => {
    const result = optimalLineup(
      [
        p('1', 'QB A', 'QB', 20),
        p('2', 'RB A', 'RB', 15),
        p('3', 'RB B', 'RB', 12),
        p('4', 'WR A', 'WR', 14),
        p('5', 'WR B', 'WR', 11),
        p('6', 'TE A', 'TE', 9),
        p('7', 'RB C', 'RB', 10),
        p('8', 'K A', 'K', 8),
        p('9', 'DST A', 'DST', 7),
      ],
      SLOTS,
    );
    const bySlot = result.starters.map(s => `${s.slot}:${s.player?.name ?? 'empty'}`);
    expect(bySlot).toEqual([
      'QB:QB A', 'RB:RB A', 'RB:RB B', 'WR:WR A', 'WR:WR B', 'TE:TE A', 'FLEX:RB C', 'K:K A', 'DST:DST A',
    ]);
    expect(result.totalScore).toBe(106);
    expect(result.bench).toEqual([]);
  });

  it('does not let a flex slot steal a QB in superflex leagues', () => {
    const sf: RosterSlots = { ...SLOTS, SUPERFLEX: 1 };
    const result = optimalLineup(
      [
        p('1', 'QB A', 'QB', 22),
        p('2', 'QB B', 'QB', 18),
        p('3', 'RB A', 'RB', 16),
        p('4', 'RB B', 'RB', 13),
        p('5', 'WR A', 'WR', 15),
        p('6', 'WR B', 'WR', 12),
        p('7', 'TE A', 'TE', 8),
        p('8', 'RB C', 'RB', 11),
        p('9', 'K A', 'K', 8),
        p('10', 'DST A', 'DST', 7),
      ],
      sf,
    );
    const sfSlot = result.starters.find(s => s.slot === 'SUPERFLEX');
    expect(sfSlot?.player?.name).toBe('QB B');
    expect(result.starters.find(s => s.slot === 'QB')?.player?.name).toBe('QB A');
  });

  it('leaves slots empty and benches everyone else when short at a position', () => {
    const result = optimalLineup([p('1', 'QB A', 'QB', 20), p('2', 'RB A', 'RB', 15)], SLOTS);
    expect(result.starters.filter(s => s.player === null).length).toBe(7);
    expect(result.bench).toEqual([]);
  });

  it('treats DEF as DST and benches players no slot accepts', () => {
    const result = optimalLineup(
      [p('1', 'DEF A', 'DEF', 9), p('2', 'IDP A', 'LB', 12)],
      { ...SLOTS, QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, K: 0, DST: 1 },
    );
    expect(result.starters[0].player?.name).toBe('DEF A');
    expect(result.bench.map(b => b.name)).toEqual(['IDP A']);
  });

  it('benches the lowest scorers, highest first', () => {
    const result = optimalLineup(
      [p('1', 'RB A', 'RB', 15), p('2', 'RB B', 'RB', 12), p('3', 'RB C', 'RB', 9)],
      { ...SLOTS, QB: 0, RB: 1, WR: 0, TE: 0, FLEX: 0, K: 0, DST: 0 },
    );
    expect(result.starters[0].player?.name).toBe('RB A');
    expect(result.bench.map(b => b.name)).toEqual(['RB B', 'RB C']);
  });
});
