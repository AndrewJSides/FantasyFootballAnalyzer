// Fantasy Points Leaders board (backlog item 158): per-position
// PPR fantasy-points leaders over the last 3 completed weeks,
// priced on Sleeper's free public weekly stats (pts_ppr).

import { describe, it, expect } from 'vitest';
import {
  buildFantasyPointsLeaders,
  type FantasyPointsLeadersInput,
} from './fantasyPointsLeaders';
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

function line(ptsPpr: number): WeeklyUsageLine {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets: 0,
    rushAtt: 0,
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
    rushFd: 0,
    recFd: 0,
    ptsPpr,
  };
}

function input(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
): FantasyPointsLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 8 };
}

const players = [
  player('alpha', 'Alpha Passer', 'QB'),
  player('beta', 'Beta Back', 'RB'),
  player('gamma', 'Gamma Receiver', 'WR'),
  player('delta', 'Delta Tight End', 'TE'),
];

describe('buildFantasyPointsLeaders', () => {
  it('ranks by PPR points per game over the last 3 completed weeks', () => {
    const leaders = buildFantasyPointsLeaders(
      input(players, {
        alpha: { 5: line(30), 6: line(25), 7: line(28) },
        beta: { 5: line(20), 6: line(22), 7: line(18) },
        gamma: { 5: line(15), 6: line(18), 7: line(12) },
        delta: { 5: line(8), 6: line(10), 7: line(9) },
      }),
    );
    // QBs lead their own board — the only board where they appear.
    const qb = leaders.get('QB') ?? [];
    expect(qb.map(r => r.player.id)).toEqual(['alpha']);
    expect(qb[0].ptsPpr).toBe(83);
    expect(qb[0].ptsPerGame).toBe(27.7);
    expect(qb[0].games).toBe(3);
    const rb = leaders.get('RB') ?? [];
    expect(rb[0].ptsPpr).toBe(60);
    expect(rb[0].ptsPerGame).toBe(20);
    expect((leaders.get('WR') ?? [])[0].ptsPerGame).toBe(15);
    expect((leaders.get('TE') ?? [])[0].ptsPerGame).toBe(9);
  });

  it('only counts the 3 completed weeks before the current week', () => {
    const leaders = buildFantasyPointsLeaders(
      input(players, {
        // Week 8 is in progress, week 4 is stale — only 5–7 count.
        alpha: { 4: line(40), 5: line(30), 6: line(25), 7: line(28), 8: line(40) },
      }),
    );
    const qb = leaders.get('QB') ?? [];
    expect(qb).toHaveLength(1);
    expect(qb[0].ptsPpr).toBe(83);
    expect(qb[0].ptsPerGame).toBe(27.7);
  });

  it('requires 2+ games and drops zero-point players', () => {
    const leaders = buildFantasyPointsLeaders(
      input(players, {
        alpha: { 5: line(30) },
        beta: { 5: line(0), 6: line(0), 7: line(0) },
        gamma: { 5: line(15), 6: line(18), 7: line(12) },
      }),
    );
    // Alpha has one game only, Beta scored nothing — neither leads.
    expect(leaders.get('QB')).toBeUndefined();
    expect(leaders.get('RB')).toBeUndefined();
    expect((leaders.get('WR') ?? []).map(r => r.player.id)).toEqual(['gamma']);
  });

  it('breaks per-game ties on total points, then games played', () => {
    const rbs = [player('alpha', 'Alpha Back', 'RB'), player('beta', 'Beta Back', 'RB')];
    const leaders = buildFantasyPointsLeaders(
      input(rbs, {
        // Both 20.0/gm; beta played 3 games for 60 total vs alpha's
        // 2 games for 40 — the total-points tie-break puts beta first.
        alpha: { 6: line(20), 7: line(20) },
        beta: { 5: line(20), 6: line(20), 7: line(20) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.id)).toEqual(['beta', 'alpha']);
    expect(rb[0].ptsPpr).toBe(60);
    expect(rb[1].ptsPpr).toBe(40);
    expect(rb[0].ptsPerGame).toBe(20);
    expect(rb[1].ptsPerGame).toBe(20);
  });

  it('caps each position at 15 leaders', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      player(`rb${i}`, `Back ${i}`, 'RB'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    many.forEach((p, i) => {
      usage[p.sleeperId ?? ''] = {
        5: line(25 - (i % 5)),
        6: line(25 - (i % 5)),
        7: line(25 - (i % 5)),
      };
    });
    const leaders = buildFantasyPointsLeaders(input(many, usage));
    expect((leaders.get('RB') ?? []).length).toBe(15);
  });

  it('omits a position with no qualifying players', () => {
    const leaders = buildFantasyPointsLeaders(
      input(players, {
        alpha: { 5: line(30), 6: line(25), 7: line(28) },
      }),
    );
    expect(leaders.get('QB')).toHaveLength(1);
    expect(leaders.get('RB')).toBeUndefined();
    expect(leaders.get('WR')).toBeUndefined();
    expect(leaders.get('TE')).toBeUndefined();
  });
});
