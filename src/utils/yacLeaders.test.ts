// YAC Leaders board (backlog item 149): per-position yards-after-
// catch leaders over the last 3 completed weeks, priced on Sleeper's
// free public weekly stats (rec_yar).

import { describe, it, expect } from 'vitest';
import { buildYacLeaders, teamYacByWeek, type YacLeadersInput } from './yacLeaders';
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

function line(yac: number, receptions = 5): WeeklyUsageLine {
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
    yac,
  };
}

function input(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
): YacLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 8 };
}

const players = [
  player('alpha', 'Alpha Back', 'RB'),
  player('beta', 'Beta Back', 'RB'),
  player('gamma', 'Gamma Receiver', 'WR'),
  player('delta', 'Delta Tight End', 'TE'),
];

describe('teamYacByWeek', () => {
  it('sums YAC per team per week across pool players', () => {
    const byWeek = teamYacByWeek(players, {
      alpha: { 5: line(40), 6: line(30) },
      beta: { 5: line(20), 6: line(0) },
      gamma: { 5: line(50) },
    });
    expect(byWeek.get('DAL')?.get(5)).toBe(110);
    expect(byWeek.get('DAL')?.get(6)).toBe(30);
    expect(byWeek.get('DAL')?.get(7)).toBeUndefined();
  });
});

describe('buildYacLeaders', () => {
  it('ranks by YAC per game over the last 3 completed weeks', () => {
    const leaders = buildYacLeaders(
      input(players, {
        alpha: { 5: line(60), 6: line(30), 7: line(90) },
        beta: { 5: line(20), 6: line(20), 7: line(20) },
        gamma: { 5: line(50), 6: line(50), 7: line(50) },
        delta: { 5: line(0), 6: line(10), 7: line(0) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(rb[0].yac).toBe(180);
    expect(rb[0].yacPerGame).toBe(60);
    expect(rb[0].yacPerRec).toBe(12);
    expect(rb[0].games).toBe(3);
    // Team DAL weeks 5-7 totals 130 + 110 + 160 = 400; Alpha took 180 of them.
    expect(rb[0].yacShare).toBeCloseTo(180 / 400, 2);
    expect(leaders.get('WR')?.[0].player.id).toBe('gamma');
    expect(leaders.get('TE')?.[0].player.id).toBe('delta');
  });

  it('ignores the in-progress week and weeks before the window', () => {
    const leaders = buildYacLeaders(
      input(players, {
        // Week 8 is in progress, week 4 is outside the 3-week window.
        alpha: { 4: line(200), 5: line(10), 6: line(10), 7: line(10), 8: line(200) },
        beta: { 5: line(30), 6: line(30), 7: line(30) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb[0].player.id).toBe('beta');
    expect(rb[0].yacPerGame).toBe(30);
    expect(rb[1].yacPerGame).toBe(10);
  });

  it('requires 2+ games and drops players with no YAC', () => {
    const leaders = buildYacLeaders(
      input(players, {
        alpha: { 7: line(100) },
        beta: { 5: line(0), 6: line(0), 7: line(0) },
        gamma: { 5: line(10), 6: line(10), 7: line(10) },
      }),
    );
    expect(leaders.get('RB')).toBeUndefined();
    expect(leaders.get('WR')?.map(r => r.player.id)).toEqual(['gamma']);
  });

  it('skips a player with no usage lines for his team', () => {
    const ghost = player('ghost', 'Ghost Back', 'RB', 'NOPE');
    const empty = buildYacLeaders(input([ghost], {}));
    expect(empty.get('RB')).toBeUndefined();
  });

  it('caps at 15 per position, ties broken by total YAC', () => {
    const many = Array.from({ length: 17 }, (_, i) =>
      player(`rb${i}`, `Back ${i}`, 'RB'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    many.forEach((p, i) => {
      // Even split: first 16 get 30/game over 3 weeks, last gets 10/game.
      const per = i < 16 ? 30 : 10;
      usage[p.sleeperId!] = { 5: line(per), 6: line(per), 7: line(per) };
    });
    const leaders = buildYacLeaders(input(many, usage));
    expect(leaders.get('RB')).toHaveLength(15);
  });
});
