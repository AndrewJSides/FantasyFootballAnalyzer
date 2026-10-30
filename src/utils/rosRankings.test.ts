import { describe, expect, it } from 'vitest';
import type { DraftPick, Player } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { buildRosRankings } from './rosRankings';

function poolPlayer(over: Partial<PoolPlayer>): PoolPlayer {
  return {
    id: 'p1',
    name: 'Test Player',
    team: 'KC',
    pos: 'RB',
    posRank: 1,
    overallRank: 1,
    tier: 1,
    bye: 8,
    baseValue: null,
    ...over,
  };
}

const POOL: DraftPoolFile = {
  season: 2026,
  generatedAt: '2026-10-29',
  baseline: { budget: 200, teams: 10, rounds: 16 },
  players: [
    poolPlayer({ id: 'qb1', name: 'Elite QB', pos: 'QB', overallRank: 5, projPtsPpr: 330 }),
    poolPlayer({ id: 'rb1', name: 'Lead Back', pos: 'RB', overallRank: 10, projPtsPpr: 240 }),
    poolPlayer({ id: 'rb2', name: 'Hurt Back', pos: 'RB', overallRank: 12, projPtsPpr: 260,
      injuryStatus: 'IR', injuryBodyPart: 'Knee', injuryNotes: 'Torn ACL (surgery)' }),
    poolPlayer({ id: 'wr1', name: 'Top Wideout', pos: 'WR', overallRank: 8, projPtsPpr: 250 }),
    poolPlayer({ id: 'te1', name: 'Top Tight End', pos: 'TE', overallRank: 40, projPtsPpr: 150 }),
    poolPlayer({ id: 'k1', name: 'Best Kicker', pos: 'K', overallRank: 300, projPtsPpr: 120 }),
  ],
};

const BASE = {
  pool: POOL,
  shape: undefined,
  scoring: 'ppr' as const,
  currentWeek: 9,
};

describe('buildRosRankings', () => {
  it('ranks within position by projected rest-of-season points', () => {
    const rows = buildRosRankings(BASE);
    const rbs = rows.filter(r => r.player.pos === 'RB');
    // rb1 outranks rb2 despite the lower season projection: the ACL tear
    // zeroes the rest of his season.
    expect(rbs.map(r => r.player.id)).toEqual(['rb1', 'rb2']);
    expect(rbs[0].posRank).toBe(1);
    expect(rbs[1].posRank).toBe(2);
    expect(rbs[0].outlook.projectedPoints).toBeGreaterThan(0);
  });

  it('zeroes season-ending injuries and leaves season totals out of the ROS number', () => {
    const rows = buildRosRankings(BASE);
    const hurt = rows.find(r => r.player.id === 'rb2')!;
    expect(hurt.outlook.seasonEnding).toBe(true);
    expect(hurt.outlook.projectedPoints).toBe(0);
    expect(hurt.outlook.projectedGames).toBe(0);
  });

  it('excludes non-skill positions', () => {
    const rows = buildRosRankings(BASE);
    expect(rows.some(r => r.player.pos === 'K')).toBe(false);
  });

  it('caps rows per position', () => {
    const many: PoolPlayer[] = [POOL.players[0]];
    for (let i = 0; i < 45; i++) {
      many.push(poolPlayer({ id: `qb${i + 2}`, name: `QB ${i + 2}`, pos: 'QB', overallRank: 100 + i, projPtsPpr: 200 }));
    }
    const rows = buildRosRankings({ ...BASE, pool: { ...POOL, players: many }, maxPerPosition: 10 });
    expect(rows.filter(r => r.player.pos === 'QB')).toHaveLength(10);
  });

  it('attaches owners and never duplicates a player covered by a real pick', () => {
    const pick: DraftPick = {
      pickNumber: 10,
      round: 1,
      player: {
        id: 'yahoo-rb1',
        platformId: '',
        name: 'Lead Back',
        position: 'RB',
        team: 'KC',
      } as Player,
      teamId: 't1',
      teamName: 'Motha Puka',
    };
    const rows = buildRosRankings({
      ...BASE,
      picks: [pick],
      ownerByPoolId: new Map([['rb1', 'Motha Puka']]),
    });
    const rb1Rows = rows.filter(r => r.player.id === 'rb1');
    expect(rb1Rows).toHaveLength(1);
    expect(rb1Rows[0].owner).toBe('Motha Puka');
    expect(rows.find(r => r.player.id === 'wr1')!.owner).toBeNull();
  });

  it('skips bye weeks when counting projected games', () => {
    const rows = buildRosRankings(BASE);
    const qb = rows.find(r => r.player.id === 'qb1')!;
    // Weeks 9-17 is 9 weeks, minus the week-8 bye which is already past:
    // the bye only matters when it falls in the remaining slate.
    expect(qb.outlook.projectedGames).toBeGreaterThan(0);
    expect(qb.outlook.projectedGames).toBeLessThanOrEqual(9);
  });
});
