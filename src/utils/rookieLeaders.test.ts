// Rookie Leaders board (backlog item 187): per-position rookie
// PPR fantasy-points leaders over the last 3 completed weeks,
// priced on Sleeper's free public weekly stats (pts_ppr).

import { describe, it, expect } from 'vitest';
import {
  buildRookieLeaders,
  type RookieLeadersInput,
} from './rookieLeaders';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';
import type { PoolPlayer } from '@/types/draft';

function player(
  id: string,
  name: string,
  pos: string,
  rookie = true,
  team = 'DAL',
): PoolPlayer {
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
    rookie,
  } as PoolPlayer;
}

function line(
  ptsPpr: number,
  rushAtt = 0,
  receptions = 0,
): WeeklyUsageLine {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets: 0,
    rushAtt,
    receptions,
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
    rushFd: 0,
    recFd: 0,
    ptsPpr,
  };
}

function input(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
): RookieLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 8 };
}

const players = [
  player('alpha', 'Alpha Rookie', 'RB'),
  player('beta', 'Beta Rookie', 'RB'),
  player('gamma', 'Gamma Rookie', 'WR'),
  player('delta', 'Delta Vet', 'RB', false),
];

describe('buildRookieLeaders', () => {
  it('ranks rookies by PPR points per game over the last 3 completed weeks', () => {
    const leaders = buildRookieLeaders(
      input(players, {
        alpha: { 5: line(30, 12, 3), 6: line(25, 10, 2), 7: line(28, 11, 4) },
        beta: { 5: line(20, 8, 1), 6: line(22, 9, 2), 7: line(18, 7, 1) },
        gamma: { 5: line(15, 0, 5), 6: line(18, 0, 6), 7: line(12, 0, 4) },
        delta: { 5: line(40, 20, 0), 6: line(40, 20, 0), 7: line(40, 20, 0) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb).toHaveLength(2);
    expect(rb[0].player.name).toBe('Alpha Rookie');
    expect(rb[0].ptsPpr).toBe(83);
    expect(rb[0].ptsPerGame).toBe(27.7);
    expect(rb[0].touches).toBe(42);
    expect(rb[0].games).toBe(3);
    expect(rb[1].player.name).toBe('Beta Rookie');
    const wr = leaders.get('WR') ?? [];
    expect(wr).toHaveLength(1);
    expect(wr[0].player.name).toBe('Gamma Rookie');
    expect(wr[0].ptsPerGame).toBe(15);
  });

  it('excludes non-rookies even when they outscore every rookie', () => {
    const leaders = buildRookieLeaders(
      input(players, {
        alpha: { 5: line(10), 6: line(10), 7: line(10) },
        delta: { 5: line(40), 6: line(40), 7: line(40) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.name)).toEqual(['Alpha Rookie']);
  });

  it('requires 2+ games and drops one-game explosions', () => {
    const leaders = buildRookieLeaders(
      input(players, {
        alpha: { 7: line(45, 15, 5) },
        beta: { 5: line(20), 6: line(22), 7: line(18) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.name)).toEqual(['Beta Rookie']);
  });

  it('ignores weeks outside the last-3 window', () => {
    const leaders = buildRookieLeaders(
      input(players, {
        // Week 4 is before the window; week 8 is the in-progress week.
        alpha: { 4: line(50), 5: line(10), 6: line(10), 7: line(10), 8: line(50) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb).toHaveLength(1);
    expect(rb[0].ptsPpr).toBe(30);
    expect(rb[0].ptsPerGame).toBe(10);
  });

  it('breaks PPG ties on total points, then touches', () => {
    const tied = [
      player('one', 'One Rookie', 'RB'),
      player('two', 'Two Rookie', 'RB'),
    ];
    const leaders = buildRookieLeaders(
      input(tied, {
        // Both average 20.0 over 2 games; One has more total points.
        one: { 6: line(25, 10, 2), 7: line(25, 10, 2) },
        two: { 6: line(20, 15, 5), 7: line(20, 15, 5) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.name)).toEqual(['One Rookie', 'Two Rookie']);
  });

  it('returns no entry for a position with no qualifying rookie', () => {
    const leaders = buildRookieLeaders(
      input(players, {
        alpha: { 5: line(30), 6: line(25), 7: line(28) },
      }),
    );
    expect(leaders.has('WR')).toBe(false);
    expect(leaders.has('TE')).toBe(false);
    expect(leaders.has('QB')).toBe(false);
  });
});
