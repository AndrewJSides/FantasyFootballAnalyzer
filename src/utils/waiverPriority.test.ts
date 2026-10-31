import { describe, expect, it } from 'vitest';
import type { League, Player, RosterSlots, Team, Transaction } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { buildWaiverPriority } from './waiverPriority';

const SLOTS: RosterSlots = {
  QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, K: 1, DST: 1, BENCH: 5, IR: 0,
};

function poolPlayer(over: Partial<PoolPlayer> & { id: string }): PoolPlayer {
  return {
    name: over.id, team: 'FA', pos: 'WR', posRank: 1, overallRank: 1,
    tier: 1, bye: null, baseValue: null, projPtsPpr: 100, ...over,
  } as PoolPlayer;
}

// Mine: weak at WR (need), decent everywhere else; only QB is on bye in week 8.
const QB1 = poolPlayer({ id: 'qb1', name: 'My QB', pos: 'QB', team: 'KC', bye: 8, projPtsPpr: 320 });
const RB1 = poolPlayer({ id: 'rb1', name: 'My RB', pos: 'RB', team: 'DET', bye: 6, projPtsPpr: 300 });
const WR_WEAK = poolPlayer({ id: 'wr-weak', name: 'My Weak WR', pos: 'WR', team: 'CIN', bye: 10, projPtsPpr: 120 });
const TE1 = poolPlayer({ id: 'te1', name: 'My TE', pos: 'TE', team: 'KC', bye: 9, projPtsPpr: 160 });
// Theirs: strong at WR, so mine is a need there.
const WR_STAR = poolPlayer({ id: 'wr-star', name: 'Their WR', pos: 'WR', team: 'PHI', bye: 11, projPtsPpr: 280 });
const RB2 = poolPlayer({ id: 'rb2', name: 'Their RB', pos: 'RB', team: 'SF', bye: 9, projPtsPpr: 190 });
const QB2 = poolPlayer({ id: 'qb2', name: 'Their QB', pos: 'QB', team: 'BUF', bye: 12, projPtsPpr: 180 });
// Free agents.
const WR_FREE = poolPlayer({ id: 'wr-free', name: 'Free WR', pos: 'WR', team: 'NYJ', bye: 13, projPtsPpr: 250 });
const RB_FREE = poolPlayer({ id: 'rb-free', name: 'Free RB', pos: 'RB', team: 'DEN', bye: 10, projPtsPpr: 260 });
const QB_FREE = poolPlayer({ id: 'qb-free', name: 'Free QB', pos: 'QB', team: 'MIA', bye: 9, projPtsPpr: 150 });
const QB_FREE_ON_BYE = poolPlayer({ id: 'qb-free-bye', name: 'Free QB On Bye', pos: 'QB', team: 'LV', bye: 8, projPtsPpr: 160 });

const POOL_ALL = [QB1, RB1, WR_WEAK, TE1, WR_STAR, RB2, QB2, WR_FREE, RB_FREE, QB_FREE, QB_FREE_ON_BYE];

function testPool(): DraftPoolFile {
  return { players: POOL_ALL } as DraftPoolFile;
}

function leaguePlayer(pool: PoolPlayer): Player {
  return { id: pool.id, platformId: '', name: pool.name, position: pool.pos, team: pool.team };
}

function team(id: string, name: string, roster: PoolPlayer[], transactions: Transaction[] = []): Team {
  return { id, name, roster: roster.map(leaguePlayer), transactions } as Team;
}

function waiverTx(bid: number, added: PoolPlayer): Transaction {
  return {
    id: `tx-${added.id}`, type: 'waiver', timestamp: 1, week: 1,
    teamId: 'theirs', teamName: 'Theirs', waiverBudgetSpent: bid,
    adds: [leaguePlayer(added)],
  } as Transaction;
}

function testLeague(transactions: Transaction[] = [], currentWeek = 8): { league: League; mine: Team } {
  const mine = team('mine', 'Mine', [QB1, RB1, WR_WEAK, TE1]);
  const theirs = team('theirs', 'Theirs', [WR_STAR, RB2, QB2], transactions);
  const league = {
    id: 'l', platform: 'sleeper', name: 'L', season: 2026, draftType: 'snake',
    teams: [mine, theirs], scoringType: 'ppr', totalTeams: 10, currentWeek,
    isLoaded: true, rosterSlots: SLOTS,
  } as League;
  return { league, mine };
}

describe('buildWaiverPriority', () => {
  it('ranks a need-position player above a higher-projected non-need player', () => {
    const { league, mine } = testLeague();
    const queue = buildWaiverPriority(league, mine, testPool(), 4);
    const ids = queue.map(t => t.player.id);
    // WR_FREE 250 * 1.25 (need) = 312.5 beats RB_FREE 260 * 1 (no need).
    expect(ids[0]).toBe('wr-free');
    expect(ids).toContain('rb-free');
    expect(queue[0].need).toBe(true);
    expect(queue[0].reasons.some(r => r.includes('Need at WR'))).toBe(true);
  });

  it('boosts a bye-week gap filler above a higher-projected non-filler', () => {
    const { league, mine } = testLeague();
    const queue = buildWaiverPriority(league, mine, testPool(), 8);
    const qbFree = queue.find(t => t.player.id === 'qb-free')!;
    const qbFreeBye = queue.find(t => t.player.id === 'qb-free-bye')!;
    // QB_FREE fills the week-8 QB hole (150 * 1.5 = 225); the higher-projected
    // QB_FREE_ON_BYE is on bye that week so it fills nothing (160 * 1 = 160).
    expect(qbFree.gapWeeks).toEqual([8]);
    expect(qbFree.score).toBeGreaterThan(qbFreeBye.score);
    expect(qbFree.reasons.some(r => r.includes('Week 8') && r.includes('gap'))).toBe(true);
  });

  it('prices FAAB bid ranges when the league has recorded bids', () => {
    const { league, mine } = testLeague([waiverTx(10, RB2)]);
    const queue = buildWaiverPriority(league, mine, testPool(), 4);
    expect(queue.length).toBeGreaterThan(0);
    for (const target of queue) {
      expect(target.bid).not.toBeNull();
      expect(target.bid!.low).toBeLessThanOrEqual(target.bid!.high);
    }
    expect(queue[0].reasons.some(r => r.includes('Suggested FAAB bid'))).toBe(true);
  });

  it('omits bid ranges but still ranks when the league has no bid data', () => {
    const { league, mine } = testLeague();
    const queue = buildWaiverPriority(league, mine, testPool(), 4);
    expect(queue.length).toBeGreaterThan(0);
    expect(queue.every(t => t.bid === null)).toBe(true);
    expect(queue.every(t => t.reasons.every(r => !r.includes('FAAB')))).toBe(true);
  });

  it('respects the limit and never includes rostered players', () => {
    const { league, mine } = testLeague();
    const queue = buildWaiverPriority(league, mine, testPool(), 2);
    expect(queue).toHaveLength(2);
    const rostered = new Set(['qb1', 'rb1', 'wr-weak', 'te1', 'wr-star', 'rb2', 'qb2']);
    expect(queue.every(t => !rostered.has(t.player.id))).toBe(true);
  });
});
