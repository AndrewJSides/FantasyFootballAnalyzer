// Pass Attempts Leaders board (backlog item 167): quarterback
// pass-attempt leaders over the last 3 completed weeks, priced on
// Sleeper's free public weekly stats (pass_att / pass_cmp, via the
// shared weekly-usage fetch).

import { describe, it, expect } from 'vitest';
import {
  buildPassAttemptsLeaders,
  type PassAttLeadersInput,
} from './passAttemptsLeaders';
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

function line(
  passAtt: number,
  passCmp = Math.round(passAtt * 0.65),
  passYards = 250,
): WeeklyUsageLine {
  return {
    offSnaps: 60,
    teamSnaps: 70,
    targets: 0,
    rushAtt: 2,
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
    passYards,
    passTd: 0,
    passAtt,
    passCmp,
    rushFd: 0,
    recFd: 0,
    ptsPpr: 0,
  };
}

function input(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
): PassAttLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 10 };
}

const players = [
  player('alpha', 'Alpha Passer', 'QB'),
  player('beta', 'Beta Passer', 'QB'),
  player('gamma', 'Gamma Passer', 'QB'),
  // Non-QB passers never lead the board.
  player('delta', 'Delta Trick Play', 'WR'),
];

describe('buildPassAttemptsLeaders', () => {
  it('ranks by pass attempts per game over the last 3 completed weeks', () => {
    const leaders = buildPassAttemptsLeaders(
      input(players, {
        // Alpha: 120 att / 3 gm = 40.0; Beta: 90 / 3 = 30.0;
        // Gamma: 60 / 3 = 20.0. Delta throws too (WR) — excluded.
        alpha: { 7: line(40), 8: line(40), 9: line(40) },
        beta: { 7: line(30), 8: line(30), 9: line(30) },
        gamma: { 7: line(20), 8: line(20), 9: line(20) },
        delta: { 7: line(50), 8: line(50), 9: line(50) },
      }),
    );
    const qb = leaders.get('QB') ?? [];
    expect(qb.map(r => r.player.id)).toEqual(['alpha', 'beta', 'gamma']);
    expect(qb[0].passAttPerGame).toBe(40);
    expect(qb[0].passAtt).toBe(120);
    expect(qb[0].passCmp).toBe(78);
    expect(qb[0].cmpPct).toBe(65);
    expect(qb[0].passYards).toBe(750);
    expect(qb[0].games).toBe(3);
  });

  it('ignores weeks outside the 3-week window and the in-progress week', () => {
    const leaders = buildPassAttemptsLeaders(
      input(players, {
        // Only weeks 7–9 count: 90 att. Week 6's 40 and week 10's
        // (in-progress) 40 are out.
        alpha: {
          6: line(40),
          7: line(30),
          8: line(30),
          9: line(30),
          10: line(40),
        },
      }),
    );
    const qb = leaders.get('QB') ?? [];
    expect(qb).toHaveLength(1);
    expect(qb[0].passAtt).toBe(90);
    expect(qb[0].passAttPerGame).toBe(30);
  });

  it('requires 2+ games', () => {
    const leaders = buildPassAttemptsLeaders(
      input(players, {
        // Alpha: 1 game only (a 40-attempt spot start). Doesn't qualify.
        alpha: { 9: line(40) },
      }),
    );
    expect(leaders.get('QB')).toBeUndefined();
  });

  it('excludes players with no pass attempts', () => {
    const leaders = buildPassAttemptsLeaders(
      input(players, {
        alpha: { 7: line(0), 8: line(0), 9: line(0) },
      }),
    );
    expect(leaders.get('QB')).toBeUndefined();
  });

  it('breaks per-game ties by total attempts, then passing yards', () => {
    const leaders = buildPassAttemptsLeaders(
      input(players, {
        // Both 30.0 att per game — Alpha over 2 games (60 total),
        // Beta over 3 (90 total) — so the tie-break puts Beta first.
        alpha: { 8: line(30, 20, 300), 9: line(30, 20, 300) },
        beta: { 7: line(30, 20, 250), 8: line(30, 20, 250), 9: line(30, 20, 250) },
      }),
    );
    const qb = leaders.get('QB') ?? [];
    expect(qb.map(r => r.player.id)).toEqual(['beta', 'alpha']);
    expect(qb[0].passAttPerGame).toBe(30);
    expect(qb[1].passAttPerGame).toBe(30);
    expect(qb[0].passAtt).toBe(90);
  });

  it('caps the board at 15 leaders', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      player(`qb${i}`, `Passer ${i}`, 'QB'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    many.forEach((p, i) => {
      // Attempts per game descend with i so the top 15 are qb0..qb14.
      const att = 40 - i;
      usage[p.id] = { 7: line(att), 8: line(att), 9: line(att) };
    });
    const leaders = buildPassAttemptsLeaders(input(many, usage));
    const qb = leaders.get('QB') ?? [];
    expect(qb).toHaveLength(15);
    expect(qb[0].player.id).toBe('qb0');
    expect(qb[14].player.id).toBe('qb14');
  });

  it('omits the position when no leaders qualify', () => {
    const leaders = buildPassAttemptsLeaders(input(players, {}));
    expect(leaders.size).toBe(0);
  });
});
