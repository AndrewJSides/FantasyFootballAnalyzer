// myTeamNews (backlog item 58): roster-scoped news filtering.

import { describe, expect, it } from 'vitest';
import type { League, Player, Team } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import type { NflNewsItem } from '@/api/espnNews';
import { filterNewsToMyPlayers, myTeamPoolIds } from './myTeamNews';

const pool: DraftPoolFile = {
  players: [
    { id: 'rb-mine', name: 'My Runner', pos: 'RB' },
    { id: 'wr-mine', name: 'My Receiver', pos: 'WR' },
    { id: 'qb-rival', name: 'Rival Quarterback', pos: 'QB' },
  ] as PoolPlayer[],
} as DraftPoolFile;

function rosterPlayer(id: string, name: string, position = 'RB'): Player {
  return { id, platformId: '', name, position, team: 'DAL' };
}

function teamWithRoster(roster: Player[], isMyTeam = true): Team {
  return { id: 't1', name: 'My Team', isMyTeam, roster } as Team;
}

function leagueWithTeams(...teams: Team[]): League {
  return { teams } as League;
}

function newsItem(id: string, athletes: string[]): NflNewsItem {
  return {
    id,
    headline: `Headline ${id}`,
    published: '2026-10-30T20:00:00Z',
    url: `https://www.espn.com/nfl/story/_/id/${id}/x`,
    athletes,
    teams: [],
  };
}

function athleteMap(items: NflNewsItem[]): Map<string, PoolPlayer> {
  const map = new Map<string, PoolPlayer>();
  for (const item of items) {
    for (const name of item.athletes) {
      const player = pool.players.find(p => p.name === name);
      if (player) map.set(name, player);
    }
  }
  return map;
}

describe('myTeamPoolIds', () => {
  it('resolves the my-team roster to pool ids', () => {
    const league = leagueWithTeams(
      teamWithRoster([
        rosterPlayer('rb-mine', 'My Runner'),
        rosterPlayer('wr-mine', 'My Receiver'),
      ]),
      { id: 't2', name: 'Rival', isMyTeam: false, roster: [rosterPlayer('qb-rival', 'Rival Quarterback', 'QB')] } as Team,
    );
    expect(myTeamPoolIds(league, pool)).toEqual(new Set(['rb-mine', 'wr-mine']));
  });

  it('returns an empty set when no team is marked mine', () => {
    const league = leagueWithTeams(teamWithRoster([rosterPlayer('rb-mine', 'My Runner')], false));
    expect(myTeamPoolIds(league, pool).size).toBe(0);
  });

  it('returns an empty set when the my-team roster is missing', () => {
    const league = leagueWithTeams({ id: 't1', name: 'My Team', isMyTeam: true } as Team);
    expect(myTeamPoolIds(league, pool).size).toBe(0);
  });

  it('skips roster players the pool cannot resolve', () => {
    const league = leagueWithTeams(
      teamWithRoster([
        rosterPlayer('nope', 'Camp Body', 'WR'),
        rosterPlayer('rb-mine', 'My Runner'),
      ]),
    );
    expect(myTeamPoolIds(league, pool)).toEqual(new Set(['rb-mine']));
  });
});

describe('filterNewsToMyPlayers', () => {
  const items = [
    newsItem('1', ['My Runner']),
    newsItem('2', ['Rival Quarterback']),
    newsItem('3', ['My Receiver', 'Rival Quarterback']),
    newsItem('4', ['Unknown Rookie']),
    newsItem('5', []),
  ];
  const mine = new Set(['rb-mine', 'wr-mine']);

  it('keeps headlines tagging at least one of my players', () => {
    const map = athleteMap(items);
    expect(filterNewsToMyPlayers(items, map, mine).map(i => i.id)).toEqual(['1', '3']);
  });

  it('returns nothing when the roster set is empty', () => {
    const map = athleteMap(items);
    expect(filterNewsToMyPlayers(items, map, new Set())).toEqual([]);
  });

  it('never matches names the athlete join could not resolve', () => {
    const map = new Map<string, PoolPlayer>();
    expect(filterNewsToMyPlayers(items, map, mine)).toEqual([]);
  });
});
