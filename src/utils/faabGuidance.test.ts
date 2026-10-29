import { describe, expect, it } from 'vitest';
import type { League, RosterSlots, Team, Transaction } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { DEFAULT_VOR_CONFIG } from './projectionValues';
import { DEFAULT_MANUAL_SHAPE } from './tradeAnalysis';
import { teamProfiles } from './tradeFinder';
import {
  ASSUMED_FAAB_BUDGET,
  availableTargets,
  faabNorms,
  faabSpentBy,
  suggestBid,
} from './faabGuidance';

const SLOTS: RosterSlots = { ...DEFAULT_MANUAL_SHAPE };

let rank = 1;
function poolPlayer(partial: Partial<PoolPlayer> & { id: string; pos: string }): PoolPlayer {
  return {
    name: partial.id,
    team: 'FA',
    posRank: 1,
    overallRank: partial.overallRank ?? rank++,
    tier: 1,
    bye: null,
    baseValue: null,
    ...partial,
  } as PoolPlayer;
}

function makePool(): DraftPoolFile {
  const players: PoolPlayer[] = [];
  const add = (pos: string, count: number, base: number, step: number) => {
    for (let i = 0; i < count; i++) {
      const pts = base - i * step;
      players.push(
        poolPlayer({ id: `${pos}${i + 1}`, pos, projPts: pts, projPtsPpr: pts, projPtsStd: pts }),
      );
    }
  };
  add('QB', 20, 380, 8);
  add('RB', 60, 300, 4);
  add('WR', 60, 280, 4);
  add('TE', 30, 220, 5);
  return { players } as DraftPoolFile;
}

function rosterPlayer(id: string, pos: string) {
  return { id, platformId: id, name: id, position: pos, team: 'FA' };
}

function team(id: string, name: string, rosterIds: string[], transactions: Transaction[] = []): Team {
  return {
    id,
    name,
    roster: rosterIds.map(rid => rosterPlayer(rid, rid.replace(/[0-9]+$/, ''))),
    transactions,
  } as Team;
}

function waiverTx(teamId: string, week: number, bid: number | undefined, adds: Array<{ id: string; pos: string }>): Transaction {
  return {
    id: `${teamId}-w${week}`,
    type: 'waiver',
    timestamp: week,
    week,
    teamId,
    teamName: teamId,
    adds: adds.map(a => rosterPlayer(a.id, a.pos)),
    drops: [],
    ...(bid === undefined ? {} : { waiverBudgetSpent: bid }),
  } as Transaction;
}

function league(teams: Team[]): League {
  return {
    id: 'test',
    name: 'Test League',
    platform: 'sleeper',
    totalTeams: teams.length,
    rosterSlots: SLOTS,
    scoringType: 'ppr',
    teams,
  } as League;
}

describe('faabNorms', () => {
  it('computes medians overall and per position, skipping bids-less and non-waiver transactions', () => {
    const pool = makePool();
    const txs = [
      waiverTx('a', 2, 10, [{ id: 'RB10', pos: 'RB' }]),
      waiverTx('a', 3, 20, [{ id: 'WR10', pos: 'WR' }]),
      waiverTx('b', 4, 30, [{ id: 'RB11', pos: 'RB' }]),
      waiverTx('b', 5, undefined, [{ id: 'TE10', pos: 'TE' }]), // no bid recorded: skipped
      { ...waiverTx('a', 6, 999, [{ id: 'QB10', pos: 'QB' }]), type: 'trade' } as Transaction, // not a waiver add
    ];
    const norms = faabNorms(league([team('a', 'A', [], txs)]), pool);
    expect(norms).toBeDefined();
    expect(norms!.claimCount).toBe(3);
    expect(norms!.medianBid).toBe(20);
    expect(norms!.maxBid).toBe(30);
    expect(norms!.byPosition.RB).toEqual({ count: 2, median: 20 });
    expect(norms!.byPosition.WR).toEqual({ count: 1, median: 20 });
    expect(norms!.byPosition.TE).toBeUndefined();
  });

  it('returns undefined when no bids are recorded', () => {
    const pool = makePool();
    const norms = faabNorms(
      league([team('a', 'A', [], [waiverTx('a', 2, undefined, [{ id: 'RB10', pos: 'RB' }])])]),
      pool,
    );
    expect(norms).toBeUndefined();
  });
});

describe('faabSpentBy', () => {
  it('sums waiver bids across repeat pickups', () => {
    const t = team('a', 'A', [], [
      waiverTx('a', 2, 10, [{ id: 'RB10', pos: 'RB' }]),
      waiverTx('a', 5, 25, [{ id: 'WR10', pos: 'WR' }]),
    ]);
    expect(faabSpentBy(t)).toBe(35);
  });
});

