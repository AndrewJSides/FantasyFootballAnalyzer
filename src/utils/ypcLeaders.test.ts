// YPC Leaders board (backlog item 151): per-position yards-per-
// carry leaders over the last 3 completed weeks, priced on
// Sleeper's free public weekly stats (rush_yd over rush attempts).

import { describe, it, expect } from 'vitest';
import { buildYpcLeaders, type YpcLeadersInput } from './ypcLeaders';
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

function line(rushYards: number, carries = 10): WeeklyUsageLine {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets: 8,
    rushAtt: carries,
    receptions: 0,
    rzOpps: 0,
    airYards: 0,
    deepRec: 0,
    longRec: 0,
    yac: 0,
    recYards: 0,
    rushYards,
    rushTd: 0,
    recTd: 0, passYards: 0, passTd: 0, passAtt: 0, passCmp: 0, rushFd: 0, recFd: 0, ptsPpr: 0,
  };
}

function input(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
): YpcLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 8 };
}

const players = [
  player('alpha', 'Alpha Back', 'RB'),
  player('beta', 'Beta Back', 'RB'),
  player('gamma', 'Gamma Receiver', 'WR'),
  player('delta', 'Delta Tight End', 'TE'),
];

describe('buildYpcLeaders', () => {
  it('ranks by yards per carry over the last 3 completed weeks', () => {
    const leaders = buildYpcLeaders(
      input(players, {
        alpha: { 5: line(100), 6: line(60), 7: line(140) },
        beta: { 5: line(60), 6: line(60), 7: line(60) },
        gamma: { 5: line(90), 6: line(90), 7: line(90) },
        delta: { 5: line(0), 6: line(0), 7: line(0) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(rb[0].ypc).toBe(10);
    expect(rb[0].rushYards).toBe(300);
    expect(rb[0].carries).toBe(30);
    expect(rb[0].rushYardsPerGame).toBe(100);
    expect(rb[0].games).toBe(3);
    expect(rb[1].ypc).toBe(6);
    expect(leaders.get('WR')?.[0].player.id).toBe('gamma');
    expect(leaders.get('WR')?.[0].ypc).toBe(9);
    expect(leaders.get('TE')).toBeUndefined();
  });

  it('ignores the in-progress week and weeks before the window', () => {
    const leaders = buildYpcLeaders(
      input(players, {
        // Week 8 is in progress, week 4 is outside the 3-week window.
        alpha: { 4: line(500), 5: line(50), 6: line(50), 7: line(50), 8: line(500) },
        beta: { 5: line(60), 6: line(60), 7: line(60) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb[0].player.id).toBe('beta');
    expect(rb[0].ypc).toBe(6);
    expect(rb[1].ypc).toBe(5);
  });

  it('requires 2+ games and 15+ carries in the window', () => {
    const leaders = buildYpcLeaders(
      input(players, {
        // One game only, however efficient.
        alpha: { 7: line(100, 10) },
        // Three games but only 9 carries — the 1-for-40 fluke guard.
        beta: { 5: line(60, 3), 6: line(60, 3), 7: line(60, 3) },
        gamma: { 5: line(90), 6: line(90), 7: line(90) },
      }),
    );
    expect(leaders.get('RB')).toBeUndefined();
    expect(leaders.get('WR')?.map(r => r.player.id)).toEqual(['gamma']);
  });

  it('drops players with no rushing yards', () => {
    const leaders = buildYpcLeaders(
      input(players, {
        alpha: { 5: line(0), 6: line(0), 7: line(0) },
        gamma: { 5: line(90), 6: line(90), 7: line(90) },
      }),
    );
    expect(leaders.get('RB')).toBeUndefined();
    expect(leaders.get('WR')?.map(r => r.player.id)).toEqual(['gamma']);
  });

  it('breaks YPC ties by rushing yards, then carries', () => {
    const leaders = buildYpcLeaders(
      input(players, {
        alpha: { 5: line(100), 6: line(100), 7: line(100) },
        beta: { 5: line(100, 10), 6: line(100, 10), 7: line(0, 0) },
        gamma: { 5: line(105), 6: line(105), 7: line(105) },
      }),
    );
    // Gamma 10.5 leads the WR board outright; Alpha and Beta both
    // 10.0 on the RB board, Alpha's 300 yards beat Beta's 200.
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(rb[0].player.id).toBe('alpha');
    expect(rb[0].rushYards).toBe(300);
    expect(rb[1].player.id).toBe('beta');
    expect(leaders.get('WR')?.[0].player.id).toBe('gamma');
    expect(leaders.get('WR')?.[0].ypc).toBe(10.5);
  });

  it('caps at 15 per position', () => {
    const many = Array.from({ length: 17 }, (_, i) =>
      player(`rb${i}`, `Back ${i}`, 'RB'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    many.forEach((p, i) => {
      // Even split: first 16 get 10.0 YPC over 3 weeks, last gets 3.0.
      const per = i < 16 ? 100 : 30;
      usage[p.sleeperId!] = { 5: line(per), 6: line(per), 7: line(per) };
    });
    const leaders = buildYpcLeaders(input(many, usage));
    expect(leaders.get('RB')).toHaveLength(15);
  });
});
