// Scrimmage Yards Leaders board (backlog item 152): per-position
// yards-from-scrimmage leaders over the last 3 completed weeks,
// priced on Sleeper's free public weekly stats (rush_yd + rec_yd).

import { describe, it, expect } from 'vitest';
import { buildScrimmageLeaders, type ScrimmageLeadersInput } from './scrimmageLeaders';
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

function line(rushYards: number, recYards: number, carries = 10, receptions = 5): WeeklyUsageLine {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets: 8,
    rushAtt: carries,
    receptions,
    rzOpps: 0,
    airYards: 0,
    deepRec: 0,
    longRec: 0,
    yac: 0,
    recYards,
    rushYards,
    rushTd: 0,
    recTd: 0, passYards: 0, passTd: 0,
  };
}

function input(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
): ScrimmageLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 8 };
}

const players = [
  player('alpha', 'Alpha Back', 'RB'),
  player('beta', 'Beta Back', 'RB'),
  player('gamma', 'Gamma Receiver', 'WR'),
  player('delta', 'Delta Tight End', 'TE'),
];

describe('buildScrimmageLeaders', () => {
  it('ranks by scrimmage yards per game over the last 3 completed weeks', () => {
    const leaders = buildScrimmageLeaders(
      input(players, {
        alpha: { 5: line(100, 40), 6: line(60, 30), 7: line(140, 50) },
        beta: { 5: line(60, 20), 6: line(60, 20), 7: line(60, 20) },
        gamma: { 5: line(0, 90), 6: line(0, 90), 7: line(0, 90) },
        delta: { 5: line(0, 0), 6: line(0, 0), 7: line(0, 0) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(rb[0].scrimmageYards).toBe(420);
    expect(rb[0].rushYards).toBe(300);
    expect(rb[0].recYards).toBe(120);
    expect(rb[0].touches).toBe(45);
    expect(rb[0].scrimmagePerGame).toBe(140);
    expect(rb[0].games).toBe(3);
    expect(rb[1].scrimmagePerGame).toBe(80);
    // A receiver with no rushing yards still leads his own board.
    expect(leaders.get('WR')?.[0].player.id).toBe('gamma');
    expect(leaders.get('WR')?.[0].scrimmageYards).toBe(270);
    expect(leaders.get('TE')).toBeUndefined();
  });

  it('ignores the in-progress week and weeks before the window', () => {
    const leaders = buildScrimmageLeaders(
      input(players, {
        // Week 8 is in progress, week 4 is outside the 3-week window.
        alpha: { 4: line(500, 200), 5: line(50, 10), 6: line(50, 10), 7: line(50, 10), 8: line(500, 200) },
        beta: { 5: line(60, 20), 6: line(60, 20), 7: line(60, 20) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb[0].player.id).toBe('beta');
    expect(rb[0].scrimmagePerGame).toBe(80);
    expect(rb[1].scrimmagePerGame).toBe(60);
  });

  it('requires 2+ games and 10+ touches in the window', () => {
    const leaders = buildScrimmageLeaders(
      input(players, {
        // One game only, however productive.
        alpha: { 7: line(100, 50, 10, 5) },
        // Three games but only 6 touches — the 1-touch fluke guard.
        beta: { 5: line(60, 0, 2, 0), 6: line(60, 0, 2, 0), 7: line(60, 0, 2, 0) },
        gamma: { 5: line(0, 90, 0, 5), 6: line(0, 90, 0, 5), 7: line(0, 90, 0, 5) },
      }),
    );
    expect(leaders.get('RB')).toBeUndefined();
    expect(leaders.get('WR')?.map(r => r.player.id)).toEqual(['gamma']);
  });

  it('drops players with no scrimmage yards', () => {
    const leaders = buildScrimmageLeaders(
      input(players, {
        alpha: { 5: line(0, 0), 6: line(0, 0), 7: line(0, 0) },
        gamma: { 5: line(0, 90), 6: line(0, 90), 7: line(0, 90) },
      }),
    );
    expect(leaders.get('RB')).toBeUndefined();
    expect(leaders.get('WR')?.map(r => r.player.id)).toEqual(['gamma']);
  });

  it('breaks per-game ties by total scrimmage yards, then touches', () => {
    const leaders = buildScrimmageLeaders(
      input(players, {
        // Alpha and Beta both 100.0/gm; Alpha's 300 total beats Beta's 200.
        alpha: { 5: line(60, 40), 6: line(60, 40), 7: line(60, 40) },
        beta: { 5: line(60, 40), 6: line(60, 40) },
        gamma: { 5: line(0, 105), 6: line(0, 105), 7: line(0, 105) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(rb[0].player.id).toBe('alpha');
    expect(rb[0].scrimmageYards).toBe(300);
    expect(rb[1].player.id).toBe('beta');
    expect(rb[1].scrimmageYards).toBe(200);
    expect(leaders.get('WR')?.[0].player.id).toBe('gamma');
    expect(leaders.get('WR')?.[0].scrimmagePerGame).toBe(105);
  });

  it('caps at 15 per position', () => {
    const many = Array.from({ length: 17 }, (_, i) =>
      player(`rb${i}`, `Back ${i}`, 'RB'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    many.forEach((p, i) => {
      // Even split: first 16 get 100.0/gm over 3 weeks, last gets 30.0.
      const per = i < 16 ? 100 : 30;
      usage[p.sleeperId!] = { 5: line(per, 0), 6: line(per, 0), 7: line(per, 0) };
    });
    const leaders = buildScrimmageLeaders(input(many, usage));
    expect(leaders.get('RB')).toHaveLength(15);
  });
});
