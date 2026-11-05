// Passing Leaders board (backlog item 154): quarterback passing
// leaders over the last 3 completed weeks, priced on Sleeper's
// free public weekly stats (pass_yd + pass_td).

import { describe, it, expect } from 'vitest';
import { buildPassingLeaders, type PassingLeadersInput } from './passingLeaders';
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

function line(passYards: number, passTd: number): WeeklyUsageLine {
  return {
    offSnaps: 60,
    teamSnaps: 70,
    targets: 0,
    rushAtt: 2,
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
    passYards,
    passTd,
    rushFd: 0,
    recFd: 0,
  };
}

function input(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
): PassingLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 8 };
}

const players = [
  player('alpha', 'Alpha Passer', 'QB'),
  player('beta', 'Beta Passer', 'QB'),
  player('gamma', 'Gamma Passer', 'QB'),
  player('delta', 'Delta Back', 'RB'),
];

describe('buildPassingLeaders', () => {
  it('ranks QBs by passing yards per game over the last 3 completed weeks', () => {
    const leaders = buildPassingLeaders(
      input(players, {
        alpha: { 5: line(300, 2), 6: line(250, 1), 7: line(350, 3) },
        beta: { 5: line(200, 1), 6: line(220, 0), 7: line(180, 1) },
        gamma: { 5: line(280, 2), 6: line(290, 2), 7: line(270, 1) },
        delta: { 5: line(0, 0), 6: line(0, 0), 7: line(0, 0) },
      }),
    );
    const qb = leaders.get('QB') ?? [];
    expect(qb.map(r => r.player.id)).toEqual(['alpha', 'gamma', 'beta']);
    expect(qb[0].passYards).toBe(900);
    expect(qb[0].passYardsPerGame).toBe(300);
    expect(qb[0].passTd).toBe(6);
    expect(qb[0].passTdPerGame).toBe(2);
    expect(qb[0].games).toBe(3);
    expect(qb[1].passYardsPerGame).toBe(280);
    // A running back never leads the QB board.
    expect(leaders.size).toBe(1);
  });

  it('ignores the in-progress week and weeks before the window', () => {
    const leaders = buildPassingLeaders(
      input(players, {
        // Week 8 is in progress, week 4 is outside the 3-week window.
        alpha: { 4: line(500, 5), 5: line(100, 0), 6: line(100, 0), 7: line(100, 0), 8: line(500, 5) },
        beta: { 5: line(200, 1), 6: line(200, 1), 7: line(200, 1) },
      }),
    );
    const qb = leaders.get('QB') ?? [];
    expect(qb[0].player.id).toBe('beta');
    expect(qb[0].passYardsPerGame).toBe(200);
    expect(qb[1].passYardsPerGame).toBe(100);
    expect(qb[1].passYards).toBe(300);
  });

  it('requires 2+ games in the window', () => {
    const leaders = buildPassingLeaders(
      input(players, {
        // One game only, however productive.
        alpha: { 7: line(400, 4) },
        beta: { 5: line(200, 1), 6: line(200, 1), 7: line(200, 1) },
        gamma: { 5: line(280, 2), 6: line(290, 2), 7: line(270, 1) },
      }),
    );
    expect(leaders.get('QB')?.map(r => r.player.id)).toEqual(['gamma', 'beta']);
  });

  it('drops players with no passing yards', () => {
    const leaders = buildPassingLeaders(
      input(players, {
        alpha: { 5: line(0, 0), 6: line(0, 0), 7: line(0, 0) },
        beta: { 5: line(200, 1), 6: line(200, 1), 7: line(200, 1) },
      }),
    );
    expect(leaders.get('QB')?.map(r => r.player.id)).toEqual(['beta']);
  });

  it('breaks per-game ties by total passing yards, then passing touchdowns', () => {
    const leaders = buildPassingLeaders(
      input(players, {
        // Alpha and Beta both 200.0/gm; Alpha's 600 total beats Beta's 400.
        alpha: { 5: line(200, 1), 6: line(200, 1), 7: line(200, 1) },
        beta: { 5: line(200, 0), 6: line(200, 2) },
        gamma: { 5: line(200, 3), 6: line(200, 3), 7: line(200, 3) },
      }),
    );
    const qb = leaders.get('QB') ?? [];
    expect(qb.map(r => r.player.id)).toEqual(['gamma', 'alpha', 'beta']);
    expect(qb[0].passYardsPerGame).toBe(200);
    expect(qb[0].passTd).toBe(9);
    expect(qb[1].passYards).toBe(600);
    expect(qb[2].passYards).toBe(400);
  });

  it('caps at 15 QBs', () => {
    const many = Array.from({ length: 17 }, (_, i) =>
      player(`qb${i}`, `Passer ${i}`, 'QB'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    many.forEach((p, i) => {
      // Even split: first 16 get 250.0/gm over 3 weeks, last gets 100.0.
      const per = i < 16 ? 250 : 100;
      usage[p.sleeperId!] = {
        5: line(per, 1),
        6: line(per, 1),
        7: line(per, 1),
      };
    });
    const leaders = buildPassingLeaders(input(many, usage));
    expect(leaders.get('QB')).toHaveLength(15);
  });
});
