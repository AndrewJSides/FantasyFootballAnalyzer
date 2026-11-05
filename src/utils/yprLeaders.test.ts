// YPR Leaders board (backlog item 150): per-position yards-per-
// reception leaders over the last 3 completed weeks, priced on
// Sleeper's free public weekly stats (rec_yd over receptions).

import { describe, it, expect } from 'vitest';
import { buildYprLeaders, type YprLeadersInput } from './yprLeaders';
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

function line(recYards: number, receptions = 5): WeeklyUsageLine {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets: 8,
    rushAtt: 0,
    receptions,
    rzOpps: 0,
    airYards: 0,
    deepRec: 0,
    longRec: 0,
    yac: 0,
    recYards,
  };
}

function input(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
): YprLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 8 };
}

const players = [
  player('alpha', 'Alpha Back', 'RB'),
  player('beta', 'Beta Back', 'RB'),
  player('gamma', 'Gamma Receiver', 'WR'),
  player('delta', 'Delta Tight End', 'TE'),
];

describe('buildYprLeaders', () => {
  it('ranks by yards per reception over the last 3 completed weeks', () => {
    const leaders = buildYprLeaders(
      input(players, {
        alpha: { 5: line(100), 6: line(60), 7: line(140) },
        beta: { 5: line(60), 6: line(60), 7: line(60) },
        gamma: { 5: line(90), 6: line(90), 7: line(90) },
        delta: { 5: line(0), 6: line(0), 7: line(0) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(rb[0].ypr).toBe(20);
    expect(rb[0].recYards).toBe(300);
    expect(rb[0].receptions).toBe(15);
    expect(rb[0].recYardsPerGame).toBe(100);
    expect(rb[0].games).toBe(3);
    expect(rb[1].ypr).toBe(12);
    expect(leaders.get('WR')?.[0].player.id).toBe('gamma');
    expect(leaders.get('WR')?.[0].ypr).toBe(18);
    expect(leaders.get('TE')).toBeUndefined();
  });

  it('ignores the in-progress week and weeks before the window', () => {
    const leaders = buildYprLeaders(
      input(players, {
        // Week 8 is in progress, week 4 is outside the 3-week window.
        alpha: { 4: line(500), 5: line(50), 6: line(50), 7: line(50), 8: line(500) },
        beta: { 5: line(60), 6: line(60), 7: line(60) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb[0].player.id).toBe('beta');
    expect(rb[0].ypr).toBe(12);
    expect(rb[1].ypr).toBe(10);
  });

  it('requires 2+ games and 10+ receptions in the window', () => {
    const leaders = buildYprLeaders(
      input(players, {
        // One game only, however efficient.
        alpha: { 7: line(100, 5) },
        // Three games but only 9 receptions — the 1-for-40 fluke guard.
        beta: { 5: line(60, 3), 6: line(60, 3), 7: line(60, 3) },
        gamma: { 5: line(90), 6: line(90), 7: line(90) },
      }),
    );
    expect(leaders.get('RB')).toBeUndefined();
    expect(leaders.get('WR')?.map(r => r.player.id)).toEqual(['gamma']);
  });

  it('drops players with no receiving yards', () => {
    const leaders = buildYprLeaders(
      input(players, {
        alpha: { 5: line(0), 6: line(0), 7: line(0) },
        gamma: { 5: line(90), 6: line(90), 7: line(90) },
      }),
    );
    expect(leaders.get('RB')).toBeUndefined();
    expect(leaders.get('WR')?.map(r => r.player.id)).toEqual(['gamma']);
  });

  it('breaks YPR ties by receiving yards, then receptions', () => {
    const leaders = buildYprLeaders(
      input(players, {
        alpha: { 5: line(100), 6: line(100), 7: line(100) },
        beta: { 5: line(100, 10), 6: line(100, 0), 7: line(0, 0) },
        gamma: { 5: line(105), 6: line(105), 7: line(105) },
      }),
    );
    // Gamma 21.0 leads the WR board outright; Alpha and Beta both
    // 20.0 on the RB board, Alpha's 300 yards beat Beta's 200.
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(rb[0].player.id).toBe('alpha');
    expect(rb[0].recYards).toBe(300);
    expect(rb[1].player.id).toBe('beta');
    expect(leaders.get('WR')?.[0].player.id).toBe('gamma');
    expect(leaders.get('WR')?.[0].ypr).toBe(21);
  });

  it('caps at 15 per position', () => {
    const many = Array.from({ length: 17 }, (_, i) =>
      player(`rb${i}`, `Back ${i}`, 'RB'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    many.forEach((p, i) => {
      // Even split: first 16 get 20.0 YPR over 3 weeks, last gets 6.0.
      const per = i < 16 ? 100 : 30;
      usage[p.sleeperId!] = { 5: line(per), 6: line(per), 7: line(per) };
    });
    const leaders = buildYprLeaders(input(many, usage));
    expect(leaders.get('RB')).toHaveLength(15);
  });
});
