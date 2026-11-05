// Deep Play Leaders board (backlog item 147): per-position deep-
// reception leaders over the last 3 completed weeks, priced on
// Sleeper's free public weekly stats (rec_20_29 + rec_30_39 + rec_40p,
// rec_lng).

import { describe, it, expect } from 'vitest';
import {
  buildDeepPlayLeaders,
  teamDeepRecByWeek,
  type DeepPlayLeadersInput,
} from './deepPlayLeaders';
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

function line(deepRec: number, longRec = 30): WeeklyUsageLine {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets: 10,
    rushAtt: 0,
    receptions: 0,
    rzOpps: 0,
    airYards: 0,
    deepRec,
    longRec,
    yac: 0,
    recYards: 0, rushYards: 0, rushTd: 0, recTd: 0, passYards: 0, passTd: 0, rushFd: 0, recFd: 0, ptsPpr: 0,
  };
}

function input(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
): DeepPlayLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 8 };
}

const players = [
  player('alpha', 'Alpha Back', 'RB'),
  player('beta', 'Beta Back', 'RB'),
  player('gamma', 'Gamma Receiver', 'WR'),
  player('delta', 'Delta Tight End', 'TE'),
];

describe('teamDeepRecByWeek', () => {
  it('sums deep receptions per team per week across pool players', () => {
    const byWeek = teamDeepRecByWeek(players, {
      alpha: { 5: line(2), 6: line(1) },
      beta: { 5: line(1), 6: line(0) },
      gamma: { 5: line(3) },
    });
    expect(byWeek.get('DAL')?.get(5)).toBe(6);
    expect(byWeek.get('DAL')?.get(6)).toBe(1);
    expect(byWeek.get('DAL')?.get(7)).toBeUndefined();
  });
});

describe('buildDeepPlayLeaders', () => {
  it('ranks by deep receptions per game over the last 3 completed weeks', () => {
    const leaders = buildDeepPlayLeaders(
      input(players, {
        alpha: { 5: line(2, 45), 6: line(1, 22), 7: line(3, 60) },
        beta: { 5: line(1), 6: line(1), 7: line(1) },
        gamma: { 5: line(2), 6: line(2), 7: line(2) },
        delta: { 5: line(0), 6: line(1), 7: line(0) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(rb[0].deepRec).toBe(6);
    expect(rb[0].deepRecPerGame).toBe(2);
    expect(rb[0].games).toBe(3);
    // Team DAL weeks 5-7 totals 5 + 5 + 6 = 16; Alpha took 6 of them.
    expect(rb[0].deepShare).toBeCloseTo(6 / 16, 2);
    // Longest catch across Alpha's three weeks is 60.
    expect(rb[0].longRec).toBe(60);
    expect(leaders.get('WR')?.[0].player.id).toBe('gamma');
    expect(leaders.get('TE')?.[0].player.id).toBe('delta');
  });

  it('ignores the in-progress week and weeks before the window', () => {
    const leaders = buildDeepPlayLeaders(
      input(players, {
        // Week 8 is in progress, week 4 is outside the 3-week window.
        alpha: { 4: line(9), 5: line(1), 6: line(1), 7: line(1), 8: line(9) },
        beta: { 5: line(2), 6: line(2), 7: line(2) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb[0].player.id).toBe('beta');
    expect(rb[0].deepRecPerGame).toBe(2);
    expect(rb[1].deepRecPerGame).toBe(1);
  });

  it('requires 2+ games and drops players with no deep receptions', () => {
    const leaders = buildDeepPlayLeaders(
      input(players, {
        alpha: { 7: line(4) },
        beta: { 5: line(0), 6: line(0), 7: line(0) },
        gamma: { 5: line(1), 6: line(1), 7: line(1) },
      }),
    );
    expect(leaders.get('RB')).toBeUndefined();
    expect(leaders.get('WR')?.map(r => r.player.id)).toEqual(['gamma']);
  });

  it('skips a player with no usage lines for his team', () => {
    const ghost = player('ghost', 'Ghost Back', 'RB', 'NOPE');
    const empty = buildDeepPlayLeaders(input([ghost], {}));
    expect(empty.get('RB')).toBeUndefined();
  });

  it('caps at 15 per position, ties broken by total deep receptions', () => {
    const many = Array.from({ length: 17 }, (_, i) =>
      player(`rb${i}`, `Back ${i}`, 'RB'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    many.forEach((p, i) => {
      // Even split: first 16 get 2/game over 3 weeks, last gets 1/game.
      const per = i < 16 ? 2 : 1;
      usage[p.sleeperId!] = { 5: line(per), 6: line(per), 7: line(per) };
    });
    const leaders = buildDeepPlayLeaders(input(many, usage));
    expect(leaders.get('RB')).toHaveLength(15);
  });
});
