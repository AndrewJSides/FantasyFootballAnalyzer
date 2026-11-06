// Rushing Touchdowns Leaders board (backlog item 165): per-position
// rushing-touchdown leaders over the last 3 completed weeks, priced
// on Sleeper's free public weekly stats (rush_td, via the shared
// weekly-usage fetch).

import { describe, it, expect } from 'vitest';
import {
  buildRushingTdLeaders,
  type RushTdLeadersInput,
} from './rushingTdLeaders';
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

function line(rushTd: number, rushYards = 80, rushAtt = 15): WeeklyUsageLine {
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
    rushFd: 0,
    recFd: 0,
    ptsPpr: 0,
  };
}

function input(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
): RushTdLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 10 };
}

const players = [
  player('alpha', 'Alpha Back', 'RB'),
  player('beta', 'Beta Back', 'RB'),
  player('gamma', 'Gamma Receiver', 'WR'),
  player('delta', 'Delta Tight End', 'TE'),
];

describe('buildRushingTdLeaders', () => {
  it('ranks by rushing touchdowns per game over the last 3 completed weeks', () => {
    const leaders = buildRushingTdLeaders(
      input(players, {
        // Alpha: 6 TD / 3 gm = 2.0; Beta: 3 / 3 = 1.0;
        // Gamma: 3 (WR tab); Delta: 1 (TE tab).
        alpha: { 7: line(2), 8: line(2), 9: line(2) },
        beta: { 7: line(1), 8: line(1), 9: line(1) },
        gamma: { 7: line(1), 8: line(1), 9: line(1) },
        delta: { 7: line(0), 8: line(1), 9: line(0) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(rb[0].rushTdPerGame).toBe(2);
    expect(rb[0].rushTd).toBe(6);
    expect(rb[0].rushYards).toBe(240);
    expect(rb[0].carries).toBe(45);
    expect(rb[0].games).toBe(3);
    expect((leaders.get('WR') ?? []).map(r => r.player.id)).toEqual(['gamma']);
    expect((leaders.get('TE') ?? []).map(r => r.player.id)).toEqual(['delta']);
  });

  it('ignores weeks outside the 3-week window and the in-progress week', () => {
    const leaders = buildRushingTdLeaders(
      input(players, {
        // Only weeks 7–9 count: 3 TDs. Week 6's 2 TDs and week 10's
        // (in-progress) 2 TDs are out.
        alpha: {
          6: line(2),
          7: line(1),
          8: line(1),
          9: line(1),
          10: line(2),
        },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb).toHaveLength(1);
    expect(rb[0].rushTd).toBe(3);
    expect(rb[0].rushTdPerGame).toBe(1);
  });

  it('requires 2+ games', () => {
    const leaders = buildRushingTdLeaders(
      input(players, {
        // Alpha: 1 game only (a 2-TD spot start). Doesn't qualify.
        alpha: { 9: line(2) },
      }),
    );
    expect(leaders.get('RB')).toBeUndefined();
  });

  it('excludes players with no rushing touchdowns', () => {
    const leaders = buildRushingTdLeaders(
      input(players, {
        alpha: { 7: line(0), 8: line(0), 9: line(0) },
      }),
    );
    expect(leaders.get('RB')).toBeUndefined();
  });

  it('breaks per-game ties by total touchdowns, then rushing yards', () => {
    const leaders = buildRushingTdLeaders(
      input(players, {
        // Both 1.0 TD per game — Alpha over 2 games (2 total),
        // Beta over 3 (3 total) — so the tie-break puts Beta first.
        alpha: { 8: line(1, 90), 9: line(1, 90) },
        beta: { 7: line(1, 60), 8: line(1, 60), 9: line(1, 60) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.id)).toEqual(['beta', 'alpha']);
    expect(rb[0].rushTdPerGame).toBe(1);
    expect(rb[1].rushTdPerGame).toBe(1);
    expect(rb[0].rushTd).toBe(3);
  });

  it('caps each position at 15 leaders', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      player(`rb${i}`, `Back ${i}`, 'RB'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    many.forEach((p, i) => {
      // TDs per game descends with i so the top 15 are rb0..rb14.
      // rushTd must be an integer per week, so use 2/1/0 splits.
      const td = i < 15 ? 2 : 1;
      usage[p.id] = {
        7: line(td),
        8: line(td),
        9: line(i < 15 ? 2 : 0),
      };
    });
    const leaders = buildRushingTdLeaders(input(many, usage));
    const rb = leaders.get('RB') ?? [];
    expect(rb).toHaveLength(15);
    expect(rb[0].player.id).toBe('rb0');
    expect(rb[14].player.id).toBe('rb14');
  });

  it('omits positions with no leaders', () => {
    const leaders = buildRushingTdLeaders(input(players, {}));
    expect(leaders.size).toBe(0);
  });
});
