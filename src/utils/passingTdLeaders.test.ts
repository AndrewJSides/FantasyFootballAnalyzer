// Passing Touchdowns Leaders board (backlog item 164): quarterback
// passing-touchdown leaders over the last 3 completed weeks, priced
// on Sleeper's free public weekly stats (pass_td + pass_yd).

import { describe, it, expect } from 'vitest';
import { buildPassingTdLeaders, type PassingTdLeadersInput } from './passingTdLeaders';
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
): PassingTdLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 8 };
}

const players = [
  player('alpha', 'Alpha Passer', 'QB'),
  player('beta', 'Beta Passer', 'QB'),
  player('gamma', 'Gamma Passer', 'QB'),
  player('delta', 'Delta Back', 'RB'),
];

describe('buildPassingTdLeaders', () => {
  it('ranks QBs by passing touchdowns per game over the last 3 completed weeks', () => {
    const leaders = buildPassingTdLeaders(
      input(players, {
        // Alpha throws the most TDs but the fewest yards — the scoring
        // read outranks the yardage read on this board.
        alpha: { 5: line(200, 3), 6: line(210, 2), 7: line(190, 3) },
        beta: { 5: line(350, 1), 6: line(330, 1), 7: line(340, 1) },
        gamma: { 5: line(280, 2), 6: line(290, 1), 7: line(270, 2) },
        delta: { 5: line(0, 0), 6: line(0, 0), 7: line(0, 0) },
      }),
    );
    const qb = leaders.get('QB') ?? [];
    expect(qb.map(r => r.player.id)).toEqual(['alpha', 'gamma', 'beta']);
    expect(qb[0].passTd).toBe(8);
    expect(qb[0].passTdPerGame).toBe(2.7);
    expect(qb[0].passYards).toBe(600);
    expect(qb[0].passYardsPerGame).toBe(200);
    expect(qb[0].games).toBe(3);
    expect(qb[1].passTdPerGame).toBe(1.7);
    // A running back never leads the QB board.
    expect(leaders.size).toBe(1);
  });

  it('ignores the in-progress week and weeks before the window', () => {
    const leaders = buildPassingTdLeaders(
      input(players, {
        // Week 8 is in progress, week 4 is outside the 3-week window.
        alpha: { 4: line(500, 5), 5: line(100, 0), 6: line(100, 0), 7: line(100, 1), 8: line(500, 5) },
        beta: { 5: line(200, 1), 6: line(200, 1), 7: line(200, 1) },
      }),
    );
    const qb = leaders.get('QB') ?? [];
    expect(qb[0].player.id).toBe('beta');
    expect(qb[0].passTdPerGame).toBe(1);
    expect(qb[1].passTdPerGame).toBe(0.3);
    expect(qb[1].passTd).toBe(1);
  });

  it('requires 2+ games in the window', () => {
    const leaders = buildPassingTdLeaders(
      input(players, {
        // One game only, however productive.
        alpha: { 7: line(400, 4) },
        beta: { 5: line(200, 1), 6: line(200, 1), 7: line(200, 1) },
        gamma: { 5: line(280, 2), 6: line(290, 2), 7: line(270, 1) },
      }),
    );
    expect(leaders.get('QB')?.map(r => r.player.id)).toEqual(['gamma', 'beta']);
  });

  it('drops players with no passing touchdowns', () => {
    const leaders = buildPassingTdLeaders(
      input(players, {
        alpha: { 5: line(300, 0), 6: line(300, 0), 7: line(300, 0) },
        beta: { 5: line(200, 1), 6: line(200, 1), 7: line(200, 1) },
      }),
    );
    expect(leaders.get('QB')?.map(r => r.player.id)).toEqual(['beta']);
  });

  it('breaks per-game ties by total passing touchdowns, then passing yards', () => {
    const leaders = buildPassingTdLeaders(
      input(players, {
        // Alpha and Beta both 1.0/gm; Alpha's 3 total beats Beta's 2.
        alpha: { 5: line(200, 1), 6: line(200, 1), 7: line(200, 1) },
        beta: { 5: line(300, 1), 6: line(300, 1) },
        // Gamma ties Alpha on 1.0/gm and 3 total, but throws more yards.
        gamma: { 5: line(400, 1), 6: line(400, 1), 7: line(400, 1) },
      }),
    );
    const qb = leaders.get('QB') ?? [];
    expect(qb.map(r => r.player.id)).toEqual(['gamma', 'alpha', 'beta']);
    expect(qb[0].passTdPerGame).toBe(1);
    expect(qb[0].passTd).toBe(3);
    expect(qb[0].passYards).toBe(1200);
    expect(qb[1].passTd).toBe(3);
    expect(qb[1].passYards).toBe(600);
    expect(qb[2].passTd).toBe(2);
  });

  it('caps at 15 QBs', () => {
    const many = Array.from({ length: 17 }, (_, i) =>
      player(`qb${i}`, `Passer ${i}`, 'QB'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    many.forEach((p, i) => {
      // Even split: first 16 get 2.0/gm over 3 weeks, last gets 1.0.
      const per = i < 16 ? 2 : 1;
      usage[p.sleeperId!] = {
        5: line(250, per),
        6: line(250, per),
        7: line(250, per),
      };
    });
    const leaders = buildPassingTdLeaders(input(many, usage));
    expect(leaders.get('QB')).toHaveLength(15);
  });
});
