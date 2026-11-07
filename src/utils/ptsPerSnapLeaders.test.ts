// Points Per Snap Leaders board (backlog item 189): per-position
// full-PPR-points-per-offensive-snap leaders over the last 3 completed
// weeks, priced on Sleeper's free public weekly stats (pts_ppr over
// off_snp).

import { describe, it, expect } from 'vitest';
import { buildPtsPerSnapLeaders, type PtsPerSnapLeadersInput } from './ptsPerSnapLeaders';
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

function line(ptsPpr: number, offSnaps = 50): WeeklyUsageLine {
  return {
    offSnaps,
    teamSnaps: 70,
    targets: 8,
    rushAtt: 0,
    receptions: 5,
    rzOpps: 0,
    airYards: 0,
    deepRec: 0,
    longRec: 0,
    yac: 0,
    recYards: 0,
    rushYards: 0, rushTd: 0, recTd: 0, passYards: 0, passTd: 0, passAtt: 0, passCmp: 0, rushFd: 0, recFd: 0, ptsPpr,
  };
}

function input(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
): PtsPerSnapLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 8 };
}

const players = [
  player('alpha', 'Alpha Back', 'RB'),
  player('beta', 'Beta Back', 'RB'),
  player('gamma', 'Gamma Receiver', 'WR'),
  player('delta', 'Delta Tight End', 'TE'),
];

describe('buildPtsPerSnapLeaders', () => {
  it('ranks by points per snap over the last 3 completed weeks', () => {
    const leaders = buildPtsPerSnapLeaders(
      input(players, {
        // Alpha: 45 points on 150 snaps (0.30 per snap, 15.0 per game).
        alpha: { 5: line(15), 6: line(15), 7: line(15) },
        // Beta: 30 points on 150 snaps (0.20 per snap).
        beta: { 5: line(10), 6: line(10), 7: line(10) },
        // Gamma: 36 points on 90 snaps (0.40 per snap).
        gamma: { 5: line(12, 30), 6: line(12, 30), 7: line(12, 30) },
        delta: { 5: line(0), 6: line(0), 7: line(0) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(rb[0].ptsPerSnap).toBe(0.3);
    expect(rb[0].points).toBe(45);
    expect(rb[0].snaps).toBe(150);
    expect(rb[0].ptsPerGame).toBe(15);
    expect(rb[0].games).toBe(3);
    expect(rb[1].ptsPerSnap).toBe(0.2);
    expect(leaders.get('WR')?.[0].player.id).toBe('gamma');
    expect(leaders.get('WR')?.[0].ptsPerSnap).toBe(0.4);
    expect(leaders.get('TE')).toBeUndefined();
  });

  it('ignores the in-progress week and weeks before the window', () => {
    const leaders = buildPtsPerSnapLeaders(
      input(players, {
        // Week 8 is in progress, week 4 is outside the 3-week window.
        alpha: { 4: line(100, 50), 5: line(5), 6: line(5), 7: line(5), 8: line(100, 50) },
        beta: { 5: line(10), 6: line(10), 7: line(10) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb[0].player.id).toBe('beta');
    expect(rb[0].ptsPerSnap).toBe(0.2);
    expect(rb[1].ptsPerSnap).toBe(0.1);
  });

  it('requires 2+ games and 20+ snaps in the window', () => {
    const leaders = buildPtsPerSnapLeaders(
      input(players, {
        // One game only, however efficient.
        alpha: { 7: line(25, 25) },
        // Three games but only 15 snaps — the one-snap fluke guard.
        beta: { 5: line(5, 5), 6: line(5, 5), 7: line(5, 5) },
        // Three games, exactly 20 snaps — the floor is inclusive.
        gamma: { 5: line(4, 7), 6: line(4, 7), 7: line(4, 6) },
      }),
    );
    expect(leaders.get('RB')).toBeUndefined();
    const wr = leaders.get('WR') ?? [];
    expect(wr).toHaveLength(1);
    expect(wr[0].player.id).toBe('gamma');
    expect(wr[0].ptsPerSnap).toBe(0.6);
  });

  it('drops players with snaps but no points', () => {
    const leaders = buildPtsPerSnapLeaders(
      input(players, {
        alpha: { 5: line(0), 6: line(0), 7: line(0) },
        beta: { 5: line(10), 6: line(10), 7: line(10) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb).toHaveLength(1);
    expect(rb[0].player.id).toBe('beta');
  });

  it('breaks pts-per-snap ties by points per game, then snaps', () => {
    const leaders = buildPtsPerSnapLeaders(
      input(players, {
        // Both 0.20 per snap; Alpha scores more per game.
        alpha: { 5: line(12, 60), 6: line(12, 60), 7: line(12, 60) },
        beta: { 5: line(6, 30), 6: line(6, 30), 7: line(6, 30) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(rb[0].ptsPerGame).toBe(12);
    expect(rb[1].ptsPerGame).toBe(6);
  });

  it('caps each position at 15 leaders', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      player(`rb${i}`, `Back ${i}`, 'RB'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    many.forEach((p, i) => {
      usage[p.sleeperId!] = { 5: line(30 - i), 6: line(30 - i), 7: line(30 - i) };
    });
    const leaders = buildPtsPerSnapLeaders(input(many, usage));
    expect(leaders.get('RB')).toHaveLength(15);
  });
});
