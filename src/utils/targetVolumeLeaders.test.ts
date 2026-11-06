// Target Volume Leaders board (backlog item 155): per-position
// target leaders over the last 3 completed weeks, priced on
// Sleeper's free public weekly stats (rec_tgt + rec).

import { describe, it, expect } from 'vitest';
import {
  buildTargetVolumeLeaders,
  type TargetVolumeLeadersInput,
} from './targetVolumeLeaders';
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

function line(targets: number, receptions = 5): WeeklyUsageLine {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets,
    rushAtt: 10,
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
    passTd: 0, passAtt: 0, passCmp: 0, rushFd: 0, recFd: 0, ptsPpr: 0,
  };
}

function input(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
): TargetVolumeLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 8 };
}

const players = [
  player('alpha', 'Alpha Receiver', 'WR'),
  player('beta', 'Beta Receiver', 'WR'),
  player('gamma', 'Gamma Back', 'RB'),
  player('delta', 'Delta Tight End', 'TE'),
];

describe('buildTargetVolumeLeaders', () => {
  it('ranks by targets per game over the last 3 completed weeks', () => {
    const leaders = buildTargetVolumeLeaders(
      input(players, {
        alpha: { 5: line(12, 9), 6: line(9, 6), 7: line(9, 8) },
        beta: { 5: line(6, 4), 6: line(5, 3), 7: line(7, 5) },
        gamma: { 5: line(4, 3), 6: line(5, 4), 7: line(3, 2) },
        delta: { 5: line(3, 2), 6: line(2, 2), 7: line(4, 3) },
      }),
    );
    const wr = leaders.get('WR') ?? [];
    expect(wr.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(wr[0].targets).toBe(30);
    expect(wr[0].targetsPerGame).toBe(10);
    expect(wr[0].receptions).toBe(23);
    expect(wr[0].catchRate).toBe(76.7);
    expect(wr[0].games).toBe(3);
    expect(wr[1].targetsPerGame).toBe(6);
    // A back with targets still leads his own board.
    expect((leaders.get('RB') ?? []).map(r => r.player.id)).toEqual(['gamma']);
    expect((leaders.get('TE') ?? []).map(r => r.player.id)).toEqual(['delta']);
  });

  it('only counts the 3 completed weeks before the current week', () => {
    const leaders = buildTargetVolumeLeaders(
      input(players, {
        // Week 8 is in progress, week 4 is stale — only 5–7 count.
        alpha: { 4: line(20, 15), 5: line(9, 6), 6: line(9, 6), 7: line(9, 6), 8: line(20, 15) },
      }),
    );
    const wr = leaders.get('WR') ?? [];
    expect(wr).toHaveLength(1);
    expect(wr[0].targets).toBe(27);
    expect(wr[0].targetsPerGame).toBe(9);
  });

  it('requires 2+ games and drops zero-target players', () => {
    const leaders = buildTargetVolumeLeaders(
      input(players, {
        alpha: { 5: line(12, 9) },
        beta: { 5: line(0, 0), 6: line(0, 0), 7: line(0, 0) },
        gamma: { 5: line(4, 3), 6: line(5, 4), 7: line(3, 2) },
      }),
    );
    // Alpha has one game only, Beta has no targets — neither leads.
    expect(leaders.get('WR')).toBeUndefined();
    expect((leaders.get('RB') ?? []).map(r => r.player.id)).toEqual(['gamma']);
  });

  it('breaks per-game ties on total targets, then receptions', () => {
    const leaders = buildTargetVolumeLeaders(
      input(players, {
        // Both 8.0/gm over 2 games; alpha has more total targets.
        alpha: { 6: line(10, 7), 7: line(6, 4) },
        beta: { 6: line(8, 8), 7: line(8, 5) },
      }),
    );
    const wr = leaders.get('WR') ?? [];
    // Per-game and total targets tie — the receptions tie-break
    // puts beta (13) ahead of alpha (11).
    expect(wr.map(r => r.player.id)).toEqual(['beta', 'alpha']);
    expect(wr[0].targets).toBe(16);
    expect(wr[1].targets).toBe(16);
    expect(wr[0].receptions).toBe(13);
    expect(wr[1].receptions).toBe(11);
  });

  it('caps each position at 15 leaders', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      player(`wr${i}`, `Receiver ${i}`, 'WR'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    many.forEach((p, i) => {
      usage[p.sleeperId ?? ''] = {
        5: line(10 - (i % 5), 5),
        6: line(10 - (i % 5), 5),
        7: line(10 - (i % 5), 5),
      };
    });
    const leaders = buildTargetVolumeLeaders(input(many, usage));
    expect((leaders.get('WR') ?? []).length).toBe(15);
  });

  it('omits a position with no qualifying players', () => {
    const leaders = buildTargetVolumeLeaders(
      input(players, {
        alpha: { 5: line(12, 9), 6: line(9, 6), 7: line(9, 8) },
      }),
    );
    expect(leaders.get('WR')).toHaveLength(1);
    expect(leaders.get('RB')).toBeUndefined();
    expect(leaders.get('TE')).toBeUndefined();
  });
});
