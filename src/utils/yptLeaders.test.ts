// YPT Leaders board (backlog item 188): per-position yards-per-
// target leaders over the last 3 completed weeks, priced on
// Sleeper's free public weekly stats (rec_yd over rec_tgt).

import { describe, it, expect } from 'vitest';
import { buildYptLeaders, type YptLeadersInput } from './yptLeaders';
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

function line(recYards: number, targets = 8, receptions = 5): WeeklyUsageLine {
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
    rushYards: 0, rushTd: 0, recTd: 0, passYards: 0, passTd: 0, passAtt: 0, passCmp: 0, rushFd: 0, recFd: 0, ptsPpr: 0,
  };
}

function input(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
): YptLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 8 };
}

const players = [
  player('alpha', 'Alpha Back', 'RB'),
  player('beta', 'Beta Back', 'RB'),
  player('gamma', 'Gamma Receiver', 'WR'),
  player('delta', 'Delta Tight End', 'TE'),
];

describe('buildYptLeaders', () => {
  it('ranks by yards per target over the last 3 completed weeks', () => {
    const leaders = buildYptLeaders(
      input(players, {
        // Alpha: 300 yards on 24 targets (12.5 YPT, 15 rec = 63% catch).
        alpha: { 5: line(100, 8, 5), 6: line(60, 8, 5), 7: line(140, 8, 5) },
        // Beta: 180 yards on 24 targets (7.5 YPT).
        beta: { 5: line(60, 8, 5), 6: line(60, 8, 5), 7: line(60, 8, 5) },
        // Gamma: 270 yards on 24 targets (11.3 YPT after round1).
        gamma: { 5: line(90, 8, 5), 6: line(90, 8, 5), 7: line(90, 8, 5) },
        delta: { 5: line(0, 8, 0), 6: line(0, 8, 0), 7: line(0, 8, 0) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(rb[0].ypt).toBe(12.5);
    expect(rb[0].recYards).toBe(300);
    expect(rb[0].targets).toBe(24);
    expect(rb[0].receptions).toBe(15);
    expect(rb[0].catchRate).toBeCloseTo(15 / 24);
    expect(rb[0].games).toBe(3);
    expect(rb[1].ypt).toBe(7.5);
    expect(leaders.get('WR')?.[0].player.id).toBe('gamma');
    expect(leaders.get('WR')?.[0].ypt).toBe(11.3);
    expect(leaders.get('TE')).toBeUndefined();
  });

  it('ignores the in-progress week and weeks before the window', () => {
    const leaders = buildYptLeaders(
      input(players, {
        // Week 8 is in progress, week 4 is outside the 3-week window.
        alpha: { 4: line(500, 20, 10), 5: line(50, 8, 5), 6: line(50, 8, 5), 7: line(50, 8, 5), 8: line(500, 20, 10) },
        beta: { 5: line(60, 8, 5), 6: line(60, 8, 5), 7: line(60, 8, 5) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb[0].player.id).toBe('beta');
    expect(rb[0].ypt).toBe(7.5);
    expect(rb[1].ypt).toBe(6.3);
  });

  it('requires 2+ games and 10+ targets in the window', () => {
    const leaders = buildYptLeaders(
      input(players, {
        // One game only, however efficient.
        alpha: { 7: line(100, 12, 5) },
        // Three games but only 9 targets — the 1-for-40 fluke guard.
        beta: { 5: line(60, 3, 2), 6: line(60, 3, 2), 7: line(60, 3, 2) },
        // Three games, exactly 10 targets — the floor is inclusive.
        gamma: { 5: line(40, 4, 3), 6: line(40, 3, 2), 7: line(40, 3, 2) },
      }),
    );
    expect(leaders.get('RB')).toBeUndefined();
    const wr = leaders.get('WR') ?? [];
    expect(wr).toHaveLength(1);
    expect(wr[0].player.id).toBe('gamma');
    expect(wr[0].ypt).toBe(12);
  });

  it('drops players with targets but no receiving yards', () => {
    const leaders = buildYptLeaders(
      input(players, {
        alpha: { 5: line(0, 12, 0), 6: line(0, 12, 0), 7: line(0, 12, 0) },
        beta: { 5: line(60, 8, 5), 6: line(60, 8, 5), 7: line(60, 8, 5) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.id)).toEqual(['beta']);
  });

  it('breaks YPT ties by receiving yards, then targets', () => {
    const leaders = buildYptLeaders(
      input(players, {
        // Same 10.0 YPT: alpha has more yards, beta more targets.
        alpha: { 5: line(100, 10, 6), 6: line(100, 10, 6), 7: line(100, 10, 6) },
        beta: { 5: line(80, 8, 5), 6: line(80, 8, 5), 7: line(80, 8, 5) },
        // Same YPT and yards as beta, fewer targets — ranks last.
        gamma: { 5: line(80, 8, 5), 6: line(80, 8, 5), 7: line(80, 8, 5) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(rb[0].ypt).toBe(10);
    expect(rb[1].ypt).toBe(10);
  });

  it('caps each position at 15 leaders', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      player(`rb${i}`, `Back ${i}`, 'RB'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    many.forEach((p, i) => {
      // Declining YPT so the cap keeps the top 15.
      usage[p.sleeperId ?? ''] = {
        5: line(200 - i * 5, 10, 6),
        6: line(200 - i * 5, 10, 6),
        7: line(200 - i * 5, 10, 6),
      };
    });
    const leaders = buildYptLeaders(input(many, usage));
    const rb = leaders.get('RB') ?? [];
    expect(rb).toHaveLength(15);
    expect(rb[0].player.id).toBe('rb0');
    expect(rb[14].player.id).toBe('rb14');
  });
});
