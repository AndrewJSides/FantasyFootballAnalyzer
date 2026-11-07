// RushShareLeaders util (backlog item 184): per-position rush-share
// leaders over the last 3 completed weeks, ranked by share of the
// player's own NFL team's rushing attempts.

import { describe, expect, it } from 'vitest';
import {
  buildRushShareLeaders,
  MAX_RUSH_SHARE_LEADERS,
} from './rushShareLeaders';
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

function line(rushAtt: number, rushYards = 0): WeeklyUsageLine {
  return { offSnaps: 70, teamSnaps: 70, targets: 0, rushAtt, receptions: 0, rzOpps: 0, airYards: 0, deepRec: 0, longRec: 0, yac: 0, recYards: 0, rushYards, rushTd: 0, recTd: 0, passYards: 0, passTd: 0, passAtt: 0, passCmp: 0, rushFd: 0, recFd: 0, ptsPpr: 0, ptsPpr: 0 };
}

const players = [
  player('alpha', 'Alpha Back', 'RB'),
  player('beta', 'Beta Back', 'RB'),
  player('gamma', 'Gamma Receiver', 'WR'),
  player('delta', 'Delta Tight', 'TE'),
  // The QB's scrambles count in the team denominator (a carry is a carry).
  player('qb', 'Qb Scrambler', 'QB'),
];

describe('buildRushShareLeaders', () => {
  it('ranks by rush share over the last 3 completed weeks', () => {
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {
      // Team rush attempts/week: 20 (Alpha) + 10 (Beta) + 2 (Gamma) + 3 (QB) = 35.
      alpha: { 5: line(20, 100), 6: line(20, 100), 7: line(20, 100) },
      beta: { 5: line(10, 50), 6: line(10, 50), 7: line(10, 50) },
      gamma: { 5: line(2, 10), 6: line(2, 10), 7: line(2, 10) },
      qb: { 5: line(3, 15), 6: line(3, 15), 7: line(3, 15) },
    };
    const leaders = buildRushShareLeaders({
      poolPlayers: players,
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    const rb = leaders.get('RB')!;
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    // Alpha: 60/105 = 57.1%; Beta: 30/105 = 28.6%.
    expect(rb[0].rushShare).toBe(0.571);
    expect(rb[1].rushShare).toBe(0.286);
    expect(rb[0].rushAttPerGame).toBe(20);
    expect(rb[0].rushYardsPerGame).toBe(100);
    expect(rb[0].games).toBe(3);
    const wr = leaders.get('WR')!;
    // Gamma: 6/105 = 5.7%.
    expect(wr[0].rushShare).toBe(0.057);
  });

  it('requires 2+ games and stays inside the 3-week window', () => {
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {
      // Alpha: only week 7 (one game) — excluded.
      alpha: { 7: line(20, 100) },
      // Beta: weeks 4-7 — week 4 is outside the window, weeks 5-7 count.
      beta: {
        4: line(20, 100),
        5: line(10, 50),
        6: line(10, 50),
        7: line(10, 50),
      },
    };
    const leaders = buildRushShareLeaders({
      poolPlayers: players,
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    const rb = leaders.get('RB')!;
    expect(rb.map(r => r.player.id)).toEqual(['beta']);
    expect(rb[0].games).toBe(3);
    expect(rb[0].rushAttPerGame).toBe(10);
  });

  it('breaks rush-share ties by rushing attempts per game', () => {
    // Two teams: Alpha's team totals 20/week (Alpha 10 = 50%), Beta's team
    // totals 40/week (Beta 20 = 50%) — same share, Beta sees more volume.
    const alphaTeam = player('alpha', 'Alpha Back', 'RB', 'DAL');
    const betaTeam = player('beta', 'Beta Back', 'RB', 'NYG');
    const fillerDal = player('dal-fill', 'Dal Filler', 'WR', 'DAL');
    const fillerNyg = player('nyg-fill', 'Nyg Filler', 'WR', 'NYG');
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {
      alpha: { 5: line(10, 50), 6: line(10, 50), 7: line(10, 50) },
      'dal-fill': { 5: line(10), 6: line(10), 7: line(10) },
      beta: { 5: line(20, 100), 6: line(20, 100), 7: line(20, 100) },
      'nyg-fill': { 5: line(20), 6: line(20), 7: line(20) },
    };
    const leaders = buildRushShareLeaders({
      poolPlayers: [alphaTeam, betaTeam, fillerDal, fillerNyg],
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    const rb = leaders.get('RB')!;
    expect(rb.map(r => r.player.id)).toEqual(['beta', 'alpha']);
    expect(rb[0].rushShare).toBe(rb[1].rushShare);
  });

  it('caps each position at 15 leaders and omits empty positions', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      player(`rb${i}`, `Back ${i}`, 'RB'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    for (let i = 0; i < 20; i++) {
      // Team total grows with every back, so shares differ by construction.
      usage[`rb${i}`] = {
        5: line(20 - i, 100 - i * 5),
        6: line(20 - i, 100 - i * 5),
        7: line(20 - i, 100 - i * 5),
      };
    }
    const leaders = buildRushShareLeaders({
      poolPlayers: many,
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    expect(leaders.get('RB')).toHaveLength(MAX_RUSH_SHARE_LEADERS);
    expect(leaders.has('WR')).toBe(false);
    expect(leaders.has('TE')).toBe(false);
  });

  it('skips players without a team or with no team rushing attempts', () => {
    const noTeam = player('x', 'X Back', 'RB', '');
    const zeroTeam = player('y', 'Y Back', 'RB', 'FA');
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {
      x: { 5: line(20), 6: line(20), 7: line(20) },
      y: { 5: line(0), 6: line(0), 7: line(0) },
    };
    const leaders = buildRushShareLeaders({
      poolPlayers: [noTeam, zeroTeam],
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    expect(leaders.has('RB')).toBe(false);
  });
});
