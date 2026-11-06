// Rushing Attempts Leaders board (backlog item 168): per-position
// rushing-attempt leaders over the last 3 completed weeks, priced on
// Sleeper's free public weekly stats (rush_att, via the shared
// weekly-usage fetch).

import { describe, it, expect } from 'vitest';
import {
  buildRushingAttemptsLeaders,
  type RushAttLeadersInput,
} from './rushingAttemptsLeaders';
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

function line(rushAtt: number, rushYards = 60, rushTd = 1): WeeklyUsageLine {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets: 0,
    rushAtt,
    receptions: 0,
    rzOpps: 0,
    airYards: 0,
    deepRec: 0,
    longRec: 0,
    yac: 0,
    recYards: 0,
    rushYards,
    rushTd,
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
): RushAttLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 10 };
}

const players = [
  player('alpha', 'Alpha Back', 'RB'),
  player('beta', 'Beta Back', 'RB'),
  player('gamma', 'Gamma Receiver', 'WR'),
  player('delta', 'Delta Tight End', 'TE'),
];

describe('buildRushingAttemptsLeaders', () => {
  it('ranks by rushing attempts per game over the last 3 completed weeks', () => {
    const leaders = buildRushingAttemptsLeaders(
      input(players, {
        // Alpha: 60 att / 3 gm = 20.0; Beta: 45 / 3 = 15.0;
        // Gamma: 12 (WR tab); Delta: 6 (TE tab).
        alpha: { 7: line(20, 100), 8: line(20, 100), 9: line(20, 100) },
        beta: { 7: line(15, 60), 8: line(15, 60), 9: line(15, 60) },
        gamma: { 7: line(4, 20), 8: line(4, 20), 9: line(4, 20) },
        delta: { 7: line(2, 10), 8: line(2, 10), 9: line(2, 10) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(rb[0].rushAttPerGame).toBe(20);
    expect(rb[0].rushAtt).toBe(60);
    expect(rb[0].rushYards).toBe(300);
    expect(rb[0].ypc).toBe(5);
    expect(rb[0].rushTd).toBe(3);
    expect(rb[0].games).toBe(3);
    expect((leaders.get('WR') ?? []).map(r => r.player.id)).toEqual(['gamma']);
    expect((leaders.get('TE') ?? []).map(r => r.player.id)).toEqual(['delta']);
  });

  it('ignores weeks outside the 3-week window and the in-progress week', () => {
    const leaders = buildRushingAttemptsLeaders(
      input(players, {
        // Only weeks 7–9 count: 45 attempts. Week 6's 30 attempts
        // and week 10's (in-progress) 30 attempts are out.
        alpha: {
          6: line(30),
          7: line(15),
          8: line(15),
          9: line(15),
          10: line(30),
        },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb).toHaveLength(1);
    expect(rb[0].rushAtt).toBe(45);
    expect(rb[0].rushAttPerGame).toBe(15);
  });

  it('requires 2+ games', () => {
    const leaders = buildRushingAttemptsLeaders(
      input(players, {
        // Alpha: 1 game only (a 25-carry spot start). Doesn't qualify.
        alpha: { 9: line(25) },
      }),
    );
    expect(leaders.get('RB')).toBeUndefined();
  });

  it('excludes players with no rushing attempts', () => {
    const leaders = buildRushingAttemptsLeaders(
      input(players, {
        alpha: { 7: line(0), 8: line(0), 9: line(0) },
      }),
    );
    expect(leaders.get('RB')).toBeUndefined();
  });

  it('breaks per-game ties by total attempts, then rushing yards', () => {
    const leaders = buildRushingAttemptsLeaders(
      input(players, {
        // Both 15.0 attempts per game — Alpha over 2 games (30 total),
        // Beta over 3 (45 total) — so the tie-break puts Beta first.
        alpha: { 8: line(15, 90), 9: line(15, 90) },
        beta: { 7: line(15, 60), 8: line(15, 60), 9: line(15, 60) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.id)).toEqual(['beta', 'alpha']);
    expect(rb[0].rushAttPerGame).toBe(15);
    expect(rb[1].rushAttPerGame).toBe(15);
    expect(rb[0].rushAtt).toBe(45);
  });

  it('caps each position at 15 leaders', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      player(`rb${i}`, `Back ${i}`, 'RB'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    many.forEach((p, i) => {
      // Attempts per game descends with i so the top 15 are rb0..rb14.
      usage[p.id] = {
        7: line(25 - i),
        8: line(25 - i),
        9: line(25 - i),
      };
    });
    const leaders = buildRushingAttemptsLeaders(input(many, usage));
    const rb = leaders.get('RB') ?? [];
    expect(rb).toHaveLength(15);
    expect(rb[0].player.id).toBe('rb0');
    expect(rb[14].player.id).toBe('rb14');
  });

  it('omits positions with no leaders', () => {
    const leaders = buildRushingAttemptsLeaders(input(players, {}));
    expect(leaders.size).toBe(0);
  });
});
