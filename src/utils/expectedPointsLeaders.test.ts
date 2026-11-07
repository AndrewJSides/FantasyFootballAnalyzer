// ExpectedPointsLeaders (backlog item 195): per-position expected-points
// leaders priced on the same window's per-position league-average rates,
// with the FPOE gap, QB pass-attempt pricing, and the min-games /
// no-workload exclusions.

import { describe, it, expect } from 'vitest';
import {
  buildExpectedPointsLeaders,
  expectedPointsRates,
  receivingPoints,
  rushingPoints,
  passingPoints,
  type ExpectedPointsLeadersInput,
} from './expectedPointsLeaders';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';
import type { PoolPlayer } from '@/types/draft';

function pl(id: string, name: string, pos: string, team = 'DAL'): PoolPlayer {
  return {
    id,
    name,
    team,
    pos,
    posRank: 10,
    overallRank: 50,
    tier: 2,
    bye: 7,
    baseValue: null,
    projPtsPpr: 120,
    sleeperId: id,
  } as PoolPlayer;
}

function line(over: Partial<WeeklyUsageLine> = {}): WeeklyUsageLine {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets: 0,
    rushAtt: 0,
    receptions: 0,
    rzOpps: 0,
    airYards: 0,
    deepRec: 0,
    longRec: 0,
    yac: 0,
    recYards: 0,
    rushYards: 0,
    rushTd: 0,
    recTd: 0,
    passYards: 0,
    passTd: 0,
    passAtt: 0,
    passCmp: 0,
    passInt: 0,
    rushFd: 0,
    recFd: 0,
    ptsPpr: 0,
    ...over,
  };
}

/**
 * Every fixture line prices at exactly the intended window rate, so the
 * rates stay clean no matter which players a test includes:
 * - RB receiving: 10 targets → 5 rec + 50 yds = 10.0 pts (1.0/target)
 * - RB rushing: 10 carries → 40 yds = 4.0 pts (0.4/carry)
 * - WR receiving: 10 targets → 6 rec + 80 yds + 1 TD = 20.0 pts (2.0/target)
 * - QB passing: 30 attempts → 250 yds + 2 TD − 1 INT = 17.0 pts (17/30 per attempt)
 * - QB rushing: 5 carries → 25 yds = 2.5 pts (0.5/carry)
 */
function rbWeek(ptsPpr = 14, targets = 10, rushAtt = 10) {
  return line({
    targets,
    receptions: targets / 2,
    recYards: targets * 5,
    rushAtt,
    rushYards: rushAtt * 4,
    ptsPpr,
  });
}

function wrWeek(ptsPpr = 20, targets = 10) {
  return line({
    targets,
    receptions: 6,
    recYards: 80,
    recTd: 1,
    ptsPpr,
  });
}

function qbWeek(ptsPpr = 19.5, passAtt = 30, rushAtt = 5) {
  return line({
    passAtt,
    passCmp: 20,
    passYards: 250,
    passTd: 2,
    passInt: 1,
    rushAtt,
    rushYards: rushAtt * 5,
    ptsPpr,
  });
}

const players: PoolPlayer[] = [
  pl('rb-a', 'Rate Back A', 'RB'),
  pl('rb-b', 'Rate Back B', 'RB'),
  pl('wr-a', 'Rate Receiver A', 'WR'),
  pl('qb-a', 'Rate Passer A', 'QB'),
  pl('alpha', 'Alpha Back', 'RB'),
  pl('beta', 'Beta Back', 'RB'),
  pl('gamma', 'Gamma Back', 'RB'),
  pl('one-game', 'One Game Back', 'RB'),
  pl('no-work', 'No Work Back', 'RB'),
  pl('delta', 'Delta Receiver', 'WR'),
  pl('echo', 'Echo Passer', 'QB'),
  pl('foxtrot', 'Foxtrot Passer', 'QB'),
];

const usage: Record<string, Record<number, WeeklyUsageLine>> = {
  'rb-a': { 5: rbWeek(), 6: rbWeek(), 7: rbWeek() },
  'rb-b': { 5: rbWeek(), 6: rbWeek(), 7: rbWeek() },
  'wr-a': { 5: wrWeek(), 6: wrWeek(), 7: wrWeek() },
  'qb-a': { 5: qbWeek(), 6: qbWeek(), 7: qbWeek() },
  alpha: { 5: rbWeek(14), 6: rbWeek(14), 7: rbWeek(14) },
  beta: { 5: rbWeek(20), 6: rbWeek(20), 7: rbWeek(20) },
  gamma: { 5: rbWeek(20, 20, 0), 6: rbWeek(20, 20, 0), 7: rbWeek(20, 20, 0) },
  'one-game': { 7: rbWeek(30) },
  'no-work': { 5: line(), 6: line(), 7: line() },
  delta: { 5: wrWeek(17), 6: wrWeek(17), 7: wrWeek(17) },
  echo: { 5: qbWeek(19.5), 6: qbWeek(19.5), 7: qbWeek(19.5) },
  foxtrot: { 5: qbWeek(12, 30, 0), 6: qbWeek(12, 30, 0), 7: qbWeek(12, 30, 0) },
};

const input: ExpectedPointsLeadersInput = {
  poolPlayers: players,
  usageBySleeperId: usage,
  currentWeek: 8,
};

