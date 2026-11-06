// Receptions Leaders board (backlog item 163): per-position
// receptions leaders over the last 3 completed weeks, priced on
// Sleeper's free public weekly stats (rec, via the shared
// weekly-usage fetch).

import { describe, it, expect } from 'vitest';
import {
  buildReceptionsLeaders,
  type ReceptionsLeadersInput,
} from './receptionsLeaders';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';
import type { PoolPlayer } from '@/types/draft';

function player(id: string, name: string, pos: string, team = 'DAL'): PoolPlayer {
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

function line(receptions: number, targets = 10, recYards = 80): WeeklyUsageLine {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets,
    rushAtt: 0,
    receptions,
    rzOpps: 0,
    airYards: 0,
    deepRec: 0,
    longRec: 0,
    yac: 0,
    recYards,
    rushYards: 0,
    rushTd: 0,
    recTd: 0,
    passYards: 0,
    passTd: 0,
    passAtt: 0,
    passCmp: 0,
    rushFd: 0,
    recFd: 0,
    ptsPpr: 0,
  };
}

function input(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
): ReceptionsLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 10 };
}

const players = [
  player('alpha', 'Alpha Receiver', 'WR'),
  player('beta', 'Beta Receiver', 'WR'),
  player('gamma', 'Gamma Back', 'RB'),
  player('delta', 'Delta Tight End', 'TE'),
];

describe('buildReceptionsLeaders', () => {
  it('ranks by receptions per game over the last 3 completed weeks', () => {
    const leaders = buildReceptionsLeaders(
      input(players, {
        // Alpha: 24 rec / 3 gm = 8.0; Beta: 15 / 3 = 5.0;
        // Gamma: 12 (RB tab); Delta: 9 (TE tab).
        alpha: { 7: line(8), 8: line(8), 9: line(8) },
        beta: { 7: line(5), 8: line(5), 9: line(5) },
        gamma: { 7: line(4), 8: line(4), 9: line(4) },
        delta: { 7: line(3), 8: line(3), 9: line(3) },
      }),
    );
    const wr = leaders.get('WR') ?? [];
    expect(wr.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(wr[0].receptionsPerGame).toBe(8);
    expect(wr[0].receptions).toBe(24);
    expect(wr[0].targets).toBe(30);
    expect(wr[0].recYards).toBe(240);
    expect(wr[0].games).toBe(3);
    expect((leaders.get('RB') ?? []).map(r => r.player.id)).toEqual(['gamma']);
    expect((leaders.get('TE') ?? []).map(r => r.player.id)).toEqual(['delta']);
  });

  it('ignores weeks outside the 3-week window and the in-progress week', () => {
    const leaders = buildReceptionsLeaders(
      input(players, {
        // Only weeks 7–9 count: 15 catches. Week 6's 20 catches and
        // week 10's (in-progress) 20 catches are out.
        alpha: {
          6: line(20),
          7: line(5),
          8: line(5),
          9: line(5),
          10: line(20),
        },
      }),
    );
    const wr = leaders.get('WR') ?? [];
    expect(wr).toHaveLength(1);
    expect(wr[0].receptions).toBe(15);
    expect(wr[0].receptionsPerGame).toBe(5);
  });

  it('requires 2+ games', () => {
    const leaders = buildReceptionsLeaders(
      input(players, {
        // Alpha: 1 game only (a 9-catch spot start). Doesn't qualify.
        alpha: { 9: line(9) },
      }),
    );
    expect(leaders.get('WR')).toBeUndefined();
  });

  it('excludes players with no receptions', () => {
    const leaders = buildReceptionsLeaders(
      input(players, {
        alpha: { 7: line(0), 8: line(0), 9: line(0) },
      }),
    );
    expect(leaders.get('WR')).toBeUndefined();
  });

  it('breaks per-game ties by total receptions, then targets', () => {
    const leaders = buildReceptionsLeaders(
      input(players, {
        // Both 5.0 catches per game — Alpha over 2 games (10 total,
        // 24 targets), Beta over 3 (15 total, 30 targets) — so the
        // tie-break puts Beta first.
        alpha: { 8: line(5, 12), 9: line(5, 12) },
        beta: { 7: line(5, 10), 8: line(5, 10), 9: line(5, 10) },
      }),
    );
    const wr = leaders.get('WR') ?? [];
    expect(wr.map(r => r.player.id)).toEqual(['beta', 'alpha']);
    expect(wr[0].receptionsPerGame).toBe(5);
    expect(wr[1].receptionsPerGame).toBe(5);
    expect(wr[0].receptions).toBe(15);
  });

  it('caps each position at 15 leaders', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      player(`wr${i}`, `Receiver ${i}`, 'WR'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    many.forEach((p, i) => {
      // Catches per game descends with i so the top 15 are wr0..wr14.
      usage[p.id] = {
        7: line(20 - i),
        8: line(20 - i),
        9: line(20 - i),
      };
    });
    const leaders = buildReceptionsLeaders(input(many, usage));
    const wr = leaders.get('WR') ?? [];
    expect(wr).toHaveLength(15);
    expect(wr[0].player.id).toBe('wr0');
    expect(wr[14].player.id).toBe('wr14');
  });

  it('omits positions with no leaders', () => {
    const leaders = buildReceptionsLeaders(input(players, {}));
    expect(leaders.size).toBe(0);
  });
});
