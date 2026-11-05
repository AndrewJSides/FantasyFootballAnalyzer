// Snap Leaders util (backlog item 104): per-position snap-share leaders
// over the last 3 completed weeks, ranked by snap share, with target
// shares and touches per game.

import { describe, expect, it } from 'vitest';
import {
  buildSnapLeaders,
  MAX_SNAP_LEADERS,
} from './snapLeaders';
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

function line(
  offSnaps: number,
  teamSnaps: number,
  targets = 0,
  rushAtt = 0,
  receptions = 0,
): WeeklyUsageLine {
  return { offSnaps, teamSnaps, targets, rushAtt, receptions, rzOpps: 0, airYards: 0, deepRec: 0, longRec: 0, yac: 0, recYards: 0 };
}

const players = [
  player('alpha', 'Alpha Back', 'RB'),
  player('beta', 'Beta Back', 'RB'),
  player('gamma', 'Gamma Receiver', 'WR'),
  player('delta', 'Delta Tight', 'TE'),
];

describe('buildSnapLeaders', () => {
  it('ranks by snap share over the last 3 completed weeks', () => {
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {
      // 3 weeks: Alpha 70/70 each week = 100% share; Beta 35/70 = 50%.
      alpha: { 5: line(70, 70, 4), 6: line(70, 70, 4), 7: line(70, 70, 4) },
      beta: { 5: line(35, 70, 2), 6: line(35, 70, 2), 7: line(35, 70, 2) },
    };
    const leaders = buildSnapLeaders({
      poolPlayers: players,
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    const rb = leaders.get('RB')!;
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(rb[0].snapShare).toBe(1);
    expect(rb[1].snapShare).toBe(0.5);
    expect(rb[0].games).toBe(3);
  });

  it('prices target share against the player\'s own NFL team targets', () => {
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {
      // Gamma: 9 targets/week; team total 9 (Gamma) + 21 (Alpha, RB) = 30.
      alpha: { 5: line(70, 70, 21), 6: line(70, 70, 21), 7: line(70, 70, 21) },
      gamma: { 5: line(60, 70, 9), 6: line(60, 70, 9), 7: line(60, 70, 9) },
    };
    const leaders = buildSnapLeaders({
      poolPlayers: players,
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    const wr = leaders.get('WR')!;
    expect(wr).toHaveLength(1);
    expect(wr[0].targetShare).toBe(0.3);
    expect(wr[0].touchesPerGame).toBe(0);
  });

  it('requires 2+ games and stays inside the 3-week window', () => {
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {
      // Alpha: only week 7 (one game) — excluded.
      alpha: { 7: line(70, 70) },
      // Beta: weeks 4-7 — week 4 is outside the window, weeks 5-7 count.
      beta: {
        4: line(70, 70),
        5: line(35, 70, 0, 5, 2),
        6: line(35, 70, 0, 5, 2),
        7: line(35, 70, 0, 5, 2),
      },
    };
    const leaders = buildSnapLeaders({
      poolPlayers: players,
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    const rb = leaders.get('RB')!;
    expect(rb.map(r => r.player.id)).toEqual(['beta']);
    expect(rb[0].games).toBe(3);
    expect(rb[0].touchesPerGame).toBe(7);
  });

  it('breaks snap-share ties by touches per game', () => {
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {
      alpha: { 5: line(70, 70), 6: line(70, 70), 7: line(70, 70) },
      // Same 100% share as Alpha, more touches.
      beta: {
        5: line(70, 70, 0, 15, 5),
        6: line(70, 70, 0, 15, 5),
        7: line(70, 70, 0, 15, 5),
      },
    };
    const leaders = buildSnapLeaders({
      poolPlayers: players,
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    const rb = leaders.get('RB')!;
    expect(rb.map(r => r.player.id)).toEqual(['beta', 'alpha']);
  });

  it('caps each position at 15 leaders and omits empty positions', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      player(`rb${i}`, `Back ${i}`, 'RB'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    for (let i = 0; i < 20; i++) {
      usage[`rb${i}`] = {
        5: line(70 - i, 70),
        6: line(70 - i, 70),
        7: line(70 - i, 70),
      };
    }
    const leaders = buildSnapLeaders({
      poolPlayers: many,
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    expect(leaders.get('RB')).toHaveLength(MAX_SNAP_LEADERS);
    // No WR/TE data — positions stay absent.
    expect(leaders.has('WR')).toBe(false);
    expect(leaders.has('TE')).toBe(false);
  });

  it('leaves target share null without team data', () => {
    const noTeam = player('x', 'X Back', 'RB', '');
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {
      x: { 5: line(70, 70), 6: line(70, 70), 7: line(70, 70) },
    };
    const leaders = buildSnapLeaders({
      poolPlayers: [noTeam],
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    const rb = leaders.get('RB')!;
    expect(rb[0].targetShare).toBeNull();
  });
});
