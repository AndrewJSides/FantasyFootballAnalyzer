import { describe, expect, it } from 'vitest';
import type { League, Player, Transaction } from '@/types';
import {
  buildLeagueWire,
  filterWire,
  wireMoveLabel,
  wireTeams,
} from './leagueWire';

function player(name: string, position = 'RB', team = 'SF'): Player {
  return { id: name, platformId: name, name, position, team };
}

function tx(
  id: string,
  type: Transaction['type'],
  timestamp: number,
  week: number,
  adds: Player[] = [],
  drops: Player[] = [],
  waiverBudgetSpent?: number,
): Transaction {
  return {
    id,
    type,
    timestamp,
    week,
    teamId: 't1',
    teamName: 'Alpha',
    adds,
    drops,
    waiverBudgetSpent,
  };
}

function leagueOf(teams: { id: string; name: string; transactions: Transaction[] }[]): League {
  return {
    id: 'L1',
    name: 'Test League',
    season: 2026,
    teams: teams.map(t => ({ id: t.id, name: t.name, transactions: t.transactions })),
    scoringType: 'ppr',
    rosterSlots: {},
  } as unknown as League;
}

describe('buildLeagueWire', () => {
  it('collects waiver and free-agent moves across teams, newest first', () => {
    const l = leagueOf([
      {
        id: 't1',
        name: 'Alpha',
        transactions: [
          tx('a', 'waiver', 1000, 3, [player('Kareem Hunt')]),
          tx('b', 'trade', 2000, 4, [player('JaMarr Chase')]),
        ],
      },
      {
        id: 't2',
        name: 'Beta',
        transactions: [
          { ...tx('c', 'free_agent', 3000, 5, [player('Bucky Irving')]), teamId: 't2', teamName: 'Beta' },
        ],
      },
    ]);
    const rows = buildLeagueWire(l);
    expect(rows.map(r => r.id)).toEqual(['c::t2', 'a::t1']);
    expect(rows[0].type).toBe('free_agent');
    expect(rows[0].teamName).toBe('Beta');
    expect(rows[1].teamName).toBe('Alpha');
  });

  it('drops trade-type transactions (trades live on the Trades page)', () => {
    const l = leagueOf([
      { id: 't1', name: 'Alpha', transactions: [tx('a', 'trade', 1000, 3)] },
    ]);
    expect(buildLeagueWire(l)).toEqual([]);
  });

  it('falls back to the team roster name when tx.teamName is blank', () => {
    const bad = tx('a', 'waiver', 1000, 3, [player('Kareem Hunt')]);
    bad.teamName = '';
    const l = leagueOf([{ id: 't1', name: 'Alpha', transactions: [bad] }]);
    expect(buildLeagueWire(l)[0].teamName).toBe('Alpha');
  });

  it('orders same-timestamp moves by team name', () => {
    const bTx = { ...tx('b', 'waiver', 1000, 3), teamId: 't2', teamName: 'Beta' };
    const aTx = { ...tx('a', 'waiver', 1000, 3), teamId: 't1', teamName: 'Alpha' };
    const l = leagueOf([
      { id: 't2', name: 'Beta', transactions: [bTx] },
      { id: 't1', name: 'Alpha', transactions: [aTx] },
    ]);
    expect(buildLeagueWire(l).map(r => r.teamName)).toEqual(['Alpha', 'Beta']);
  });
});

describe('filterWire', () => {
  const rows = buildLeagueWire(
    leagueOf([
      {
        id: 't1',
        name: 'Alpha',
        transactions: [tx('a', 'waiver', 1000, 3), tx('b', 'free_agent', 2000, 4)],
      },
      {
        id: 't2',
        name: 'Beta',
        transactions: [
          { ...tx('c', 'waiver', 3000, 5), teamId: 't2', teamName: 'Beta' },
        ],
      },
    ]),
  );

  it('filters by type', () => {
    expect(filterWire(rows, { teamId: '', type: 'waiver' }).map(r => r.id)).toEqual([
      'c::t2',
      'a::t1',
    ]);
  });

  it('filters by team', () => {
    expect(filterWire(rows, { teamId: 't1', type: '' }).map(r => r.id)).toEqual([
      'b::t1',
      'a::t1',
    ]);
  });

  it('returns everything when both filters are empty', () => {
    expect(filterWire(rows, { teamId: '', type: '' })).toHaveLength(3);
  });
});

describe('wireTeams', () => {
  it('dedupes teams and sorts by name', () => {
    const l = leagueOf([
      {
        id: 't2',
        name: 'Beta',
        transactions: [{ ...tx('c', 'waiver', 3000, 5), teamId: 't2', teamName: 'Beta' }],
      },
      {
        id: 't1',
        name: 'Alpha',
        transactions: [tx('a', 'waiver', 1000, 3), tx('b', 'waiver', 2000, 4)],
      },
    ]);
    expect(wireTeams(buildLeagueWire(l))).toEqual([
      { teamId: 't1', teamName: 'Alpha' },
      { teamId: 't2', teamName: 'Beta' },
    ]);
  });
});

describe('wireMoveLabel', () => {
  it('labels waivers as claims and free agents as pickups', () => {
    expect(wireMoveLabel({ type: 'waiver' } as never)).toBe('claimed');
    expect(wireMoveLabel({ type: 'free_agent' } as never)).toBe('picked up');
  });
});
