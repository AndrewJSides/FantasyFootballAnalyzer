// Efficiency Leaders util (backlog item 105): per-position
// points-per-touch leaders over the last 3 completed weeks, with game
// and touch floors and the window clipped to completed weeks.

import { describe, expect, it } from 'vitest';
import {
  buildEfficiencyLeaders,
  EFFICIENCY_MIN_TOUCHES,
  MAX_EFFICIENCY_LEADERS,
} from './efficiencyLeaders';
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

function line(rushAtt: number, receptions: number): WeeklyUsageLine {
  return { offSnaps: 50, teamSnaps: 70, targets: receptions, rushAtt, receptions, rzOpps: 0, airYards: 0, deepRec: 0, longRec: 0, yac: 0, recYards: 0 };
}

const players = [
  player('alpha', 'Alpha Back', 'RB'),
  player('beta', 'Beta Back', 'RB'),
  player('gamma', 'Gamma Receiver', 'WR'),
  player('delta', 'Delta Passer', 'QB'),
];

function usageFor(ids: string[]): Record<string, Record<number, WeeklyUsageLine>> {
  // 10 touches/week for every listed id, weeks 5-7.
  const out: Record<string, Record<number, WeeklyUsageLine>> = {};
  for (const id of ids) {
    out[id] = { 5: line(6, 4), 6: line(6, 4), 7: line(6, 4) };
  }
  return out;
}

describe('buildEfficiencyLeaders', () => {
  it('ranks by points per touch over the last 3 completed weeks', () => {
    const leaders = buildEfficiencyLeaders({
      poolPlayers: players,
      pointsBySleeperId: {
        alpha: { 5: 20, 6: 20, 7: 20 },
        beta: { 5: 10, 6: 10, 7: 10 },
      },
      usageBySleeperId: usageFor(['alpha', 'beta']),
      currentWeek: 8,
    });
    const rb = leaders.get('RB')!;
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(rb[0].ptsPerTouch).toBe(2);
    expect(rb[0].touches).toBe(30);
    expect(rb[0].touchesPerGame).toBe(10);
    expect(rb[0].ptsPerGame).toBe(20);
    expect(rb[0].games).toBe(3);
    expect(rb[1].ptsPerTouch).toBe(1);
  });

  it('drops players under the games floor and under the touches floor', () => {
    const usage = usageFor(['alpha', 'beta']);
    // Beta: only one week of usage.
    usage.beta = { 7: line(6, 4) };
    // Alpha: 3 weeks but only 6 touches total (below the 15-touch floor).
    usage.alpha = { 5: line(1, 1), 6: line(1, 1), 7: line(1, 1) };
    const leaders = buildEfficiencyLeaders({
      poolPlayers: players,
      pointsBySleeperId: {
        alpha: { 5: 20, 6: 20, 7: 20 },
        beta: { 5: 10, 6: 10, 7: 10 },
      },
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    expect(leaders.get('RB')).toBeUndefined();
  });

  it('clips the window to completed weeks only', () => {
    const usage = usageFor(['alpha']);
    // A huge week 8 (in progress) and week 4 (too old) must not count.
    usage.alpha[8] = line(6, 4);
    usage.alpha[4] = line(6, 4);
    const leaders = buildEfficiencyLeaders({
      poolPlayers: players,
      pointsBySleeperId: {
        alpha: { 4: 100, 5: 20, 6: 20, 7: 20, 8: 100 },
      },
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    const rb = leaders.get('RB')!;
    expect(rb).toHaveLength(1);
    expect(rb[0].games).toBe(3);
    expect(rb[0].ptsPerTouch).toBe(2);
  });

  it('breaks points-per-touch ties by touches per game', () => {
    const usage = usageFor(['alpha', 'beta']);
    // Same 1.5 pts/touch, but Alpha touches more per game.
    usage.beta = { 5: line(3, 2), 6: line(3, 2), 7: line(3, 2) };
    const leaders = buildEfficiencyLeaders({
      poolPlayers: players,
      pointsBySleeperId: {
        alpha: { 5: 15, 6: 15, 7: 15 },
        beta: { 5: 7.5, 6: 7.5, 7: 7.5 },
      },
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    const rb = leaders.get('RB')!;
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(rb[0].ptsPerTouch).toBe(1.5);
    expect(rb[1].ptsPerTouch).toBe(1.5);
  });

  it('only ranks RB/WR/TE, never QB', () => {
    const leaders = buildEfficiencyLeaders({
      poolPlayers: players,
      pointsBySleeperId: {
        delta: { 5: 30, 6: 30, 7: 30 },
      },
      usageBySleeperId: usageFor(['delta']),
      currentWeek: 8,
    });
    expect(leaders.get('QB' as never)).toBeUndefined();
    expect(leaders.size).toBe(0);
  });

  it('caps each position at the leader limit', () => {
    const many = Array.from({ length: MAX_EFFICIENCY_LEADERS + 5 }, (_, i) =>
      player(`rb${i}`, `Back ${i}`, 'RB'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    const points: Record<string, Record<number, number>> = {};
    for (const p of many) {
      usage[p.id] = { 5: line(6, 4), 6: line(6, 4), 7: line(6, 4) };
      points[p.id] = { 5: 15, 6: 15, 7: 15 };
    }
    const leaders = buildEfficiencyLeaders({
      poolPlayers: many,
      pointsBySleeperId: points,
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    expect(leaders.get('RB')).toHaveLength(MAX_EFFICIENCY_LEADERS);
  });

  it('treats a missing points week as zero, not a dropped game', () => {
    const leaders = buildEfficiencyLeaders({
      poolPlayers: players,
      pointsBySleeperId: {
        alpha: { 5: 30, 7: 30 },
      },
      usageBySleeperId: usageFor(['alpha']),
      currentWeek: 8,
    });
    const rb = leaders.get('RB')!;
    expect(rb[0].games).toBe(3);
    expect(rb[0].ptsPerTouch).toBe(2);
    expect(rb[0].ptsPerGame).toBe(20);
  });

  it('exposes the touches floor so the page footnote can name it', () => {
    expect(EFFICIENCY_MIN_TOUCHES).toBe(15);
  });
});
