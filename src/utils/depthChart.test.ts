// Depth chart engine: ladder order, positional-rank fallback, free-agent
// and non-skill exclusions, ownership passthrough, alphabetical teams.
import { describe, it, expect } from 'vitest';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { buildDepthChart, depthOrder } from './depthChart';

function player(over: Partial<PoolPlayer> & { id: string }): PoolPlayer {
  return {
    name: over.id,
    team: 'DAL',
    pos: 'RB',
    posRank: 99,
    overallRank: 999,
    tier: 9,
    bye: null,
    baseValue: null,
    ...over,
  } as PoolPlayer;
}

function pool(players: PoolPlayer[]): DraftPoolFile {
  return {
    season: 2026,
    generatedAt: '2026-11-03',
    baseline: { budget: 200, teams: 10, rounds: 16 },
    players,
  };
}

describe('depthOrder', () => {
  it('prefers depth-chart order over positional rank', () => {
    const starter = player({ id: 'a', depthChartOrder: 1, posRank: 30 });
    const backup = player({ id: 'b', depthChartOrder: 2, posRank: 5 });
    expect([backup, starter].sort(depthOrder)).toEqual([starter, backup]);
  });

  it('falls back to positional rank when neither has depth-chart data', () => {
    const first = player({ id: 'a', posRank: 5 });
    const second = player({ id: 'b', posRank: 30 });
    expect([second, first].sort(depthOrder)).toEqual([first, second]);
  });
});

describe('buildDepthChart', () => {
  it('groups by team, orders each ladder, and sorts teams alphabetically', () => {
    const teams = buildDepthChart({
      pool: pool([
        player({ id: 'dal-rb2', team: 'DAL', depthChartOrder: 2, posRank: 40 }),
        player({ id: 'ari-qb1', team: 'ARI', pos: 'QB', depthChartOrder: 1, posRank: 10 }),
        player({ id: 'dal-rb1', team: 'DAL', depthChartOrder: 1, posRank: 12 }),
        player({ id: 'ari-qb2', team: 'ARI', pos: 'QB', depthChartOrder: 2, posRank: 28 }),
      ]),
    });
    expect(teams.map(t => t.nflTeam)).toEqual(['ARI', 'DAL']);
    expect(teams[0].positions.QB.map(d => d.player.id)).toEqual(['ari-qb1', 'ari-qb2']);
    expect(teams[1].positions.RB.map(d => d.player.id)).toEqual(['dal-rb1', 'dal-rb2']);
    expect(teams[1].positions.QB).toEqual([]);
  });

  it('excludes free agents and non-skill positions', () => {
    const teams = buildDepthChart({
      pool: pool([
        player({ id: 'fa-rb', team: 'FA' }),
        player({ id: 'dal-k', pos: 'K', depthChartOrder: 1, posRank: 1 }),
        player({ id: 'dal-rb1', depthChartOrder: 1, posRank: 12 }),
      ]),
    });
    expect(teams).toHaveLength(1);
    expect(teams[0].positions.RB.map(d => d.player.id)).toEqual(['dal-rb1']);
  });

  it('resolves owners where given and nulls them otherwise', () => {
    const owners = new Map([['dal-rb1', 'Delta']]);
    const teams = buildDepthChart({
      pool: pool([
        player({ id: 'dal-rb1', depthChartOrder: 1, posRank: 12 }),
        player({ id: 'dal-rb2', depthChartOrder: 2, posRank: 40 }),
      ]),
      ownerByPoolId: owners,
    });
    expect(teams[0].positions.RB.map(d => d.owner)).toEqual(['Delta', null]);
  });
});
