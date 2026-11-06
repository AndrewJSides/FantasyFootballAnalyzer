// Rushing Yards Leaders board (backlog item 162): per-position
// rushing-yards leaders over the last 3 completed weeks, priced on
// Sleeper's free public weekly stats (rush_yd, via the shared
// weekly-usage fetch).

import { describe, it, expect } from 'vitest';
import {
  buildRushingYardsLeaders,
  type RushYardsLeadersInput,
} from './rushingYardsLeaders';
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

function line(rushYards: number, rushAtt = 15, rushTd = 1): WeeklyUsageLine {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets: 0,
    rushAtt,
    receptions: 0,
    rzOpps: 0,
    airYards: 0,
    deepRec: 0,
    longRec: 0,
    yac: 0,
    recYards: 0,
    rushYards,
    rushTd,
    recTd: 0,
    passYards: 0,
    passTd: 0,
    passAtt: 0,
    passCmp: 0,
    rushFd: 0,
    recFd: 0,
    ptsPpr: 0,
  };
}

function input(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
): RushYardsLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 10 };
}

const players = [
  player('alpha', 'Alpha Back', 'RB'),
  player('beta', 'Beta Back', 'RB'),
  player('gamma', 'Gamma Receiver', 'WR'),
  player('delta', 'Delta Tight End', 'TE'),
];

describe('buildRushingYardsLeaders', () => {
  it('ranks by rushing yards per game over the last 3 completed weeks', () => {
    const leaders = buildRushingYardsLeaders(
      input(players, {
        // Alpha: 300 yd / 3 gm = 100.0; Beta: 180 / 3 = 60.0;
        // Gamma: 120 (WR tab); Delta: 90 (TE tab).
        alpha: { 7: line(100), 8: line(100), 9: line(100) },
        beta: { 7: line(60), 8: line(60), 9: line(60) },
        gamma: { 7: line(40), 8: line(40), 9: line(40) },
        delta: { 7: line(30), 8: line(30), 9: line(30) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(rb[0].rushYardsPerGame).toBe(100);
    expect(rb[0].rushYards).toBe(300);
    expect(rb[0].carries).toBe(45);
    expect(rb[0].rushTd).toBe(3);
    expect(rb[0].games).toBe(3);
    expect((leaders.get('WR') ?? []).map(r => r.player.id)).toEqual(['gamma']);
    expect((leaders.get('TE') ?? []).map(r => r.player.id)).toEqual(['delta']);
  });

  it('ignores weeks outside the 3-week window and the in-progress week', () => {
    const leaders = buildRushingYardsLeaders(
      input(players, {
        // Only weeks 7–9 count: 150 yards. Week 6's 200 yards and
        // week 10's (in-progress) 200 yards are out.
        alpha: {
          6: line(200),
          7: line(50),
          8: line(50),
          9: line(50),
          10: line(200),
        },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb).toHaveLength(1);
    expect(rb[0].rushYards).toBe(150);
    expect(rb[0].rushYardsPerGame).toBe(50);
  });

  it('requires 2+ games', () => {
    const leaders = buildRushingYardsLeaders(
      input(players, {
        // Alpha: 1 game only (a 90-yard spot start). Doesn't qualify.
        alpha: { 9: line(90) },
      }),
    );
    expect(leaders.get('RB')).toBeUndefined();
  });

  it('excludes players with no rushing yards', () => {
    const leaders = buildRushingYardsLeaders(
      input(players, {
        alpha: { 7: line(0), 8: line(0), 9: line(0) },
      }),
    );
    expect(leaders.get('RB')).toBeUndefined();
  });

  it('breaks per-game ties by total yards, then carries', () => {
    const leaders = buildRushingYardsLeaders(
      input(players, {
        // Both 60.0 yards per game — Alpha over 2 games (120 total),
        // Beta over 3 (180 total) — so the tie-break puts Beta first.
        alpha: { 8: line(60, 12), 9: line(60, 12) },
        beta: { 7: line(60, 10), 8: line(60, 10), 9: line(60, 10) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.id)).toEqual(['beta', 'alpha']);
    expect(rb[0].rushYardsPerGame).toBe(60);
    expect(rb[1].rushYardsPerGame).toBe(60);
    expect(rb[0].rushYards).toBe(180);
  });

  it('caps each position at 15 leaders', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      player(`rb${i}`, `Back ${i}`, 'RB'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    many.forEach((p, i) => {
      // Yards per game descends with i so the top 15 are rb0..rb14.
      usage[p.id] = {
        7: line(200 - i * 5),
        8: line(200 - i * 5),
        9: line(200 - i * 5),
      };
    });
    const leaders = buildRushingYardsLeaders(input(many, usage));
    const rb = leaders.get('RB') ?? [];
    expect(rb).toHaveLength(15);
    expect(rb[0].player.id).toBe('rb0');
    expect(rb[14].player.id).toBe('rb14');
  });

  it('omits positions with no leaders', () => {
    const leaders = buildRushingYardsLeaders(input(players, {}));
    expect(leaders.size).toBe(0);
  });
});
