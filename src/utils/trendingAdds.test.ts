import { describe, it, expect } from 'vitest';
import { trendingTargets } from './trendingAdds';
import type { League, Team, Player } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import type { TrendingAdd } from '@/api/sleeperTrending';

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
  generatedAt: '2026-10-29',
  baseline: { budget: 200, teams: 10, rounds: 16 },
  players: [
    poolPlayer({ id: 'wr-hot', name: 'Hot Receiver' }),
    poolPlayer({ id: 'wr-rostered', name: 'Rostered Receiver' }),
    poolPlayer({ id: 'qb-hot', name: 'Hot Quarterback', pos: 'QB', sleeperId: 's-qb-hot' }),
    poolPlayer({ id: 'dst-hot', name: 'Dallas Defense', pos: 'DST', sleeperId: 's-dst-hot' }),
    poolPlayer({ id: 'wr-noproj', name: 'No Projection', projPtsPpr: 0 }),
  ],
};

function rosterPlayer(id: string, name: string): Player {
  return { id, platformId: '', name, position: 'WR', team: 'DAL' };
}

function leagueWithRostered(...players: Player[]): League {
  const team: Team = { id: 't1', name: 'Team 1', roster: players } as Team;
  return { teams: [team] } as League;
}

const trending: TrendingAdd[] = [
  { playerId: 's-wr-hot', count: 1200 },
  { playerId: 's-wr-rostered', count: 900 },
  { playerId: 's-qb-hot', count: 800 },
  { playerId: 's-dst-hot', count: 700 },
  { playerId: 's-wr-noproj', count: 600 },
  { playerId: 's-unknown', count: 500 },
];

describe('trendingTargets', () => {
  it('joins trending ids to the pool and drops rostered, DST, unprojected, and unknown players', () => {
    const league = leagueWithRostered(rosterPlayer('wr-rostered', 'Rostered Receiver'));
    const targets = trendingTargets(league, pool, trending, 10);
    expect(targets.map(t => t.player.id)).toEqual(['wr-hot', 'qb-hot']);
    expect(targets[0].adds).toBe(1200);
  });

  it('keeps every trending player when nothing is rostered', () => {
    const league = leagueWithRostered();
    const targets = trendingTargets(league, pool, trending, 10);
    expect(targets.map(t => t.player.id)).toEqual(['wr-hot', 'wr-rostered', 'qb-hot']);
  });

  it('respects the limit', () => {
    const league = leagueWithRostered();
    const targets = trendingTargets(league, pool, trending, 1);
    expect(targets).toHaveLength(1);
    expect(targets[0].player.id).toBe('wr-hot');
  });

  it('resolves rostered players by name when ids differ (Yahoo/ESPN rosters)', () => {
    const league = leagueWithRostered(rosterPlayer('some-other-id', 'Hot Receiver'));
    const targets = trendingTargets(league, pool, trending, 10);
    expect(targets.map(t => t.player.id)).toEqual(['wr-rostered', 'qb-hot']);
  });
});
