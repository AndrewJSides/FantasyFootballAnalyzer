// TargetLeaders util (backlog item 107): per-position target-share
// leaders over the last 3 completed weeks, ranked by share of the
// player's own NFL team's targets.

import { describe, expect, it } from 'vitest';
import {
  buildTargetLeaders,
  MAX_TARGET_LEADERS,
} from './targetLeaders';
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

function line(targets: number, receptions = 0): WeeklyUsageLine {
  return { offSnaps: 70, teamSnaps: 70, targets, rushAtt: 0, receptions, rzOpps: 0, airYards: 0, deepRec: 0, longRec: 0, yac: 0, recYards: 0, rushYards: 0, rushTd: 0, recTd: 0, passYards: 0, passTd: 0, passAtt: 0, passCmp: 0, rushFd: 0, recFd: 0, ptsPpr: 0, ptsPpr: 0 };
}

const players = [
  player('alpha', 'Alpha Back', 'RB'),
  player('beta', 'Beta Back', 'RB'),
  player('gamma', 'Gamma Receiver', 'WR'),
  player('delta', 'Delta Tight', 'TE'),
];

describe('buildTargetLeaders', () => {
  it('ranks by target share over the last 3 completed weeks', () => {
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {
      // Team targets/week: 4 (Alpha) + 2 (Beta) + 9 (Gamma) = 15.
      alpha: { 5: line(4, 3), 6: line(4, 3), 7: line(4, 3) },
      beta: { 5: line(2, 1), 6: line(2, 1), 7: line(2, 1) },
      gamma: { 5: line(9, 7), 6: line(9, 7), 7: line(9, 7) },
    };
    const leaders = buildTargetLeaders({
      poolPlayers: players,
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    const rb = leaders.get('RB')!;
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    // Alpha: 12/45 = 26.7%; Beta: 6/45 = 13.3%.
    expect(rb[0].targetShare).toBe(0.267);
    expect(rb[1].targetShare).toBe(0.133);
    expect(rb[0].targetsPerGame).toBe(4);
    expect(rb[0].receptionsPerGame).toBe(3);
    expect(rb[0].games).toBe(3);
    const wr = leaders.get('WR')!;
    expect(wr[0].targetShare).toBe(0.6);
  });

  it('requires 2+ games and stays inside the 3-week window', () => {
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {
      // Alpha: only week 7 (one game) — excluded.
      alpha: { 7: line(9, 7) },
      // Beta: weeks 4-7 — week 4 is outside the window, weeks 5-7 count.
      beta: {
        4: line(9, 7),
        5: line(3, 2),
        6: line(3, 2),
        7: line(3, 2),
      },
    };
    const leaders = buildTargetLeaders({
      poolPlayers: players,
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    const rb = leaders.get('RB')!;
    expect(rb.map(r => r.player.id)).toEqual(['beta']);
    expect(rb[0].games).toBe(3);
    expect(rb[0].targetsPerGame).toBe(3);
  });

  it('breaks target-share ties by targets per game', () => {
    // Two teams: Alpha's team totals 10/week (Alpha 5 = 50%), Beta's team
    // totals 20/week (Beta 10 = 50%) — same share, Beta sees more volume.
    const alphaTeam = player('alpha', 'Alpha Back', 'RB', 'DAL');
    const betaTeam = player('beta', 'Beta Back', 'RB', 'NYG');
    const fillerDal = player('dal-fill', 'Dal Filler', 'WR', 'DAL');
    const fillerNyg = player('nyg-fill', 'Nyg Filler', 'WR', 'NYG');
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {
      alpha: { 5: line(5, 4), 6: line(5, 4), 7: line(5, 4) },
      'dal-fill': { 5: line(5), 6: line(5), 7: line(5) },
      beta: { 5: line(10, 8), 6: line(10, 8), 7: line(10, 8) },
      'nyg-fill': { 5: line(10), 6: line(10), 7: line(10) },
    };
    const leaders = buildTargetLeaders({
      poolPlayers: [alphaTeam, betaTeam, fillerDal, fillerNyg],
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    const rb = leaders.get('RB')!;
    expect(rb.map(r => r.player.id)).toEqual(['beta', 'alpha']);
    expect(rb[0].targetShare).toBe(rb[1].targetShare);
  });

  it('caps each position at 15 leaders and omits empty positions', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      player(`rb${i}`, `Back ${i}`, 'RB'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    for (let i = 0; i < 20; i++) {
      // Team total grows with every back, so shares differ by construction.
      usage[`rb${i}`] = {
        5: line(20 - i),
        6: line(20 - i),
        7: line(20 - i),
      };
    }
    const leaders = buildTargetLeaders({
      poolPlayers: many,
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    expect(leaders.get('RB')).toHaveLength(MAX_TARGET_LEADERS);
    expect(leaders.has('WR')).toBe(false);
    expect(leaders.has('TE')).toBe(false);
  });

  it('skips players without a team or with no team targets', () => {
    const noTeam = player('x', 'X Back', 'RB', '');
    const zeroTeam = player('y', 'Y Back', 'RB', 'FA');
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {
      x: { 5: line(9), 6: line(9), 7: line(9) },
      y: { 5: line(0), 6: line(0), 7: line(0) },
    };
    const leaders = buildTargetLeaders({
      poolPlayers: [noTeam, zeroTeam],
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    expect(leaders.has('RB')).toBe(false);
  });
});
