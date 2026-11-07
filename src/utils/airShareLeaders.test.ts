// Air Yards Share Leaders board (backlog item 194): per-position
// leaders in share of their own NFL team's air yards over the last 3
// completed weeks, priced on Sleeper's free public weekly stats
// (rec_air_yd + rec_tgt).

import { describe, it, expect } from 'vitest';
import {
  buildAirShareLeaders,
  type AirShareLeadersInput,
} from './airShareLeaders';
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
): AirShareLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 8 };
}

const players = [
  player('alpha', 'Alpha Receiver', 'WR'),
  player('beta', 'Beta Receiver', 'WR'),
  player('gamma', 'Gamma Back', 'RB'),
  player('delta', 'Delta Tight End', 'TE'),
];

describe('buildAirShareLeaders', () => {
  it('ranks by air-yards share over the last 3 completed weeks', () => {
    const leaders = buildAirShareLeaders(
      input(players, {
        alpha: { 5: line(60), 6: line(60), 7: line(60) },
        beta: { 5: line(20), 6: line(40), 7: line(30) },
        gamma: { 5: line(50), 6: line(50), 7: line(50) },
        delta: { 5: line(10), 6: line(20), 7: line(30) },
      }),
    );
    const wr = leaders.get('WR') ?? [];
    // Team DAL weeks 5-7 air yards: 140 + 170 + 170 = 480; Alpha took 180.
    expect(wr.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(wr[0].airShare).toBeCloseTo(180 / 480, 2);
    expect(wr[0].airYards).toBe(180);
    expect(wr[0].airYardsPerGame).toBe(60);
    expect(wr[0].games).toBe(3);
    // 30 targets on a 120-target team window → 25% target share.
    expect(wr[0].targetShare).toBeCloseTo(30 / 120, 2);
    // 180 air yards on 30 targets → aDOT 6.0.
    expect(wr[0].aDot).toBe(6);
    expect(wr[0].isThirtyThirty).toBe(false);
    expect(leaders.get('RB')?.[0].player.id).toBe('gamma');
  });

  it('a low-volume-team star can lead on share while trailing on raw yards', () => {
    // Alpha: 90 of his team's 100 air yards (90% share) on a quiet team;
    // Beta: 120 of his team's 400 (30% share) on a busy team.
    const mixed = [
      player('alpha', 'Alpha Receiver', 'WR', 'DAL'),
      player('beta', 'Beta Receiver', 'WR', 'NYG'),
      player('filler-dal', 'Filler Cowboy', 'WR', 'DAL'),
      player('filler-nyg', 'Filler Giant', 'WR', 'NYG'),
    ];
    const leaders = buildAirShareLeaders(
      input(mixed, {
        alpha: { 5: line(30), 6: line(30), 7: line(30) },
        // Fillers pad the team denominators on one week only, so the
        // 2-game minimum keeps them off the board themselves.
        'filler-dal': { 5: line(10) },
        beta: { 5: line(40), 6: line(40), 7: line(40) },
        'filler-nyg': { 5: line(280) },
      }),
    );
    const wr = leaders.get('WR') ?? [];
    expect(wr.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(wr[0].airShare).toBeCloseTo(90 / 100, 2);
    expect(wr[1].airShare).toBeCloseTo(120 / 400, 2);
  });

  it('flags the 30/30 club (30%+ target share AND 30%+ air share)', () => {
    const leaders = buildAirShareLeaders(
      input(players, {
        alpha: { 5: line(60, 15), 6: line(60, 15), 7: line(60, 15) },
        beta: { 5: line(20, 5), 6: line(40, 5), 7: line(30, 5) },
        gamma: { 5: line(50, 10), 6: line(50, 10), 7: line(50, 10) },
        delta: { 5: line(10, 5), 6: line(20, 5), 7: line(30, 5) },
      }),
    );
    const wr = leaders.get('WR') ?? [];
    // Alpha: 180/480 air yards (37.5%) and 45/105 targets (~43%) → 30/30.
    expect(wr[0].isThirtyThirty).toBe(true);
    // Beta: 90/480 air yards (18.75%) → not 30/30 despite 15 targets.
    expect(wr[1].isThirtyThirty).toBe(false);
  });

  it('requires 2+ games and positive air yards', () => {
    const leaders = buildAirShareLeaders(
      input(players, {
        alpha: { 7: line(60) },
        beta: { 5: line(20), 6: line(40), 7: line(30) },
        gamma: { 5: line(-10), 6: line(-5), 7: line(0) },
        delta: { 5: line(10), 6: line(20), 7: line(30) },
      }),
    );
    // Alpha: 1 game only. Gamma: negative total air yards.
    expect(leaders.get('WR')?.map(r => r.player.id)).toEqual(['beta']);
    expect(leaders.get('RB')).toBeUndefined();
    expect(leaders.get('TE')?.[0].player.id).toBe('delta');
  });

  it('skips players whose team recorded no positive air yards', () => {
    const leaders = buildAirShareLeaders(
      input(players, {
        alpha: { 5: line(0), 6: line(0), 7: line(0) },
        beta: { 5: line(0), 6: line(0), 7: line(0) },
        gamma: { 5: line(0), 6: line(0), 7: line(0) },
        delta: { 5: line(0), 6: line(0), 7: line(0) },
      }),
    );
    expect(leaders.size).toBe(0);
  });

  it('ignores weeks outside the last-3-completed window', () => {
    const leaders = buildAirShareLeaders(
      input(players, {
        // Week 4 is outside the window (currentWeek 8 → weeks 5-7);
        // week 8 is the in-progress week and must not count either.
        alpha: { 4: line(300), 5: line(60), 6: line(60), 7: line(60), 8: line(300) },
        beta: { 5: line(20), 6: line(40), 7: line(30) },
        gamma: { 5: line(50), 6: line(50), 7: line(50) },
        delta: { 5: line(10), 6: line(20), 7: line(30) },
      }),
    );
    const wr = leaders.get('WR') ?? [];
    expect(wr[0].player.id).toBe('alpha');
    expect(wr[0].airYards).toBe(180);
    expect(wr[0].games).toBe(3);
  });

  it('keeps at most 15 leaders per position', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      player(`wr${i}`, `Receiver ${i}`, 'WR'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    for (let i = 0; i < 20; i++) {
      usage[`wr${i}`] = { 5: line(100 - i * 2), 6: line(100 - i * 2), 7: line(100 - i * 2) };
    }
    const leaders = buildAirShareLeaders(input(many, usage));
    expect(leaders.get('WR')?.length).toBe(15);
  });
});
