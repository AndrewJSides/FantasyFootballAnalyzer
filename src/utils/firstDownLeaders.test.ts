// First Downs Leaders board (backlog item 156): per-position
// first-down leaders over the last 3 completed weeks, priced on
// Sleeper's free public weekly stats (rush_fd + rec_fd).

import { describe, it, expect } from 'vitest';
import {
  buildFirstDownLeaders,
  type FirstDownLeadersInput,
} from './firstDownLeaders';
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

function line(rushFd: number, recFd: number): WeeklyUsageLine {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets: 0,
    rushAtt: 10,
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
    passYards: 0,
    passTd: 0,
    passAtt: 0,
    passCmp: 0,
    rushFd,
    recFd,
    ptsPpr: 0,
  };
}

function input(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
): FirstDownLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 8 };
}

const players = [
  player('alpha', 'Alpha Back', 'RB'),
  player('beta', 'Beta Back', 'RB'),
  player('gamma', 'Gamma Receiver', 'WR'),
  player('delta', 'Delta Tight End', 'TE'),
];

describe('buildFirstDownLeaders', () => {
  it('ranks by first downs per game over the last 3 completed weeks', () => {
    const leaders = buildFirstDownLeaders(
      input(players, {
        alpha: { 5: line(4, 2), 6: line(3, 2), 7: line(5, 1) },
        beta: { 5: line(2, 1), 6: line(2, 0), 7: line(1, 1) },
        gamma: { 5: line(0, 5), 6: line(0, 4), 7: line(1, 4) },
        delta: { 5: line(0, 2), 6: line(0, 1), 7: line(0, 2) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(rb[0].firstDowns).toBe(17);
    expect(rb[0].firstDownsPerGame).toBe(5.7);
    expect(rb[0].rushFd).toBe(12);
    expect(rb[0].recFd).toBe(5);
    expect(rb[0].games).toBe(3);
    expect(rb[1].firstDownsPerGame).toBe(2.3);
    // A receiver with only receiving first downs still leads his own board.
    expect((leaders.get('WR') ?? []).map(r => r.player.id)).toEqual(['gamma']);
    expect((leaders.get('WR') ?? [])[0].firstDowns).toBe(14);
    expect((leaders.get('WR') ?? [])[0].rushFd).toBe(1);
    expect((leaders.get('TE') ?? []).map(r => r.player.id)).toEqual(['delta']);
  });

  it('only counts the 3 completed weeks before the current week', () => {
    const leaders = buildFirstDownLeaders(
      input(players, {
        // Week 8 is in progress, week 4 is stale — only 5–7 count.
        alpha: { 4: line(9, 9), 5: line(3, 2), 6: line(3, 2), 7: line(3, 1), 8: line(9, 9) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb).toHaveLength(1);
    expect(rb[0].firstDowns).toBe(14);
    expect(rb[0].firstDownsPerGame).toBe(4.7);
  });

  it('requires 2+ games and drops zero-first-down players', () => {
    const leaders = buildFirstDownLeaders(
      input(players, {
        alpha: { 5: line(4, 2) },
        beta: { 5: line(0, 0), 6: line(0, 0), 7: line(0, 0) },
        gamma: { 5: line(0, 5), 6: line(0, 4), 7: line(1, 4) },
      }),
    );
    // Alpha has one game only, Beta has no first downs — neither leads.
    expect(leaders.get('RB')).toBeUndefined();
    expect((leaders.get('WR') ?? []).map(r => r.player.id)).toEqual(['gamma']);
  });

  it('breaks per-game ties on total first downs, then rushing first downs', () => {
    const leaders = buildFirstDownLeaders(
      input(players, {
        // Both 4.0/gm over 2 games; alpha has more total first downs.
        alpha: { 6: line(3, 2), 7: line(2, 1) },
        beta: { 6: line(1, 3), 7: line(1, 3) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    // Per-game and total tie — the rushing-FD tie-break puts alpha
    // (5 rush FD) ahead of beta (2 rush FD).
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(rb[0].firstDowns).toBe(8);
    expect(rb[1].firstDowns).toBe(8);
    expect(rb[0].rushFd).toBe(5);
    expect(rb[1].rushFd).toBe(2);
  });

  it('caps each position at 15 leaders', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      player(`rb${i}`, `Back ${i}`, 'RB'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    many.forEach((p, i) => {
      usage[p.sleeperId ?? ''] = {
        5: line(5 - (i % 5), 1),
        6: line(5 - (i % 5), 1),
        7: line(5 - (i % 5), 1),
      };
    });
    const leaders = buildFirstDownLeaders(input(many, usage));
    expect((leaders.get('RB') ?? []).length).toBe(15);
  });

  it('omits a position with no qualifying players', () => {
    const leaders = buildFirstDownLeaders(
      input(players, {
        alpha: { 5: line(4, 2), 6: line(3, 2), 7: line(5, 1) },
      }),
    );
    expect(leaders.get('RB')).toHaveLength(1);
    expect(leaders.get('WR')).toBeUndefined();
    expect(leaders.get('TE')).toBeUndefined();
  });
});
