// Yards Per Target Leaders board (backlog item 160): per-position
// yards-per-target leaders over the last 3 completed weeks, priced on
// Sleeper's free public weekly stats (rec_yd / rec_tgt, via the
// shared weekly-usage fetch).

import { describe, it, expect } from 'vitest';
import {
  buildYardsPerTargetLeaders,
  type YptLeadersInput,
} from './yardsPerTargetLeaders';
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

function line(recYards: number, targets: number, receptions = 5): WeeklyUsageLine {
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
    rushYards: 0,
    rushTd: 0,
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
): YptLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 10 };
}

const players = [
  player('alpha', 'Alpha Receiver', 'WR'),
  player('beta', 'Beta Receiver', 'WR'),
  player('gamma', 'Gamma Back', 'RB'),
  player('delta', 'Delta Tight End', 'TE'),
];

describe('buildYardsPerTargetLeaders', () => {
  it('ranks by yards per target over the last 3 completed weeks', () => {
    const leaders = buildYardsPerTargetLeaders(
      input(players, {
        // Alpha: 300 yd / 30 tgt = 10.0; Beta: 180 / 30 = 6.0;
        // Gamma: 120 / 12 = 10.0 (RB tab); Delta: 90 / 15 = 6.0.
        alpha: { 7: line(100, 10), 8: line(100, 10), 9: line(100, 10) },
        beta: { 7: line(60, 10), 8: line(60, 10), 9: line(60, 10) },
        gamma: { 7: line(40, 4), 8: line(40, 4), 9: line(40, 4) },
        delta: { 7: line(30, 5), 8: line(30, 5), 9: line(30, 5) },
      }),
    );
    const wr = leaders.get('WR') ?? [];
    expect(wr.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(wr[0].ypt).toBe(10);
    expect(wr[0].recYards).toBe(300);
    expect(wr[0].targets).toBe(30);
    expect(wr[0].games).toBe(3);
    expect(wr[0].recYardsPerGame).toBe(100);
    expect((leaders.get('RB') ?? []).map(r => r.player.id)).toEqual(['gamma']);
    expect((leaders.get('TE') ?? []).map(r => r.player.id)).toEqual(['delta']);
  });

  it('ignores weeks outside the 3-week window and the in-progress week', () => {
    const leaders = buildYardsPerTargetLeaders(
      input(players, {
        // Only weeks 7–9 count: 150 yd / 15 tgt = 10.0. Week 6's
        // 200 yards and week 10's (in-progress) 200 yards are out.
        alpha: {
          6: line(200, 20),
          7: line(50, 5),
          8: line(50, 5),
          9: line(50, 5),
          10: line(200, 20),
        },
      }),
    );
    const wr = leaders.get('WR') ?? [];
    expect(wr).toHaveLength(1);
    expect(wr[0].ypt).toBe(10);
    expect(wr[0].recYards).toBe(150);
  });

  it('requires 2+ games and 10+ targets', () => {
    const leaders = buildYardsPerTargetLeaders(
      input(players, {
        // Alpha: 1 game only (9-for-90 spot start). Beta: 3 games
        // but 9 targets total. Neither qualifies.
        alpha: { 9: line(90, 9, 9) },
        beta: { 7: line(30, 3), 8: line(30, 3), 9: line(30, 3) },
      }),
    );
    expect(leaders.get('WR')).toBeUndefined();
  });

  it('excludes players with no receiving yards', () => {
    const leaders = buildYardsPerTargetLeaders(
      input(players, {
        alpha: { 7: line(0, 10, 0), 8: line(0, 10, 0), 9: line(0, 10, 0) },
      }),
    );
    expect(leaders.get('WR')).toBeUndefined();
  });

  it('breaks YPT ties by receiving yards, then targets', () => {
    const leaders = buildYardsPerTargetLeaders(
      input(players, {
        // Both 10.0 YPT; Alpha has more yards (300 vs 200).
        alpha: { 7: line(100, 10), 8: line(100, 10), 9: line(100, 10) },
        beta: { 7: line(80, 8), 8: line(60, 6), 9: line(60, 6) },
      }),
    );
    expect((leaders.get('WR') ?? []).map(r => r.player.id)).toEqual([
      'alpha',
      'beta',
    ]);
  });

  it('caps each position at 15 leaders', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      player(`wr${i}`, `Receiver ${i}`, 'WR'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    many.forEach((p, i) => {
      // YPT descends with i so the top 15 are wr0..wr14.
      usage[p.id] = {
        7: line(200 - i * 5, 20),
        8: line(200 - i * 5, 20),
        9: line(200 - i * 5, 20),
      };
    });
    const leaders = buildYardsPerTargetLeaders(input(many, usage));
    const wr = leaders.get('WR') ?? [];
    expect(wr).toHaveLength(15);
    expect(wr[0].player.id).toBe('wr0');
    expect(wr[14].player.id).toBe('wr14');
  });

  it('omits positions with no leaders', () => {
    const leaders = buildYardsPerTargetLeaders(input(players, {}));
    expect(leaders.size).toBe(0);
  });
});
