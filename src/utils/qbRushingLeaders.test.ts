// QbRushingLeaders util (backlog item 185): quarterbacks ranked by
// rushing yards per game over the last 3 completed weeks, with the
// Konami read — the share of the QB's full-PPR points that came from
// rushing.

import { describe, expect, it } from 'vitest';
import {
  buildQbRushingLeaders,
  MAX_QB_RUSHING_LEADERS,
} from './qbRushingLeaders';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';
import type { PoolPlayer } from '@/types/draft';

function player(id: string, name: string, pos: string, team = 'BUF'): PoolPlayer {
  return {
    id,
    name,
    team,
    pos,
    posRank: 1,
    overallRank: 10,
    tier: 1,
    bye: 7,
    baseValue: null,
    projPtsPpr: 300,
    sleeperId: id,
  } as PoolPlayer;
}

function line(
  rushAtt: number,
  rushYards: number,
  rushTd = 0,
  ptsPpr = 0,
): WeeklyUsageLine {
  return {
    offSnaps: 70,
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
    passYards: 250,
    passTd: 2,
    passAtt: 35,
    passCmp: 24,
    rushFd: 0,
    recFd: 0,
    ptsPpr,
  };
}

const players = [
  player('allen', 'Josh Allen', 'QB', 'BUF'),
  player('hurts', 'Jalen Hurts', 'QB', 'PHI'),
  player('burrow', 'Joe Burrow', 'QB', 'CIN'),
  // A running back must never lead a QB board.
  player('barkley', 'Saquon Barkley', 'RB', 'PHI'),
];

describe('buildQbRushingLeaders', () => {
  it('ranks QBs by rush yards per game over the last 3 completed weeks', () => {
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {
      // Allen: 60 yds/gm, 2 TDs, 90 pts in the window.
      allen: {
        5: line(8, 60, 1, 30),
        6: line(8, 60, 0, 30),
        7: line(8, 60, 1, 30),
      },
      // Hurts: 40 yds/gm, 1 TD, 75 pts.
      hurts: {
        5: line(6, 40, 0, 25),
        6: line(6, 40, 1, 25),
        7: line(6, 40, 0, 25),
      },
      // Burrow: 5 yds/gm — on the board, last.
      burrow: {
        5: line(2, 5, 0, 28),
        6: line(2, 5, 0, 28),
        7: line(2, 5, 0, 28),
      },
      // Barkley rushes for far more — still excluded, wrong position.
      barkley: {
        5: line(20, 120, 1, 25),
        6: line(20, 120, 1, 25),
        7: line(20, 120, 1, 25),
      },
    };
    const leaders = buildQbRushingLeaders({
      poolPlayers: players,
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    expect(leaders.map(r => r.player.id)).toEqual(['allen', 'hurts', 'burrow']);
    expect(leaders[0].rushYardsPerGame).toBe(60);
    expect(leaders[0].rushAttPerGame).toBe(8);
    expect(leaders[0].rushTd).toBe(2);
    expect(leaders[0].games).toBe(3);
    // Allen's rush points: 180/10 + 2*6 = 30 of 90 total = 33.3%.
    expect(leaders[0].rushPtsShare).toBe(0.333);
    // Hurts: 120/10 + 1*6 = 18 of 75 = 24%.
    expect(leaders[1].rushPtsShare).toBe(0.24);
    // Burrow: 15/10 = 1.5 of 84 = 1.8%.
    expect(leaders[2].rushPtsShare).toBe(0.018);
  });

  it('requires 2+ games and stays inside the 3-week window', () => {
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {
      // Allen: only week 7 (one game) — excluded.
      allen: { 7: line(8, 60, 0, 30) },
      // Hurts: weeks 4-7 — week 4 is outside the window, weeks 5-7 count.
      hurts: {
        4: line(6, 99, 0, 25),
        5: line(6, 40, 0, 25),
        6: line(6, 40, 0, 25),
        7: line(6, 40, 0, 25),
      },
    };
    const leaders = buildQbRushingLeaders({
      poolPlayers: players,
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    expect(leaders.map(r => r.player.id)).toEqual(['hurts']);
    expect(leaders[0].games).toBe(3);
    expect(leaders[0].rushYardsPerGame).toBe(40);
  });

  it('breaks rush-yards-per-game ties by total rush yards, then rush TDs', () => {
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {
      // Allen and Hurts both average 40 yds/gm over 3 games, but Allen
      // played only 2 of them (80 total) vs Hurts' 3 (120 total).
      allen: { 6: line(6, 40, 1, 25), 7: line(6, 40, 1, 25) },
      hurts: {
        5: line(6, 40, 0, 25),
        6: line(6, 40, 0, 25),
        7: line(6, 40, 0, 25),
      },
    };
    const leaders = buildQbRushingLeaders({
      poolPlayers: players,
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    expect(leaders.map(r => r.player.id)).toEqual(['hurts', 'allen']);
    expect(leaders[0].rushYardsPerGame).toBe(leaders[1].rushYardsPerGame);
  });

  it('caps at 15 leaders and skips QBs with no rushing yards', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      player(`qb${i}`, `Quarterback ${i}`, 'QB'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    for (let i = 0; i < 20; i++) {
      usage[`qb${i}`] = {
        5: line(5, 60 - i, 0, 25),
        6: line(5, 60 - i, 0, 25),
        7: line(5, 60 - i, 0, 25),
      };
    }
    // One QB with zero rushing yards never leads.
    usage.qb19 = {
      5: line(0, 0, 0, 25),
      6: line(0, 0, 0, 25),
      7: line(0, 0, 0, 25),
    };
    const leaders = buildQbRushingLeaders({
      poolPlayers: many,
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    expect(leaders).toHaveLength(MAX_QB_RUSHING_LEADERS);
    expect(leaders.map(r => r.player.id)).not.toContain('qb19');
  });

  it('reports a 0 rush-points share when a QB scored no fantasy points', () => {
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {
      allen: { 5: line(8, 60, 0, 0), 6: line(8, 60, 0, 0), 7: line(8, 60, 0, 0) },
    };
    const leaders = buildQbRushingLeaders({
      poolPlayers: players,
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    expect(leaders[0].rushPtsShare).toBe(0);
  });
});
