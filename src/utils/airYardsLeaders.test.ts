// Air Yards Leaders board (backlog item 146): per-position air-yards
// leaders over the last 3 completed weeks, priced on Sleeper's free
// public weekly stats (rec_air_yd).

import { describe, it, expect } from 'vitest';
import {
  buildAirYardsLeaders,
  teamAirYardsByWeek,
  type AirYardsLeadersInput,
} from './airYardsLeaders';
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

function line(airYards: number, targets = 10, offSnaps = 50): WeeklyUsageLine {
  return { offSnaps, teamSnaps: 70, targets, rushAtt: 0, receptions: 0, rzOpps: 0, airYards };
}

function input(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
): AirYardsLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 8 };
}

const players = [
  player('alpha', 'Alpha Back', 'RB'),
  player('beta', 'Beta Back', 'RB'),
  player('gamma', 'Gamma Receiver', 'WR'),
  player('delta', 'Delta Tight End', 'TE'),
];

describe('teamAirYardsByWeek', () => {
  it('sums air yards per team per week across pool players', () => {
    const byWeek = teamAirYardsByWeek(players, {
      alpha: { 5: line(40), 6: line(60) },
      beta: { 5: line(20), 6: line(10) },
      gamma: { 5: line(30) },
    });
    expect(byWeek.get('DAL')?.get(5)).toBe(90);
    expect(byWeek.get('DAL')?.get(6)).toBe(70);
    expect(byWeek.get('DAL')?.get(7)).toBeUndefined();
  });
});

describe('buildAirYardsLeaders', () => {
  it('ranks by air yards per game over the last 3 completed weeks', () => {
    const leaders = buildAirYardsLeaders(
      input(players, {
        alpha: { 5: line(60), 6: line(60), 7: line(60) },
        beta: { 5: line(20), 6: line(40), 7: line(30) },
        gamma: { 5: line(50), 6: line(50), 7: line(50) },
        delta: { 5: line(10), 6: line(20), 7: line(30) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(rb[0].airYards).toBe(180);
    expect(rb[0].airYardsPerGame).toBe(60);
    expect(rb[0].games).toBe(3);
    // Team DAL weeks 5-7 totals 140 + 170 + 170 = 480; Alpha took 180 of them.
    expect(rb[0].airShare).toBeCloseTo(180 / 480, 2);
    // 180 air yards on 30 targets → aDOT 6.0.
    expect(rb[0].aDot).toBe(6);
    expect(leaders.get('WR')?.[0].player.id).toBe('gamma');
    expect(leaders.get('TE')?.[0].player.id).toBe('delta');
  });

  it('ignores the in-progress week and weeks before the window', () => {
    const leaders = buildAirYardsLeaders(
      input(players, {
        // Week 8 is in progress, week 4 is outside the 3-week window.
        alpha: { 4: line(90), 5: line(10), 6: line(10), 7: line(10), 8: line(90) },
        beta: { 5: line(20), 6: line(20), 7: line(20) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb[0].player.id).toBe('beta');
    expect(rb[0].airYardsPerGame).toBe(20);
    expect(rb[1].airYardsPerGame).toBe(10);
  });

  it('requires 2+ games and drops players with no downfield work', () => {
    const leaders = buildAirYardsLeaders(
      input(players, {
        alpha: { 7: line(60) },
        // Screen-only weeks: zero or negative air yards total.
        beta: { 5: line(-4), 6: line(2), 7: line(2) },
        gamma: { 5: line(40), 6: line(40), 7: line(40) },
      }),
    );
    expect(leaders.get('RB')).toBeUndefined();
    expect(leaders.get('WR')?.map(r => r.player.id)).toEqual(['gamma']);
  });

  it('carries a null aDOT with no targets', () => {
    const leaders = buildAirYardsLeaders(
      input(players, {
        alpha: { 5: line(60, 0), 6: line(60, 0), 7: line(60, 0) },
      }),
    );
    expect(leaders.get('RB')?.[0].aDot).toBeNull();
  });

  it('skips a player with no usage lines for his team', () => {
    const ghost = player('ghost', 'Ghost Back', 'RB', 'NOPE');
    const empty = buildAirYardsLeaders(input([ghost], {}));
    expect(empty.get('RB')).toBeUndefined();
  });

  it('caps at 15 per position, ties broken by total air yards', () => {
    const many = Array.from({ length: 17 }, (_, i) =>
      player(`rb${i}`, `Back ${i}`, 'RB'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    many.forEach((p, i) => {
      // Even split: first 16 get 30/game over 3 weeks, last gets 20/game.
      const per = i < 16 ? 30 : 20;
      usage[p.sleeperId!] = { 5: line(per), 6: line(per), 7: line(per) };
    });
    const leaders = buildAirYardsLeaders(input(many, usage));
    expect(leaders.get('RB')).toHaveLength(15);
  });
});
