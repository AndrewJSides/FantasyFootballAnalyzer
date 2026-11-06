// Receiving Touchdowns Leaders board (backlog item 166): per-position
// receiving-touchdown leaders over the last 3 completed weeks, priced
// on Sleeper's free public weekly stats (rec_td, via the shared
// weekly-usage fetch).

import { describe, it, expect } from 'vitest';
import {
  buildReceivingTdLeaders,
  type RecTdLeadersInput,
} from './receivingTdLeaders';
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

function line(recTd: number, recYards = 80, receptions = 5): WeeklyUsageLine {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets: 0,
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
    recTd,
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
): RecTdLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 10 };
}

const players = [
  player('alpha', 'Alpha Receiver', 'WR'),
  player('beta', 'Beta Receiver', 'WR'),
  player('gamma', 'Gamma Tight End', 'TE'),
  player('delta', 'Delta Back', 'RB'),
];

describe('buildReceivingTdLeaders', () => {
  it('ranks by receiving touchdowns per game over the last 3 completed weeks', () => {
    const leaders = buildReceivingTdLeaders(
      input(players, {
        // Alpha: 6 TD / 3 gm = 2.0; Beta: 3 / 3 = 1.0;
        // Gamma: 3 (TE tab); Delta: 1 (RB tab).
        alpha: { 7: line(2), 8: line(2), 9: line(2) },
        beta: { 7: line(1), 8: line(1), 9: line(1) },
        gamma: { 7: line(1), 8: line(1), 9: line(1) },
        delta: { 7: line(0), 8: line(1), 9: line(0) },
      }),
    );
    const wr = leaders.get('WR') ?? [];
    expect(wr.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    expect(wr[0].recTdPerGame).toBe(2);
    expect(wr[0].recTd).toBe(6);
    expect(wr[0].recYards).toBe(240);
    expect(wr[0].receptions).toBe(15);
    expect(wr[0].games).toBe(3);
    expect((leaders.get('TE') ?? []).map(r => r.player.id)).toEqual(['gamma']);
    expect((leaders.get('RB') ?? []).map(r => r.player.id)).toEqual(['delta']);
  });

  it('ignores weeks outside the 3-week window and the in-progress week', () => {
    const leaders = buildReceivingTdLeaders(
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
    const wr = leaders.get('WR') ?? [];
    expect(wr).toHaveLength(1);
    expect(wr[0].recTd).toBe(3);
    expect(wr[0].recTdPerGame).toBe(1);
  });

  it('requires 2+ games', () => {
    const leaders = buildReceivingTdLeaders(
      input(players, {
        // Alpha: 1 game only (a 2-TD spot start). Doesn't qualify.
        alpha: { 9: line(2) },
      }),
    );
    expect(leaders.get('WR')).toBeUndefined();
  });

  it('excludes players with no receiving touchdowns', () => {
    const leaders = buildReceivingTdLeaders(
      input(players, {
        alpha: { 7: line(0), 8: line(0), 9: line(0) },
      }),
    );
    expect(leaders.get('WR')).toBeUndefined();
  });

  it('breaks per-game ties by total touchdowns, then receiving yards', () => {
    const leaders = buildReceivingTdLeaders(
      input(players, {
        // Both 1.0 TD per game — Alpha over 2 games (2 total),
        // Beta over 3 (3 total) — so the tie-break puts Beta first.
        alpha: { 8: line(1, 90), 9: line(1, 90) },
        beta: { 7: line(1, 60), 8: line(1, 60), 9: line(1, 60) },
      }),
    );
    const wr = leaders.get('WR') ?? [];
    expect(wr.map(r => r.player.id)).toEqual(['beta', 'alpha']);
    expect(wr[0].recTdPerGame).toBe(1);
    expect(wr[1].recTdPerGame).toBe(1);
    expect(wr[0].recTd).toBe(3);
  });

  it('caps each position at 15 leaders', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      player(`wr${i}`, `Receiver ${i}`, 'WR'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    many.forEach((p, i) => {
      // TDs per game descends with i so the top 15 are wr0..wr14.
      // recTd must be an integer per week, so use 2/1/0 splits.
      const td = i < 15 ? 2 : 1;
      usage[p.id] = {
        7: line(td),
        8: line(td),
        9: line(i < 15 ? 2 : 0),
      };
    });
    const leaders = buildReceivingTdLeaders(input(many, usage));
    const wr = leaders.get('WR') ?? [];
    expect(wr).toHaveLength(15);
    expect(wr[0].player.id).toBe('wr0');
    expect(wr[14].player.id).toBe('wr14');
  });

  it('omits positions with no leaders', () => {
    const leaders = buildReceivingTdLeaders(input(players, {}));
    expect(leaders.size).toBe(0);
  });
});
