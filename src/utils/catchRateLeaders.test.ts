// Catch Rate Leaders board (backlog item 148): per-position
// catch-rate leaders over the last 3 completed weeks, priced on
// Sleeper's free public weekly stats (rec / rec_tgt).

import { describe, it, expect } from 'vitest';
import { buildCatchRateLeaders, type CatchRateLeadersInput } from './catchRateLeaders';
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

function line(targets: number, receptions: number): WeeklyUsageLine {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets,
    rushAtt: 0,
    receptions,
    rzOpps: 0,
    airYards: 0,
    deepRec: 0,
    longRec: 0, yac: 0, recYards: 0, rushYards: 0, rushTd: 0, recTd: 0, passYards: 0, passTd: 0,
  };
}

function input(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
): CatchRateLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 8 };
}

const players = [
  player('alpha', 'Alpha Back', 'RB'),
  player('beta', 'Beta Back', 'RB'),
  player('gamma', 'Gamma Receiver', 'WR'),
  player('delta', 'Delta Tight End', 'TE'),
];

describe('buildCatchRateLeaders', () => {
  it('ranks by catch rate over the last 3 completed weeks', () => {
    const leaders = buildCatchRateLeaders(
      input(players, {
        // Alpha: 18/20 = 90% over 3 games; Beta: 12/20 = 60%;
        // Gamma: 15/18 = 83.3%; Delta: 9/12 = 75% (below the
        // 10-target floor is 12, so he qualifies).
        alpha: { 5: line(7, 6), 6: line(6, 6), 7: line(7, 6) },
        beta: { 5: line(7, 4), 6: line(6, 4), 7: line(7, 4) },
        gamma: { 5: line(6, 5), 6: line(6, 5), 7: line(6, 5) },
        delta: { 5: line(4, 3), 6: line(4, 3), 7: line(4, 3) },
      }),
    );
    const rbs = leaders.get('RB') ?? [];
    expect(rbs).toHaveLength(2);
    expect(rbs[0].player.name).toBe('Alpha Back');
    expect(rbs[0].catchRate).toBeCloseTo(0.9, 4);
    expect(rbs[0].targets).toBe(20);
    expect(rbs[0].receptions).toBe(18);
    expect(rbs[0].targetsPerGame).toBeCloseTo(6.7, 1);
    expect(rbs[0].games).toBe(3);
    expect(rbs[1].player.name).toBe('Beta Back');
    expect(rbs[1].catchRate).toBeCloseTo(0.6, 4);
    const wrs = leaders.get('WR') ?? [];
    expect(wrs).toHaveLength(1);
    expect(wrs[0].catchRate).toBeCloseTo(0.8333, 4);
    const tes = leaders.get('TE') ?? [];
    expect(tes).toHaveLength(1);
    expect(tes[0].catchRate).toBeCloseTo(0.75, 4);
  });

  it('ignores weeks outside the 3-week window and the in-progress week', () => {
    const leaders = buildCatchRateLeaders(
      input(players, {
        // Week 4 (outside) is 0-for-10; week 8 (in progress) is
        // 10-for-10; weeks 5–7 are 9-for-10 each. Only 5–7 count.
        alpha: { 4: line(10, 0), 5: line(10, 9), 6: line(10, 9), 7: line(10, 9), 8: line(10, 10) },
      }),
    );
    const rbs = leaders.get('RB') ?? [];
    expect(rbs).toHaveLength(1);
    expect(rbs[0].catchRate).toBeCloseTo(0.9, 4);
    expect(rbs[0].targets).toBe(30);
    expect(rbs[0].receptions).toBe(27);
  });

  it('drops players under the 10-target floor and under 2 games', () => {
    const leaders = buildCatchRateLeaders(
      input(players, {
        // Alpha: 2-for-2 in one week only — perfect rate, but 1 game
        // and 2 targets, so he never leads.
        alpha: { 7: line(2, 2) },
        // Beta: 9 targets over 3 games — under the floor.
        beta: { 5: line(3, 3), 6: line(3, 3), 7: line(3, 3) },
        // Gamma: 10 targets, 10 receptions — qualifies.
        gamma: { 5: line(4, 4), 6: line(3, 3), 7: line(3, 3) },
      }),
    );
    expect(leaders.get('RB')).toBeUndefined();
    const wrs = leaders.get('WR') ?? [];
    expect(wrs).toHaveLength(1);
    expect(wrs[0].catchRate).toBe(1);
  });

  it('breaks catch-rate ties by targets, then receptions', () => {
    const leaders = buildCatchRateLeaders(
      input(players, {
        // Both 80%, but Alpha saw 20 targets to Beta's 10.
        alpha: { 5: line(7, 6), 6: line(6, 5), 7: line(7, 5) },
        beta: { 5: line(4, 3), 6: line(3, 3), 7: line(3, 2) },
      }),
    );
    const rbs = leaders.get('RB') ?? [];
    expect(rbs).toHaveLength(2);
    expect(rbs[0].player.name).toBe('Alpha Back');
    expect(rbs[1].player.name).toBe('Beta Back');
  });

  it('caps each position at 15 leaders', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      player(`p${i}`, `Player ${i}`, 'WR'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    many.forEach((p, i) => {
      // Total receptions descend from 30 to 11 over 30 targets, so
      // catch rates descend from 100% to 36.7% and the cut is exact.
      const total = 30 - i;
      const perWeek = Math.floor(total / 3);
      usage[p.id] = {
        5: line(10, perWeek),
        6: line(10, perWeek),
        7: line(10, total - 2 * perWeek),
      };
    });
    const leaders = buildCatchRateLeaders(input(many, usage));
    expect(leaders.get('WR')).toHaveLength(15);
  });

  it('skips players with no Sleeper id', () => {
    const noId = player('noid', 'No Id', 'RB');
    delete (noId as Partial<PoolPlayer>).sleeperId;
    const leaders = buildCatchRateLeaders(
      input([noId], { noid: { 5: line(10, 10), 6: line(10, 10), 7: line(10, 10) } }),
    );
    expect(leaders.get('RB')).toBeUndefined();
  });
});
