import { describe, expect, it } from 'vitest';
import type { RosterSlots, Team } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import {
  analyzeTeamImpact,
  analyzeTrade,
  analyzeTradeValue,
  DEFAULT_MANUAL_SHAPE,
  resolveTradeSide,
  valueLeagueFor,
} from './tradeAnalysis';
import type { ValueLeague } from './projectionValues';

const SLOTS: RosterSlots = { ...DEFAULT_MANUAL_SHAPE };

let rank = 1;
function player(partial: Partial<PoolPlayer> & { id: string; pos: string }): PoolPlayer {
  return {
    name: partial.id,
    team: 'FA',
    posRank: 1,
    overallRank: partial.overallRank ?? rank++,
    tier: 1,
    bye: null,
    baseValue: null,
    ...partial,
  } as PoolPlayer;
}

// Pool with a steep talent curve per position so VOR spreads are meaningful.
function makePool(): DraftPoolFile {
  const players: PoolPlayer[] = [];
  const add = (pos: string, count: number, base: number, step: number) => {
    for (let i = 0; i < count; i++) {
      const pts = base - i * step;
      players.push(
        player({
          id: `${pos}${i + 1}`,
          pos,
          projPts: pts,
          projPtsPpr: pts,
          projPtsStd: pts,
        }),
      );
    }
  };
  add('QB', 20, 380, 8);
  add('RB', 60, 300, 4);
  add('WR', 60, 280, 4);
  add('TE', 30, 220, 5);
  return { players } as DraftPoolFile;
}

function league(): ValueLeague {
  return {
    budget: 200,
    teams: 10,
    rounds: 16,
    rosterSlots: SLOTS,
    scoring: 'ppr',
  };
}

function team(id: string, name: string, rosterIds: string[]): Team {
  return {
    id,
    name,
    roster: rosterIds.map(rid => ({
      id: rid,
      platformId: rid,
      name: rid,
      position: rid.replace(/[0-9]+$/, ''),
      team: 'FA',
    })),
  } as Team;
}

describe('valueLeagueFor', () => {
  it('falls back to 10-team PPR defaults without a league', () => {
    const vl = valueLeagueFor(null);
    expect(vl.teams).toBe(10);
    expect(vl.scoring).toBe('ppr');
    expect(vl.rosterSlots).toEqual(DEFAULT_MANUAL_SHAPE);
  });

  it('derives shape from a loaded league', () => {
    const vl = valueLeagueFor({
      totalTeams: 12,
      scoringType: 'half_ppr',
      rosterSlots: SLOTS,
    } as never);
    expect(vl.teams).toBe(12);
    expect(vl.scoring).toBe('half_ppr');
  });
});

describe('resolveTradeSide', () => {
  it('resolves pool players by id and reports misses', () => {
    const pool = makePool();
    const { players, unresolved } = resolveTradeSide(['RB1', 'NOPE'], pool);
    expect(players.map(p => p.id)).toEqual(['RB1']);
    expect(unresolved).toEqual(['NOPE']);
  });
});

describe('analyzeTradeValue', () => {
  const pool = makePool();
  const vl = league();

  it('names the side with more VOR the winner', () => {
    const a = analyzeTradeValue(
      [pool.players.find(p => p.id === 'RB1')!],
      [pool.players.find(p => p.id === 'RB30')!],
      vl,
      pool,
    );
    expect(a.winner).toBe('A');
    expect(a.sideATotal).toBeGreaterThan(a.sideBTotal);
    expect(a.margin).toBeGreaterThan(0);
  });

  it('calls close trades even', () => {
    const a = analyzeTradeValue(
      [pool.players.find(p => p.id === 'RB10')!],
      [pool.players.find(p => p.id === 'RB11')!],
      vl,
      pool,
    );
    expect(a.winner).toBe('even');
  });

  it('values an empty side at zero', () => {
    const a = analyzeTradeValue([], [pool.players.find(p => p.id === 'RB1')!], vl, pool);
    expect(a.sideATotal).toBe(0);
    expect(a.winner).toBe('B');
  });
});

describe('analyzeTeamImpact', () => {
  const pool = makePool();
  const vl = league();

  it('detects a positional upgrade and depth thinning', () => {
    // Team is 4-deep at RB (RB1..RB4 all startable), weak at TE (only TE20).
    const t = team('t1', 'Alpha', ['RB1', 'RB2', 'RB3', 'RB4', 'TE20', 'WR1', 'WR2', 'QB1']);
    const rb4 = pool.players.find(p => p.id === 'RB4')!;
    const te1 = pool.players.find(p => p.id === 'TE1')!;
    const impact = analyzeTeamImpact(t, [rb4], [te1], vl, pool);

    const rb = impact.depth.find(d => d.position === 'RB')!;
    const te = impact.depth.find(d => d.position === 'TE')!;
    expect(rb.startableBefore).toBe(4);
    expect(rb.startableAfter).toBe(3);
    expect(te.bestAfter).toBeGreaterThan(te.bestBefore);
    expect(impact.takes.some(tk => tk.includes('TE') && tk.includes('upgraded'))).toBe(true);
  });

  it('warns when depth drops below starter demand', () => {
    const t = team('t1', 'Alpha', ['RB1', 'RB2', 'RB3', 'WR1', 'WR2', 'TE1', 'QB1']);
    const rb2 = pool.players.find(p => p.id === 'RB2')!;
    const rb3 = pool.players.find(p => p.id === 'RB3')!;
    const wr30 = pool.players.find(p => p.id === 'WR30')!;
    const impact = analyzeTeamImpact(t, [rb2, rb3], [wr30], vl, pool);
    expect(
      impact.takes.some(tk => tk.includes('RB') && tk.includes('below starter demand')),
    ).toBe(true);
  });
});

describe('analyzeTrade', () => {
  it('combines value and team impact', () => {
    const pool = makePool();
    const vl = league();
    const rb1 = pool.players.find(p => p.id === 'RB1')!;
    const te1 = pool.players.find(p => p.id === 'TE1')!;
    const teamA = team('a', 'Alpha', ['RB1', 'RB2', 'TE20']);
    const teamB = team('b', 'Beta', ['TE1', 'TE2', 'RB40']);
    const full = analyzeTrade([rb1], [te1], { valueLeague: vl, teamA, teamB, pool });
    expect(full.winner).toBe('A');
    expect(full.teamAImpact?.teamName).toBe('Alpha');
    expect(full.teamBImpact?.teamName).toBe('Beta');
  });
});
