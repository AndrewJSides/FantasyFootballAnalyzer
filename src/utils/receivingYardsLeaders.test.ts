// Receiving Yards Leaders board (backlog item 161): per-position
// receiving-yards leaders over the last 3 completed weeks, priced on
// Sleeper's free public weekly stats (rec_yd, via the shared
// weekly-usage fetch).

import { describe, it, expect } from 'vitest';
import {
  buildReceivingYardsLeaders,
  type RecYardsLeadersInput,
} from './receivingYardsLeaders';
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

function line(recYards: number, targets = 8, receptions = 5): WeeklyUsageLine {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets,
    rushAtt: 0,
    receptions,
    rzOpps: 0,
    airYards: 0,
    deepRec: 0,
    longRec: 0,
    yac: 0,
    recYards,
    rushYards: 0,
    rushTd: 0,
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
): RecYardsLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 10 };
}

const players = [
  player('alpha', 'Alpha Receiver', 'WR'),
  player('beta', 'Beta Receiver', 'WR'),
  player('gamma', 'Gamma Back', 'RB'),
  player('delta', 'Delta Tight End', 'TE'),
];

describe('buildReceivingYardsLeaders', () => {
  it('ranks by receiving yards per game over the last 3 completed weeks', () => {
    const leaders = buildReceivingYardsLeaders(
      input(players, {
        // Alpha: 300 yd / 3 gm = 100.0; Beta: 180 / 3 = 60.0;
        // Gamma: 120 (RB tab); Delta: 90 (TE tab).
        alpha: { 7: line(100), 8: line(100), 9: line(100) },
        beta: { 7: line(60), 8: line(60), 9: line(60) },
        gamma: { 7: line(40), 8: line(40), 9: line(40) },
        delta: { 7: line(30), 8: line(30), 9: line(30) },
      }),
    );
    const wr = leaders.get('WR') ?? [];
    expect(wr.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(wr[0].recYardsPerGame).toBe(100);
    expect(wr[0].recYards).toBe(300);
    expect(wr[0].targets).toBe(24);
    expect(wr[0].games).toBe(3);
    expect((leaders.get('RB') ?? []).map(r => r.player.id)).toEqual(['gamma']);
    expect((leaders.get('TE') ?? []).map(r => r.player.id)).toEqual(['delta']);
  });

  it('ignores weeks outside the 3-week window and the in-progress week', () => {
    const leaders = buildReceivingYardsLeaders(
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
    const wr = leaders.get('WR') ?? [];
    expect(wr).toHaveLength(1);
    expect(wr[0].recYards).toBe(150);
    expect(wr[0].recYardsPerGame).toBe(50);
  });

  it('requires 2+ games', () => {
    const leaders = buildReceivingYardsLeaders(
      input(players, {
        // Alpha: 1 game only (a 90-yard spot start). Doesn't qualify.
        alpha: { 9: line(90) },
      }),
    );
    expect(leaders.get('WR')).toBeUndefined();
  });

  it('excludes players with no receiving yards', () => {
    const leaders = buildReceivingYardsLeaders(
      input(players, {
        alpha: { 7: line(0), 8: line(0), 9: line(0) },
      }),
    );
    expect(leaders.get('WR')).toBeUndefined();
  });

  it('breaks per-game ties by total yards, then receptions', () => {
    const leaders = buildReceivingYardsLeaders(
      input(players, {
        // Both 60.0 yards per game — Alpha over 2 games (120 total),
        // Beta over 3 (180 total) — so the tie-break puts Beta first.
        alpha: { 8: line(60, 5, 4), 9: line(60, 5, 4) },
        beta: { 7: line(60, 4, 3), 8: line(60, 4, 3), 9: line(60, 4, 3) },
      }),
    );
    const wr = leaders.get('WR') ?? [];
    expect(wr.map(r => r.player.id)).toEqual(['beta', 'alpha']);
    expect(wr[0].recYardsPerGame).toBe(60);
    expect(wr[1].recYardsPerGame).toBe(60);
    expect(wr[0].recYards).toBe(180);
  });

  it('caps each position at 15 leaders', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      player(`wr${i}`, `Receiver ${i}`, 'WR'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    many.forEach((p, i) => {
      // Yards per game descends with i so the top 15 are wr0..wr14.
      usage[p.id] = {
        7: line(200 - i * 5),
        8: line(200 - i * 5),
        9: line(200 - i * 5),
      };
    });
    const leaders = buildReceivingYardsLeaders(input(many, usage));
    const wr = leaders.get('WR') ?? [];
    expect(wr).toHaveLength(15);
    expect(wr[0].player.id).toBe('wr0');
    expect(wr[14].player.id).toBe('wr14');
  });

  it('omits positions with no leaders', () => {
    const leaders = buildReceivingYardsLeaders(input(players, {}));
    expect(leaders.size).toBe(0);
  });
});
