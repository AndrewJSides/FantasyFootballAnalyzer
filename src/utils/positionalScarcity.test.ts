import { describe, expect, it } from 'vitest';
import type { PoolPlayer } from '@/types/draft';
import type { TradeValueRow } from './tradeValues';
import {
  buildPositionalScarcity,
  scarcityVerdict,
  starterDemand,
} from './positionalScarcity';
import type { ValueLeague } from './projectionValues';

const GUEST_LEAGUE: ValueLeague = {
  budget: 200,
  teams: 10,
  rounds: 16,
  rosterSlots: {
    QB: 1,
    RB: 2,
    WR: 2,
    TE: 1,
    FLEX: 1,
    SUPERFLEX: 0,
    K: 1,
    DST: 1,
    BENCH: 6,
    IR: 1,
  },
  scoring: 'ppr',
};

function row(id: string, pos: string, value: number, rank: number): TradeValueRow {
  const player = { id, name: id, pos, team: 'XXX' } as PoolPlayer;
  return { player, value, tier: 4, posRank: rank };
}

/** 30 QBs, 40 RBs, 40 WRs, 20 TEs with linearly falling chart values. */
function chartRows(): TradeValueRow[] {
  const rows: TradeValueRow[] = [];
  const mk = (pos: string, n: number, top: number, step: number) => {
    for (let i = 1; i <= n; i++)
      rows.push(row(`${pos}${i}`, pos, Math.round((top - (i - 1) * step) * 10) / 10, i));
  };
  mk('QB', 30, 60, 1.5);
  mk('RB', 40, 100, 2.2);
  mk('WR', 40, 92, 2);
  mk('TE', 20, 45, 1.8);
  return rows;
}

describe('starterDemand', () => {
  it('prices the default 10-team 1/2/2/1 + FLEX shape', () => {
    const d = starterDemand(GUEST_LEAGUE);
    expect(d.QB).toBe(10);
    // 10 × (2 + 0.4 flex) = 24
    expect(d.RB).toBe(24);
    expect(d.WR).toBe(24);
    // 10 × (1 + 0.2 flex) = 12
    expect(d.TE).toBe(12);
  });

  it('honors superflex shares', () => {
    const sf: ValueLeague = {
      ...GUEST_LEAGUE,
      rosterSlots: { ...GUEST_LEAGUE.rosterSlots, SUPERFLEX: 1 },
    };
    const d = starterDemand(sf);
    // 10 × (1 + 0.75) = 17.5 → 18
    expect(d.QB).toBe(18);
  });
});

describe('scarcityVerdict', () => {
  it('anchors to the chart tier bands', () => {
    expect(scarcityVerdict(20)).toBe('deep');
    expect(scarcityVerdict(15)).toBe('deep');
    expect(scarcityVerdict(14.9)).toBe('balanced');
    expect(scarcityVerdict(5)).toBe('balanced');
    expect(scarcityVerdict(4.9)).toBe('thin');
    expect(scarcityVerdict(0)).toBe('thin');
    expect(scarcityVerdict(null)).toBe('thin');
  });
});

describe('buildPositionalScarcity', () => {
  it('builds all four positions in guest mode on the typical-order assumption', () => {
    const rows = chartRows();
    const out = buildPositionalScarcity(rows, GUEST_LEAGUE);
    expect(out.map(o => o.position)).toEqual(['QB', 'RB', 'WR', 'TE']);
    const rb = out.find(o => o.position === 'RB')!;
    expect(rb.demandLine).toBe(24);
    // RB values: 100, 97.8, ... step 2.2 → RB24 = 100 − 23×2.2 = 49.4
    expect(rb.starterLineValue).toBeCloseTo(49.4, 1);
    // guest wire starts at RB25 = 100 − 24×2.2 = 47.2 → deep
    expect(rb.bestWaiverValue).toBeCloseTo(47.2, 1);
    expect(rb.verdict).toBe('deep');
    expect(rb.rosteredCount).toBe(24);
    // TE: demand 12, TE13 = 45 − 12×1.8 = 23.4 → deep as well on this fixture
    const te = out.find(o => o.position === 'TE')!;
    expect(te.bestWaiverValue).toBeCloseTo(23.4, 1);
    expect(te.verdict).toBe('deep');
  });

  it('prices the real wire in league mode via rostered ids', () => {
    const rows = chartRows();
    // League rosters hold the top 24 RBs plus nothing else at RB.
    const rostered = new Set(
      rows.filter(r => r.player.pos === 'RB' && r.posRank <= 24).map(r => r.player.id),
    );
    const out = buildPositionalScarcity(rows, GUEST_LEAGUE, rostered);
    const rb = out.find(o => o.position === 'RB')!;
    expect(rb.rosteredCount).toBe(24);
    // best waiver = RB25
    expect(rb.bestWaiverValue).toBeCloseTo(47.2, 1);
    // QB untouched by the rostered set: all 30 charted QBs unrostered → QB1
    const qb = out.find(o => o.position === 'QB')!;
    expect(qb.bestWaiverValue).toBeCloseTo(60, 1);
  });

  it('reads thin when the wire is bare', () => {
    const rows = chartRows();
    // Everything charted at TE is rostered.
    const rostered = new Set(
      rows.filter(r => r.player.pos === 'TE').map(r => r.player.id),
    );
    const out = buildPositionalScarcity(rows, GUEST_LEAGUE, rostered);
    const te = out.find(o => o.position === 'TE')!;
    expect(te.bestWaiverValue).toBeNull();
    expect(te.verdict).toBe('thin');
    expect(te.verdictDetail).toContain('bare');
  });

  it('handles a chart shorter than the demand line', () => {
    const rows = chartRows().filter(r => r.player.pos !== 'TE');
    const out = buildPositionalScarcity(rows, GUEST_LEAGUE);
    expect(out.map(o => o.position)).toEqual(['QB', 'RB', 'WR']);
  });

  it('returns nothing for an empty chart', () => {
    expect(buildPositionalScarcity([], GUEST_LEAGUE)).toEqual([]);
  });
});