describe('availableTargets', () => {
  it('excludes rostered players, keeps skill positions, sorts by projection', () => {
    const pool = makePool();
    // Team A rosters the top RBs; the top available RB should be RB3.
    const l = league([
      team('a', 'A', ['QB1', 'RB1', 'RB2', 'WR1', 'TE1']),
      team('b', 'B', ['QB2', 'RB20', 'WR2', 'TE2']),
    ]);
    const targets = availableTargets(l, pool, 5);
    expect(targets.length).toBe(5);
    const ids = targets.map(t => t.id);
    expect(ids).not.toContain('RB1');
    expect(ids).not.toContain('WR1');
    // Descending by projPtsPpr: first entry is the best available player.
    for (let i = 1; i < targets.length; i++) {
      expect(targets[i - 1].projPtsPpr!).toBeGreaterThanOrEqual(targets[i].projPtsPpr!);
    }
    expect(targets.every(t => ['QB', 'RB', 'WR', 'TE'].includes(t.pos))).toBe(true);
  });
});

describe('suggestBid', () => {
  // Team A: deep at RB, weak at WR. Team B: deep at WR, weak at RB.
  function asymmetric(): League {
    return league([
      team(
        'a',
        'Team A',
        ['QB1', 'RB1', 'RB2', 'RB3', 'RB4', 'WR40', 'TE20'],
        [waiverTx('a', 2, 12, [{ id: 'WR41', pos: 'WR' }]), waiverTx('a', 3, 8, [{ id: 'RB30', pos: 'RB' }])],
      ),
      team(
        'b',
        'Team B',
        ['QB2', 'RB40', 'WR1', 'WR2', 'WR3', 'WR4', 'TE25'],
        [waiverTx('b', 2, 15, [{ id: 'RB41', pos: 'RB' }]), waiverTx('b', 4, 5, [{ id: 'TE26', pos: 'TE' }])],
      ),
      team('c', 'Team C', ['QB3', 'RB5', 'RB6', 'WR5', 'WR6', 'TE5']),
      team('d', 'Team D', ['QB4', 'RB7', 'RB8', 'WR7', 'WR8', 'TE6']),
    ]);
  }

  it('bids up on need and down on surplus for the same target', () => {
    const pool = makePool();
    const l = asymmetric();
    const norms = faabNorms(l, pool)!;
    const profiles = teamProfiles(l, pool, DEFAULT_VOR_CONFIG);
    const target = pool.players.find(p => p.id === 'WR10')!;
    const needy = suggestBid(target, l.teams[0], profiles, norms); // A needs WR
    const stocked = suggestBid(target, l.teams[1], profiles, norms); // B has WR surplus
    expect(needy.high).toBeGreaterThan(stocked.high);
    expect(needy.reasons.some(r => r.includes('Need at WR'))).toBe(true);
    expect(stocked.reasons.some(r => r.includes('Surplus at WR'))).toBe(true);
  });

  it('caps the range at the estimated remaining budget', () => {
    const pool = makePool();
    const bigSpender = team(
      'rich',
      'Rich',
      ['QB1', 'RB1', 'WR1', 'TE1'],
      [waiverTx('rich', 2, ASSUMED_FAAB_BUDGET - 3, [{ id: 'RB10', pos: 'RB' }])],
    );
    const l = league([
      bigSpender,
      team('b', 'B', ['QB2', 'RB2', 'WR2', 'TE2'], [waiverTx('b', 2, 10, [{ id: 'RB11', pos: 'RB' }])]),
    ]);
    const norms = faabNorms(l, pool)!;
    const profiles = teamProfiles(l, pool, DEFAULT_VOR_CONFIG);
    const target = pool.players.find(p => p.id === 'RB1')!;
    const suggestion = suggestBid(target, bigSpender, profiles, norms);
    expect(suggestion.high).toBeLessThanOrEqual(3);
    expect(suggestion.reasons.some(r => r.includes('remaining'))).toBe(true);
  });

  it('returns a $0 range with a spent-budget reason when the budget is gone', () => {
    const pool = makePool();
    const broke = team(
      'broke',
      'Broke',
      ['QB1', 'RB1', 'WR1', 'TE1'],
      [waiverTx('broke', 2, ASSUMED_FAAB_BUDGET, [{ id: 'RB10', pos: 'RB' }])],
    );
    const l = league([
      broke,
      team('b', 'B', ['QB2', 'RB2', 'WR2', 'TE2'], [waiverTx('b', 2, 10, [{ id: 'RB11', pos: 'RB' }])]),
    ]);
    const norms = faabNorms(l, pool)!;
    const profiles = teamProfiles(l, pool, DEFAULT_VOR_CONFIG);
    const target = pool.players.find(p => p.id === 'RB1')!;
    const suggestion = suggestBid(target, broke, profiles, norms);
    expect(suggestion.low).toBe(0);
    expect(suggestion.high).toBe(0);
    expect(suggestion.reasons.some(r => r.includes('spent'))).toBe(true);
  });

  it('cites the going rate in its reasons', () => {
    const pool = makePool();
    const l = asymmetric();
    const norms = faabNorms(l, pool)!;
    const profiles = teamProfiles(l, pool, DEFAULT_VOR_CONFIG);
    const target = pool.players.find(p => p.id === 'RB10')!;
    const suggestion = suggestBid(target, l.teams[2], profiles, norms);
    expect(suggestion.reasons[0]).toMatch(/Going rate/);
    expect(suggestion.low).toBeGreaterThanOrEqual(1);
    expect(suggestion.high).toBeGreaterThanOrEqual(suggestion.low);
  });
});
