import { describe, it, expect } from 'vitest';
import { trendingDropTargets, MAX_TRENDING_DROPS } from './trendingDrops';
import type { League, Team, Player } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import type { TrendingDrop } from '@/api/sleeperTrending';

function poolPlayer(overrides: Partial<PoolPlayer> & { id: string; name: string }): PoolPlayer {
  return {
    pos: 'WR',
    team: 'DAL',
    projPtsPpr: 150,
    sleeperId: `s-${overrides.id}`,
    ...overrides,
  } as PoolPlayer;
}

const pool: DraftPoolFile = {
  season: 2026,
  generatedAt: '2026-10-30',
  baseline: { budget: 200, teams: 10, rounds: 16 },
  players: [
    poolPlayer({ id: 'wr-cut', name: 'Cut Receiver' }),
    poolPlayer({ id: 'wr-mine', name: 'My Receiver' }),
    poolPlayer({ id: 'qb-cut', name: 'Cut Quarterback', pos: 'QB', sleeperId: 's-qb-cut' }),
    poolPlayer({ id: 'dst-cut', name: 'Dallas Defense', pos: 'DST', sleeperId: 's-dst-cut' }),
    poolPlayer({ id: 'wr-noproj', name: 'No Projection', projPtsPpr: 0 }),
  ],
};

function rosterPlayer(id: string, name: string): Player {
  return { id, platformId: '', name, position: 'WR', team: 'DAL' };
}

function leagueWithTeams(...teams: Team[]): League {
  return { teams } as League;
}

const trending: TrendingDrop[] = [
  { playerId: 's-wr-cut', count: 1500 },
  { playerId: 's-wr-mine', count: 1200 },
  { playerId: 's-qb-cut', count: 1000 },
  { playerId: 's-dst-cut', count: 800 },
  { playerId: 's-wr-noproj', count: 600 },
  { playerId: 's-unknown', count: 500 },
];

describe('trendingDropTargets', () => {
  it('joins trending ids to the pool, names owners, and flags my players', () => {
    const mine: Team = {
      id: 't1',
      name: 'My Team',
      isMyTeam: true,
      roster: [rosterPlayer('wr-mine', 'My Receiver')],
    } as Team;
    const theirs: Team = {
      id: 't2',
      name: 'Rival',
      roster: [rosterPlayer('wr-cut', 'Cut Receiver')],
    } as Team;
    const targets = trendingDropTargets(leagueWithTeams(mine, theirs), pool, trending, 10);
    expect(targets.map(t => t.player.id)).toEqual(['wr-cut', 'wr-mine', 'qb-cut']);
    expect(targets[0].drops).toBe(1500);
    expect(targets[0].owner).toBe('Rival');
    expect(targets[0].isMine).toBe(false);
    expect(targets[1].owner).toBe('My Team');
    expect(targets[1].isMine).toBe(true);
    expect(targets[2].owner).toBeNull();
    expect(targets[2].isMine).toBe(false);
  });

  it('drops DST, unprojected, and unknown players', () => {
    const targets = trendingDropTargets(leagueWithTeams(), pool, trending, 10);
    expect(targets.map(t => t.player.id)).toEqual(['wr-cut', 'wr-mine', 'qb-cut']);
  });

  it('respects the limit', () => {
    const targets = trendingDropTargets(leagueWithTeams(), pool, trending, 1);
    expect(targets).toHaveLength(1);
    expect(targets[0].player.id).toBe('wr-cut');
  });

  it('defaults to MAX_TRENDING_DROPS', () => {
    const targets = trendingDropTargets(leagueWithTeams(), pool, trending);
    expect(targets.length).toBeLessThanOrEqual(MAX_TRENDING_DROPS);
  });

  it('resolves rostered players by name when ids differ (Yahoo/ESPN rosters)', () => {
    const mine: Team = {
      id: 't1',
      name: 'My Team',
      isMyTeam: true,
      roster: [rosterPlayer('some-other-id', 'My Receiver')],
    } as Team;
    const targets = trendingDropTargets(leagueWithTeams(mine), pool, trending, 10);
    const mine_ = targets.find(t => t.player.id === 'wr-mine');
    expect(mine_?.owner).toBe('My Team');
    expect(mine_?.isMine).toBe(true);
  });
});
