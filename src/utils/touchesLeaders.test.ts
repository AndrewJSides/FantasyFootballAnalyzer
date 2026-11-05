// Touches Leaders board (backlog item 157): per-position
// touches leaders over the last 3 completed weeks, priced on
// Sleeper's free public weekly stats (rush_att + rec).

import { describe, it, expect } from 'vitest';
import {
  buildTouchesLeaders,
  type TouchesLeadersInput,
} from './touchesLeaders';
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
    rushFd: 0,
    recFd: 0,
  };
}

function input(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
): TouchesLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 8 };
}

const players = [
  player('alpha', 'Alpha Back', 'RB'),
  player('beta', 'Beta Back', 'RB'),
  player('gamma', 'Gamma Receiver', 'WR'),
  player('delta', 'Delta Tight End', 'TE'),
];

describe('buildTouchesLeaders', () => {
  it('ranks by touches per game over the last 3 completed weeks', () => {
    const leaders = buildTouchesLeaders(
      input(players, {
        alpha: { 5: line(15, 4), 6: line(18, 3), 7: line(14, 5) },
        beta: { 5: line(8, 1), 6: line(9, 0), 7: line(7, 2) },
        gamma: { 5: line(1, 8), 6: line(0, 7), 7: line(2, 9) },
        delta: { 5: line(0, 4), 6: line(0, 3), 7: line(0, 5) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(rb[0].touches).toBe(59);
    expect(rb[0].touchesPerGame).toBe(19.7);
    expect(rb[0].rushAtt).toBe(47);
    expect(rb[0].receptions).toBe(12);
    expect(rb[0].games).toBe(3);
    expect(rb[1].touchesPerGame).toBe(9);
    // A receiver with mostly receptions still leads his own board.
    expect((leaders.get('WR') ?? []).map(r => r.player.id)).toEqual(['gamma']);
    expect((leaders.get('WR') ?? [])[0].touches).toBe(27);
    expect((leaders.get('WR') ?? [])[0].rushAtt).toBe(3);
    expect((leaders.get('TE') ?? []).map(r => r.player.id)).toEqual(['delta']);
  });

  it('only counts the 3 completed weeks before the current week', () => {
    const leaders = buildTouchesLeaders(
      input(players, {
        // Week 8 is in progress, week 4 is stale — only 5–7 count.
        alpha: { 4: line(30, 10), 5: line(15, 4), 6: line(18, 3), 7: line(14, 5), 8: line(30, 10) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb).toHaveLength(1);
    expect(rb[0].touches).toBe(59);
    expect(rb[0].touchesPerGame).toBe(19.7);
  });

  it('requires 2+ games and drops zero-touch players', () => {
    const leaders = buildTouchesLeaders(
      input(players, {
        alpha: { 5: line(15, 4) },
        beta: { 5: line(0, 0), 6: line(0, 0), 7: line(0, 0) },
        gamma: { 5: line(1, 8), 6: line(0, 7), 7: line(2, 9) },
      }),
    );
    // Alpha has one game only, Beta has no touches — neither leads.
    expect(leaders.get('RB')).toBeUndefined();
    expect((leaders.get('WR') ?? []).map(r => r.player.id)).toEqual(['gamma']);
  });

  it('breaks per-game ties on total touches, then rushing attempts', () => {
    const leaders = buildTouchesLeaders(
      input(players, {
        // Both 10.0/gm over 2 games; alpha has more total touches.
        alpha: { 6: line(8, 3), 7: line(7, 2) },
        beta: { 6: line(5, 5), 7: line(5, 5) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    // Per-game and total tie — the rushing-attempts tie-break puts
    // alpha (15 rush att) ahead of beta (10 rush att).
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(rb[0].touches).toBe(20);
    expect(rb[1].touches).toBe(20);
    expect(rb[0].rushAtt).toBe(15);
    expect(rb[1].rushAtt).toBe(10);
  });

  it('caps each position at 15 leaders', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      player(`rb${i}`, `Back ${i}`, 'RB'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    many.forEach((p, i) => {
      usage[p.sleeperId ?? ''] = {
        5: line(15 - (i % 5), 2),
        6: line(15 - (i % 5), 2),
        7: line(15 - (i % 5), 2),
      };
    });
    const leaders = buildTouchesLeaders(input(many, usage));
    expect((leaders.get('RB') ?? []).length).toBe(15);
  });

  it('omits a position with no qualifying players', () => {
    const leaders = buildTouchesLeaders(
      input(players, {
        alpha: { 5: line(15, 4), 6: line(18, 3), 7: line(14, 5) },
      }),
    );
    expect(leaders.get('RB')).toHaveLength(1);
    expect(leaders.get('WR')).toBeUndefined();
    expect(leaders.get('TE')).toBeUndefined();
  });
});
