import { describe, expect, it } from 'vitest';
import type { League, Player, RosterSlots, Team, Transaction } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { buildBidWarWatch } from './bidWarWatch';
import type { WaiverPriorityTarget } from './waiverPriority';

const SLOTS: RosterSlots = {
  QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, K: 1, DST: 1, BENCH: 5, IR: 0,
};

function poolPlayer(over: Partial<PoolPlayer> & { id: string }): PoolPlayer {
  return {
    name: over.id, team: 'FA', pos: 'WR', posRank: 1, overallRank: 1,
    tier: 1, bye: null, baseValue: null, projPtsPpr: 100, ...over,
  } as PoolPlayer;
}

function leaguePlayer(pool: PoolPlayer): Player {
  return { id: pool.id, platformId: '', name: pool.name, position: pool.pos, team: pool.team };
}

function team(id: string, name: string, roster: PoolPlayer[], transactions: Transaction[] = []): Team {
  return { id, name, roster: roster.map(leaguePlayer), transactions } as Team;
}

function waiverTx(teamId: string, teamName: string, bid: number, added: PoolPlayer): Transaction {
  return {
    id: `tx-${teamId}-${bid}`, type: 'waiver', timestamp: 1, week: 1,
    teamId, teamName, waiverBudgetSpent: bid, adds: [leaguePlayer(added)],
  } as Transaction;
}

// WR strength ladder: mine is the clear WR1 room (no need); A and B are weak
// (need); C sits mid-pack (no need). Median best lands on C's 140, so need =
// best < 139.5 catches A (60) and B (80).
const MINE_WR = poolPlayer({ id: 'wr-mine', name: 'My Star WR', pos: 'WR', team: 'PHI', projPtsPpr: 280 });
const A_WR = poolPlayer({ id: 'wr-a', name: 'A WR', pos: 'WR', team: 'CIN', projPtsPpr: 60 });
const B_WR = poolPlayer({ id: 'wr-b', name: 'B WR', pos: 'WR', team: 'NYJ', projPtsPpr: 80 });
const C_WR = poolPlayer({ id: 'wr-c', name: 'C WR', pos: 'WR', team: 'DET', projPtsPpr: 140 });
const WR_FREE = poolPlayer({ id: 'wr-free', name: 'Free Agent WR', pos: 'WR', team: 'DEN', bye: 10, projPtsPpr: 250 });
const RB_FREE = poolPlayer({ id: 'rb-free', name: 'Free Agent RB', pos: 'RB', team: 'KC', bye: 9, projPtsPpr: 240 });

const POOL_ALL = [MINE_WR, A_WR, B_WR, C_WR, WR_FREE, RB_FREE];
function testPool(): DraftPoolFile {
  return { players: POOL_ALL } as DraftPoolFile;
}

function target(p: PoolPlayer, bid: { low: number; high: number } | null = { low: 5, high: 12 }): WaiverPriorityTarget {
  return { player: p, score: 1, gapWeeks: [], need: false, surplus: false, bid, reasons: [] };
}

// spent: A -> estRemaining, B -> estRemaining. No transactions = no bid data.
function testLeague(aSpent: number | null, bSpent: number | null, currentWeek = 8) {
  const mine = team('mine', 'Mine', [MINE_WR]);
  const txsA = aSpent === null ? [] : [waiverTx('a', 'Rival A', aSpent, WR_FREE)];
  const txsB = bSpent === null ? [] : [waiverTx('b', 'Rival B', bSpent, WR_FREE)];
  const teamA = team('a', 'Rival A', [A_WR], txsA);
  const teamB = team('b', 'Rival B', [B_WR], txsB);
  const teamC = team('c', 'Rival C', [C_WR]);
  const league = {
    id: 'l', platform: 'sleeper', name: 'L', season: 2026, draftType: 'snake',
    teams: [mine, teamA, teamB, teamC], scoringType: 'ppr', totalTeams: 10,
    currentWeek, isLoaded: true, rosterSlots: SLOTS,
  } as League;
  return { league, mine };
}

describe('buildBidWarWatch', () => {
  it('flags a bid war when two needy rivals can bid, richest first', () => {
    const { league, mine } = testLeague(20, 40);
    const rows = buildBidWarWatch(league, mine, [target(WR_FREE)], testPool());
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.verdict).toBe('hot');
    expect(row.bidders).toBe(2);
    expect(row.rivals.map(r => r.teamName)).toEqual(['Rival A', 'Rival B']);
    expect(row.rivals[0].estRemaining).toBe(80);
    expect(row.rivals[1].estRemaining).toBe(60);
    expect(row.advice[0]).toContain('Bid war');
    expect(row.advice[0]).toContain('$5–$12');
  });

  it('flags warm when one needy rival is broke, naming them as no threat', () => {
    const { league, mine } = testLeague(100, 10);
    const rows = buildBidWarWatch(league, mine, [target(WR_FREE)], testPool());
    const row = rows[0];
    expect(row.verdict).toBe('warm');
    expect(row.bidders).toBe(1);
    expect(row.rivals).toHaveLength(2);
    expect(row.rivals.find(r => r.teamName === 'Rival A')!.canBid).toBe(false);
    expect(row.advice.some(a => a.includes('Rival A') && a.includes('out of FAAB'))).toBe(true);
    expect(row.advice[0]).toContain('One rival needs a WR');
  });

  it('flags clear when no rival needs the position', () => {
    const { league, mine } = testLeague(20, 40);
    // RB_FREE: A and B have no WR-strength RBs, but need is per-position —
    // no team rostered an RB at all, so best is 0 everywhere and no need.
    const rows = buildBidWarWatch(league, mine, [target(RB_FREE)], testPool());
    const row = rows[0];
    expect(row.verdict).toBe('clear');
    expect(row.rivals).toHaveLength(0);
    expect(row.advice[0]).toContain('Clear');
    expect(row.advice[0]).toContain('the $5 end');
  });

  it('never names my own team as a rival', () => {
    // Give mine a weak WR room too... but mine already has the star. Use a
    // second target at a position where mine is weak: RB (best 0 for all,
    // median 0, need = best < -0.5 — nobody needs). Instead, drop the star:
    const weakMine = team('mine2', 'Mine', [poolPlayer({ id: 'wr-weak-mine', name: 'Weak', pos: 'WR', team: 'FA', projPtsPpr: 50 })]);
    const { league } = testLeague(20, 40);
    const league2 = { ...league, teams: [weakMine, ...league.teams.filter(t => t.id !== 'mine')] } as League;
    const rows = buildBidWarWatch(league2, weakMine, [target(WR_FREE)], testPool());
    const names = rows[0].rivals.map(r => r.teamName);
    expect(names).not.toContain('Mine');
  });

  it('counts unknown-budget rivals as bidders when the league has no bid data', () => {
    const { league, mine } = testLeague(null, null);
    const rows = buildBidWarWatch(league, mine, [target(WR_FREE, null)], testPool());
    const row = rows[0];
    expect(row.verdict).toBe('hot');
    expect(row.bidders).toBe(2);
    expect(row.rivals.every(r => r.estRemaining === null && r.canBid)).toBe(true);
    expect(row.advice[0]).toContain('Bid war');
    expect(row.advice[0]).not.toContain('$');
  });

  it('respects the row limit', () => {
    const { league, mine } = testLeague(20, 40);
    const targets = [target(WR_FREE), target(RB_FREE), target(WR_FREE, null)];
    const rows = buildBidWarWatch(league, mine, targets, testPool(), 2);
    expect(rows).toHaveLength(2);
  });
});