describe('expectedPointsLeaders', () => {
  it('prices the component lines on standard full-PPR scoring', () => {
    expect(receivingPoints(line({ receptions: 5, recYards: 50, recTd: 1 }))).toBe(16);
    expect(rushingPoints(line({ rushYards: 40, rushTd: 1 }))).toBe(10);
    expect(passingPoints(line({ passYards: 250, passTd: 2, passInt: 1 }))).toBe(17);
  });

  it('computes per-position league-average rates from the same window', () => {
    const rates = expectedPointsRates(input);
    expect(rates.recvPerTarget.RB).toBeCloseTo(1.0, 10);
    expect(rates.rushPerCarry.RB).toBeCloseTo(0.4, 10);
    expect(rates.recvPerTarget.WR).toBeCloseTo(2.0, 10);
    expect(rates.passPerAttempt).toBeCloseTo(17 / 30, 10);
    expect(rates.rushPerCarry.QB).toBeCloseTo(0.5, 10);
  });

  it('ranks RBs by expected points per game with the FPOE gap', () => {
    const leaders = buildExpectedPointsLeaders(input);
    const rbs = leaders.get('RB') ?? [];
    // Gamma's 20 targets a game are worth 20.0 expected; Beta and Alpha
    // share a 14.0 workload, Beta first on the actual-points tie-break;
    // the identical 14.0/14.0 rows keep pool order.
    expect(rbs.map(r => r.player.name)).toEqual([
      'Gamma Back',
      'Beta Back',
      'Rate Back A',
      'Rate Back B',
      'Alpha Back',
    ]);
    expect(rbs[0].expectedPerGame).toBe(20);
    expect(rbs[0].actualPerGame).toBe(20);
    expect(rbs[0].fpoePerGame).toBe(0);
    expect(rbs[0].targetsPerGame).toBe(20);
    expect(rbs[0].rushPerGame).toBe(0);
    expect(rbs[1].expectedPerGame).toBe(14);
    expect(rbs[1].actualPerGame).toBe(20);
    expect(rbs[1].fpoePerGame).toBe(6);
    expect(rbs[2].fpoePerGame).toBe(0);
    expect(rbs[0].games).toBe(3);
  });

  it('prices QBs on pass attempts plus carries', () => {
    const leaders = buildExpectedPointsLeaders(input);
    const qbs = leaders.get('QB') ?? [];
    expect(qbs.map(r => r.player.name)).toEqual([
      'Rate Passer A',
      'Echo Passer',
      'Foxtrot Passer',
    ]);
    expect(qbs[0].expectedPerGame).toBe(19.5);
    expect(qbs[0].passPerGame).toBe(30);
    expect(qbs[0].rushPerGame).toBe(5);
    expect(qbs[2].expectedPerGame).toBe(17);
    expect(qbs[2].actualPerGame).toBe(12);
    expect(qbs[2].fpoePerGame).toBe(-5);
  });

  it('prices the WR gap as a negative FPOE', () => {
    const leaders = buildExpectedPointsLeaders(input);
    const wrs = leaders.get('WR') ?? [];
    expect(wrs.map(r => r.player.name)).toEqual(['Rate Receiver A', 'Delta Receiver']);
    expect(wrs[1].expectedPerGame).toBe(20);
    expect(wrs[1].actualPerGame).toBe(17);
    expect(wrs[1].fpoePerGame).toBe(-3);
    expect(wrs[1].targetsPerGame).toBe(10);
  });

  it('excludes one-game players and players with no workload', () => {
    const leaders = buildExpectedPointsLeaders(input);
    const names = (leaders.get('RB') ?? []).map(r => r.player.name);
    expect(names).not.toContain('One Game Back');
    expect(names).not.toContain('No Work Back');
  });

  it('falls back to the pooled rate for a position with no targets', () => {
    const teOnly: ExpectedPointsLeadersInput = {
      poolPlayers: [pl('te-a', 'Rush Tight End', 'TE'), ...players.slice(0, 2)],
      usageBySleeperId: {
        'te-a': { 5: rbWeek(4, 0, 10), 6: rbWeek(4, 0, 10), 7: rbWeek(4, 0, 10) },
        'rb-a': { 5: rbWeek(), 6: rbWeek(), 7: rbWeek() },
        'rb-b': { 5: rbWeek(), 6: rbWeek(), 7: rbWeek() },
      },
      currentWeek: 8,
    };
    const rates = expectedPointsRates(teOnly);
    // No TE saw a target, so the TE receiving rate is the pooled 1.0.
    expect(rates.recvPerTarget.TE).toBeCloseTo(1.0, 10);
    const leaders = buildExpectedPointsLeaders(teOnly);
    const tes = leaders.get('TE') ?? [];
    expect(tes).toHaveLength(1);
    expect(tes[0].expectedPerGame).toBe(4);
  });

  it('caps each position at 15 leaders', () => {
    const many: PoolPlayer[] = [];
    const manyUsage: Record<string, Record<number, WeeklyUsageLine>> = {};
    for (let i = 0; i < 16; i++) {
      const id = `rb-${i}`;
      many.push(pl(id, `Back ${i}`, 'RB'));
      manyUsage[id] = { 5: rbWeek(14, 10 + i, 0), 6: rbWeek(14, 10 + i, 0), 7: rbWeek(14, 10 + i, 0) };
    }
    const leaders = buildExpectedPointsLeaders({
      poolPlayers: many,
      usageBySleeperId: manyUsage,
      currentWeek: 8,
    });
    expect(leaders.get('RB')).toHaveLength(15);
  });
});
