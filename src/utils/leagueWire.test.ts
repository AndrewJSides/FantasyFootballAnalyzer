import { describe, expect, it } from 'vitest';
import type { League, Player, Trade, Transaction } from '@/types';
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

function trade(
  id: string,
  status: Trade['status'],
  timestamp: number,
  week: number,
  sides: { teamId: string; teamName: string; received: Player[] }[],
): Trade {
  return {
    id,
    status,
    timestamp,
    week,
    teams: sides.map(s => ({
      teamId: s.teamId,
      teamName: s.teamName,
      playersReceived: s.received,
      playersSent: [],
    })),
  } as unknown as Trade;
}

function leagueOf(
  teams: { id: string; name: string; transactions: Transaction[] }[],
  trades: Trade[] = [],
): League {
  return {
    id: 'L1',
    name: 'Test League',
    season: 2026,
    teams: teams.map(t => ({ id: t.id, name: t.name, transactions: t.transactions })),
    trades,
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

  it('includes completed trades as rows, interleaved newest first', () => {
    const l = leagueOf(
      [
        {
          id: 't1',
          name: 'Alpha',
          transactions: [tx('a', 'waiver', 1000, 3, [player('Kareem Hunt')])],
        },
        {
          id: 't2',
          name: 'Beta',
          transactions: [
            { ...tx('c', 'free_agent', 3000, 5, [player('Bucky Irving')]), teamId: 't2', teamName: 'Beta' },
          ],
        },
      ],
      [
        trade('x', 'completed', 2000, 4, [
          { teamId: 't1', teamName: 'Alpha', received: [player('JaMarr Chase', 'WR')] },
          { teamId: 't2', teamName: 'Beta', received: [player('Amon-Ra St. Brown', 'WR')] },
        ]),
      ],
    );
    const rows = buildLeagueWire(l);
    expect(rows.map(r => r.id)).toEqual(['c::t2', 'trade::x', 'a::t1']);
    const tradeRow = rows[1];
    expect(tradeRow.type).toBe('trade');
    expect(tradeRow.teamName).toBe('Alpha');
    expect(tradeRow.teamIds).toEqual(['t1', 't2']);
    expect(tradeRow.sides?.map(s => s.teamName)).toEqual(['Alpha', 'Beta']);
    expect(tradeRow.sides?.[0].received.map(p => p.name)).toEqual(['JaMarr Chase']);
    expect(tradeRow.sides?.[1].received.map(p => p.name)).toEqual(['Amon-Ra St. Brown']);
  });

  it('excludes pending and vetoed trades', () => {
    const l = leagueOf(
      [{ id: 't1', name: 'Alpha', transactions: [] }],
      [
        trade('p', 'pending', 1000, 3, [
          { teamId: 't1', teamName: 'Alpha', received: [player('JaMarr Chase', 'WR')] },
          { teamId: 't2', teamName: 'Beta', received: [player('Amon-Ra St. Brown', 'WR')] },
        ]),
        trade('v', 'vetoed', 2000, 4, [
          { teamId: 't1', teamName: 'Alpha', received: [player('Tyreek Hill', 'WR')] },
          { teamId: 't2', teamName: 'Beta', received: [player('CeeDee Lamb', 'WR')] },
        ]),
      ],
    );
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

  it('filters trades by type and matches either side on team', () => {
    const withTrade = buildLeagueWire(
      leagueOf(
        [
          {
            id: 't1',
            name: 'Alpha',
            transactions: [tx('a', 'waiver', 1000, 3)],
          },
          { id: 't2', name: 'Beta', transactions: [] },
        ],
        [
          trade('x', 'completed', 2000, 4, [
            { teamId: 't1', teamName: 'Alpha', received: [player('JaMarr Chase', 'WR')] },
            { teamId: 't2', teamName: 'Beta', received: [player('Amon-Ra St. Brown', 'WR')] },
          ]),
        ],
      ),
    );
    expect(filterWire(withTrade, { teamId: '', type: 'trade' }).map(r => r.id)).toEqual([
      'trade::x',
    ]);
    // Second side of the trade matches the team filter too.
    expect(filterWire(withTrade, { teamId: 't2', type: '' }).map(r => r.id)).toEqual([
      'trade::x',
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

  it('includes teams that only appear in a trade', () => {
    const l = leagueOf(
      [
        { id: 't1', name: 'Alpha', transactions: [] },
        { id: 't2', name: 'Beta', transactions: [] },
      ],
      [
        trade('x', 'completed', 1000, 3, [
          { teamId: 't1', teamName: 'Alpha', received: [player('JaMarr Chase', 'WR')] },
          { teamId: 't2', teamName: 'Beta', received: [player('Amon-Ra St. Brown', 'WR')] },
        ]),
      ],
    );
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
    expect(wireMoveLabel({ type: 'trade' } as never)).toBe('traded');
  });
});
