// Red Zone Leaders board (backlog item 145): per-position red-zone
// opportunity leaders over the last 3 completed weeks, priced on
// Sleeper's free public weekly stats (rush_rz_att + rec_rz_tgt).

import { describe, it, expect } from 'vitest';
import {
  buildRedZoneLeaders,
  teamRzOppsByWeek,
  type RedZoneLeadersInput,
} from './redZoneLeaders';
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

function line(rzOpps: number, offSnaps = 50): WeeklyUsageLine {
  return { offSnaps, teamSnaps: 70, targets: 0, rushAtt: 0, receptions: 0, rzOpps, airYards: 0, deepRec: 0, longRec: 0, yac: 0, recYards: 0, rushYards: 0, rushTd: 0, recTd: 0, passYards: 0, passTd: 0, rushFd: 0, recFd: 0 };
}

function input(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
): RedZoneLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 8 };
}

const players = [
  player('alpha', 'Alpha Back', 'RB'),
  player('beta', 'Beta Back', 'RB'),
  player('gamma', 'Gamma Receiver', 'WR'),
  player('delta', 'Delta Tight End', 'TE'),
];

describe('teamRzOppsByWeek', () => {
  it('sums red-zone opps per team per week across pool players', () => {
    const byWeek = teamRzOppsByWeek(players, {
      alpha: { 5: line(4), 6: line(6) },
      beta: { 5: line(2), 6: line(1) },
      gamma: { 5: line(3) },
    });
    expect(byWeek.get('DAL')?.get(5)).toBe(9);
    expect(byWeek.get('DAL')?.get(6)).toBe(7);
    expect(byWeek.get('DAL')?.get(7)).toBeUndefined();
  });
});

describe('buildRedZoneLeaders', () => {
  it('ranks by red-zone opps per game over the last 3 completed weeks', () => {
    const leaders = buildRedZoneLeaders(
      input(players, {
        alpha: { 5: line(6), 6: line(6), 7: line(6) },
        beta: { 5: line(2), 6: line(4), 7: line(3) },
        gamma: { 5: line(5), 6: line(5), 7: line(5) },
        delta: { 5: line(1), 6: line(2), 7: line(3) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(rb[0].rzOpps).toBe(18);
    expect(rb[0].rzOppsPerGame).toBe(6);
    expect(rb[0].games).toBe(3);
    // Team DAL weeks 5-7 totals 14 + 17 + 17 = 48; Alpha took 18 of them.
    expect(rb[0].rzShare).toBeCloseTo(18 / 48, 2);
    expect(leaders.get('WR')?.[0].player.id).toBe('gamma');
    expect(leaders.get('TE')?.[0].player.id).toBe('delta');
  });

  it('ignores the in-progress week and weeks before the window', () => {
    const leaders = buildRedZoneLeaders(
      input(players, {
        // Week 8 is in progress, week 4 is outside the 3-week window.
        alpha: { 4: line(9), 5: line(1), 6: line(1), 7: line(1), 8: line(9) },
        beta: { 5: line(2), 6: line(2), 7: line(2) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb[0].player.id).toBe('beta');
    expect(rb[0].rzOppsPerGame).toBe(2);
    expect(rb[1].rzOppsPerGame).toBe(1);
  });

  it('requires 2+ games and drops players with no red-zone work', () => {
    const leaders = buildRedZoneLeaders(
      input(players, {
        alpha: { 7: line(6) },
        beta: { 5: line(0), 6: line(0), 7: line(0) },
        gamma: { 5: line(4), 6: line(4), 7: line(4) },
      }),
    );
    expect(leaders.get('RB')).toBeUndefined();
    expect(leaders.get('WR')?.map(r => r.player.id)).toEqual(['gamma']);
  });

  it('skips a player with no usage lines for his team', () => {
    const ghost = player('ghost', 'Ghost Back', 'RB', 'NOPE');
    const empty = buildRedZoneLeaders(input([ghost], {}));
    expect(empty.get('RB')).toBeUndefined();
  });

  it('caps at 15 per position, ties broken by total opps', () => {
    const many = Array.from({ length: 17 }, (_, i) =>
      player(`rb${i}`, `Back ${i}`, 'RB'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    many.forEach((p, i) => {
      // Even split: first 16 get 3/game over 3 weeks, last gets 2/game.
      const per = i < 16 ? 3 : 2;
      usage[p.sleeperId!] = { 5: line(per), 6: line(per), 7: line(per) };
    });
    const leaders = buildRedZoneLeaders(input(many, usage));
    expect(leaders.get('RB')).toHaveLength(15);
  });
});
