import { describe, it, expect } from 'vitest';
import { newsWaiverTargets } from './newsWaiverTargets';
import type { League, Team, Player } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import type { NflNewsItem } from '@/api/espnNews';

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
  generatedAt: '2026-10-31',
  baseline: { budget: 200, teams: 10, rounds: 16 },
  players: [
    poolPlayer({ id: 'wr-free', name: 'Free Agent' }),
    poolPlayer({ id: 'wr-owned', name: 'Owned Receiver' }),
    poolPlayer({ id: 'rb-free', name: 'Free Back', pos: 'RB' }),
    poolPlayer({ id: 'dst-free', name: 'Dallas Defense', pos: 'DST' }),
    poolPlayer({ id: 'wr-noproj', name: 'No Projection', projPtsPpr: 0 }),
  ],
};

function rosterPlayer(name: string): Player {
  return { id: `r-${name}`, platformId: '', name, position: 'WR', team: 'DAL' };
}

function leagueWithRostered(...players: Player[]): League {
  const team: Team = { id: 't1', name: 'Team 1', roster: players } as Team;
  return { teams: [team] } as League;
}

function item(
  overrides: Partial<NflNewsItem> & { athletes: string[] },
): NflNewsItem {
  return {
    id: overrides.athletes.join('|'),
    headline: 'headline',
    description: '',
    published: '2026-10-31T12:00:00Z',
    url: 'https://www.espn.com/x',
    teams: [],
    ...overrides,
  };
}

const items: NflNewsItem[] = [
  item({
    id: 'newest',
    headline: 'Free Agent named starter',
    athletes: ['Free Agent'],
    published: '2026-10-31T14:00:00Z',
  }),
  item({
    id: 'older',
    headline: 'Free Back breaks out',
    athletes: ['Free Back'],
    published: '2026-10-30T14:00:00Z',
  }),
  item({
    id: 'oldest',
    headline: 'Free Agent again, older story',
    athletes: ['Free Agent'],
    published: '2026-10-29T14:00:00Z',
  }),
  item({
    id: 'owned',
    headline: 'Owned Receiver extended',
    athletes: ['Owned Receiver'],
  }),
  item({
    id: 'dst',
    headline: 'Dallas Defense signs coach',
    athletes: ['Dallas Defense'],
  }),
  item({
    id: 'noproj',
    headline: 'No Projection waived',
    athletes: ['No Projection'],
  }),
  item({
    id: 'unknown',
    headline: 'Somebody Else traded',
    athletes: ['Somebody Else'],
  }),
];

describe('newsWaiverTargets', () => {
  it('keeps available skill players, newest headline wins, drops owned/DST/unprojected/unknown', () => {
    const league = leagueWithRostered(rosterPlayer('Owned Receiver'));
    const targets = newsWaiverTargets(league, items, pool, 10);
    expect(targets.map(t => t.player.id)).toEqual(['wr-free', 'rb-free']);
    // Newest headline wins for the player tagged twice.
    expect(targets[0].headline).toBe('Free Agent named starter');
    expect(targets[0].url).toBe('https://www.espn.com/x');
  });

  it('keeps owned players when nothing is rostered (guest mode)', () => {
    const league = leagueWithRostered();
    const targets = newsWaiverTargets(league, items, pool, 10);
    expect(targets.map(t => t.player.id)).toEqual([
      'wr-free',
      'rb-free',
      'wr-owned',
    ]);
  });

  it('respects the limit', () => {
    const league = leagueWithRostered();
    const targets = newsWaiverTargets(league, items, pool, 1);
    expect(targets).toHaveLength(1);
    expect(targets[0].player.id).toBe('wr-free');
  });

  it('returns an empty list with no headlines', () => {
    expect(newsWaiverTargets(leagueWithRostered(), [], pool)).toEqual([]);
  });

  it('ignores headlines whose athletes match nobody', () => {
    const league = leagueWithRostered();
    const targets = newsWaiverTargets(
      league,
      [item({ id: 'x', headline: 'Nobody', athletes: ['Nobody Atall'] })],
      pool,
    );
    expect(targets).toEqual([]);
  });
});
