// Touchdown Leaders board (backlog item 153): per-position
// touchdown leaders over the last 3 completed weeks, priced on
// Sleeper's free public weekly stats (rush_td + rec_td).

import { describe, it, expect } from 'vitest';
import { buildTouchdownLeaders, type TouchdownLeadersInput } from './touchdownLeaders';
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

function line(rushTd: number, recTd: number, carries = 10, receptions = 5): WeeklyUsageLine {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets: 8,
    rushAtt: carries,
    receptions,
    rzOpps: 0,
    airYards: 0,
    deepRec: 0,
    longRec: 0,
    yac: 0,
    recYards: 0,
    rushYards: 0,
    rushTd,
    recTd,
    passYards: 0,
    passTd: 0, rushFd: 0, recFd: 0, ptsPpr: 0,
  };
}

function input(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
): TouchdownLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 8 };
}

const players = [
  player('alpha', 'Alpha Back', 'RB'),
  player('beta', 'Beta Back', 'RB'),
  player('gamma', 'Gamma Receiver', 'WR'),
  player('delta', 'Delta Tight End', 'TE'),
];

describe('buildTouchdownLeaders', () => {
  it('ranks by touchdowns per game over the last 3 completed weeks', () => {
    const leaders = buildTouchdownLeaders(
      input(players, {
        alpha: { 5: line(1, 1), 6: line(2, 0), 7: line(0, 2) },
        beta: { 5: line(1, 0), 6: line(0, 0), 7: line(1, 0) },
        gamma: { 5: line(0, 1), 6: line(0, 1), 7: line(0, 1) },
        delta: { 5: line(0, 0), 6: line(0, 0), 7: line(0, 0) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(rb[0].touchdowns).toBe(6);
    expect(rb[0].rushTd).toBe(3);
    expect(rb[0].recTd).toBe(3);
    expect(rb[0].touches).toBe(45);
    expect(rb[0].touchdownsPerGame).toBe(2);
    expect(rb[0].games).toBe(3);
    expect(rb[1].touchdownsPerGame).toBe(0.7);
    // A receiver with no rushing TDs still leads his own board.
    expect(leaders.get('WR')?.[0].player.id).toBe('gamma');
    expect(leaders.get('WR')?.[0].touchdowns).toBe(3);
    expect(leaders.get('WR')?.[0].recTd).toBe(3);
    expect(leaders.get('TE')).toBeUndefined();
  });

  it('ignores the in-progress week and weeks before the window', () => {
    const leaders = buildTouchdownLeaders(
      input(players, {
        // Week 8 is in progress, week 4 is outside the 3-week window.
        alpha: { 4: line(5, 5), 5: line(0, 0), 6: line(0, 1), 7: line(0, 1), 8: line(5, 5) },
        beta: { 5: line(1, 0), 6: line(1, 0), 7: line(1, 0) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb[0].player.id).toBe('beta');
    expect(rb[0].touchdownsPerGame).toBe(1);
    expect(rb[1].touchdownsPerGame).toBe(0.7);
    expect(rb[1].touchdowns).toBe(2);
  });

  it('requires 2+ games in the window', () => {
    const leaders = buildTouchdownLeaders(
      input(players, {
        // One game only, however productive.
        alpha: { 7: line(2, 2, 10, 5) },
        beta: { 5: line(1, 0), 6: line(1, 0), 7: line(1, 0) },
        gamma: { 5: line(0, 1), 6: line(0, 1), 7: line(0, 1) },
      }),
    );
    expect(leaders.get('RB')?.map(r => r.player.id)).toEqual(['beta']);
    expect(leaders.get('WR')?.map(r => r.player.id)).toEqual(['gamma']);
  });

  it('drops players with no touchdowns', () => {
    const leaders = buildTouchdownLeaders(
      input(players, {
        alpha: { 5: line(0, 0), 6: line(0, 0), 7: line(0, 0) },
        gamma: { 5: line(0, 1), 6: line(0, 1), 7: line(0, 1) },
      }),
    );
    expect(leaders.get('RB')).toBeUndefined();
    expect(leaders.get('WR')?.map(r => r.player.id)).toEqual(['gamma']);
  });

  it('breaks per-game ties by total touchdowns, then touches', () => {
    const leaders = buildTouchdownLeaders(
      input(players, {
        // Alpha and Beta both 1.0/gm; Alpha's 3 total beats Beta's 2.
        alpha: { 5: line(1, 0), 6: line(1, 0), 7: line(1, 0) },
        beta: { 5: line(1, 0), 6: line(1, 0) },
        gamma: { 5: line(0, 2), 6: line(0, 2), 7: line(0, 2) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(rb[0].player.id).toBe('alpha');
    expect(rb[0].touchdowns).toBe(3);
    expect(rb[1].player.id).toBe('beta');
    expect(rb[1].touchdowns).toBe(2);
    expect(leaders.get('WR')?.[0].player.id).toBe('gamma');
    expect(leaders.get('WR')?.[0].touchdownsPerGame).toBe(2);
  });

  it('caps at 15 per position', () => {
    const many = Array.from({ length: 17 }, (_, i) =>
      player(`rb${i}`, `Back ${i}`, 'RB'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    many.forEach((p, i) => {
      // Even split: first 16 get 1.0/gm over 3 weeks, last gets 0.3.
      const per = i < 16 ? 1 : 0;
      usage[p.sleeperId!] = {
        5: line(per, 0),
        6: line(per, 0),
        7: line(per, i === 16 ? 1 : 0),
      };
    });
    const leaders = buildTouchdownLeaders(input(many, usage));
    expect(leaders.get('RB')).toHaveLength(15);
  });
});
