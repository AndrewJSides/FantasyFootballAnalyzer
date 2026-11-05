// OpportunityLeaders util (backlog item 108): per-position
// opportunity-share leaders over the last 3 completed weeks, ranked by
// share of the player's own NFL team's touches (carries + targets).

import { describe, expect, it } from 'vitest';
import {
  buildOpportunityLeaders,
  MAX_OPPORTUNITY_LEADERS,
} from './opportunityLeaders';
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

function line(targets: number, rushAtt = 0, receptions = 0): WeeklyUsageLine {
  return { offSnaps: 70, teamSnaps: 70, targets, rushAtt, receptions, rzOpps: 0, airYards: 0, deepRec: 0, longRec: 0, yac: 0, recYards: 0 };
}

const players = [
  player('alpha', 'Alpha Back', 'RB'),
  player('beta', 'Beta Back', 'RB'),
  player('gamma', 'Gamma Receiver', 'WR'),
  player('delta', 'Delta Tight', 'TE'),
];

describe('buildOpportunityLeaders', () => {
  it('ranks by opportunity share over the last 3 completed weeks', () => {
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {
      // Team touches/week: Alpha 14 + Beta 7 + Gamma 9 = 30.
      alpha: { 5: line(4, 10), 6: line(4, 10), 7: line(4, 10) },
      beta: { 5: line(2, 5), 6: line(2, 5), 7: line(2, 5) },
      gamma: { 5: line(9), 6: line(9), 7: line(9) },
    };
    const leaders = buildOpportunityLeaders({
      poolPlayers: players,
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    const rb = leaders.get('RB')!;
    expect(rb.map(r => r.player.id)).toEqual(['alpha', 'beta']);
    // Alpha: 42/90 = 46.7%; Beta: 21/90 = 23.3%.
    expect(rb[0].opportunityShare).toBe(0.467);
    expect(rb[1].opportunityShare).toBe(0.233);
    expect(rb[0].touchesPerGame).toBe(14);
    expect(rb[0].carriesPerGame).toBe(10);
    expect(rb[0].targetsPerGame).toBe(4);
    expect(rb[0].games).toBe(3);
    const wr = leaders.get('WR')!;
    expect(wr[0].opportunityShare).toBe(0.3);
  });

  it('requires 2+ games and stays inside the 3-week window', () => {
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {
      // Alpha: only week 7 (one game) — excluded.
      alpha: { 7: line(9, 12) },
      // Beta: weeks 4-7 — week 4 is outside the window, weeks 5-7 count.
      beta: {
        4: line(9, 12),
        5: line(3, 4),
        6: line(3, 4),
        7: line(3, 4),
      },
    };
    const leaders = buildOpportunityLeaders({
      poolPlayers: players,
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    const rb = leaders.get('RB')!;
    expect(rb.map(r => r.player.id)).toEqual(['beta']);
    expect(rb[0].games).toBe(3);
    expect(rb[0].touchesPerGame).toBe(7);
  });

  it('breaks opportunity-share ties by touches per game', () => {
    // Two teams: Alpha's team totals 20 touches/week (Alpha 10 = 50%),
    // Beta's team totals 40/week (Beta 20 = 50%) — same share, Beta sees
    // more volume.
    const alphaTeam = player('alpha', 'Alpha Back', 'RB', 'DAL');
    const betaTeam = player('beta', 'Beta Back', 'RB', 'NYG');
    const fillerDal = player('dal-fill', 'Dal Filler', 'WR', 'DAL');
    const fillerNyg = player('nyg-fill', 'Nyg Filler', 'WR', 'NYG');
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {
      alpha: { 5: line(5, 5), 6: line(5, 5), 7: line(5, 5) },
      'dal-fill': { 5: line(10), 6: line(10), 7: line(10) },
      beta: { 5: line(10, 10), 6: line(10, 10), 7: line(10, 10) },
      'nyg-fill': { 5: line(20), 6: line(20), 7: line(20) },
    };
    const leaders = buildOpportunityLeaders({
      poolPlayers: [alphaTeam, betaTeam, fillerDal, fillerNyg],
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    const rb = leaders.get('RB')!;
    expect(rb.map(r => r.player.id)).toEqual(['beta', 'alpha']);
    expect(rb[0].opportunityShare).toBe(rb[1].opportunityShare);
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
    const leaders = buildOpportunityLeaders({
      poolPlayers: many,
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    expect(leaders.get('RB')).toHaveLength(MAX_OPPORTUNITY_LEADERS);
    expect(leaders.has('WR')).toBe(false);
    expect(leaders.has('TE')).toBe(false);
  });

  it('skips players without a team or with no team touches', () => {
    const noTeam = player('x', 'X Back', 'RB', '');
    const zeroTeam = player('y', 'Y Back', 'RB', 'FA');
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {
      x: { 5: line(9, 12), 6: line(9, 12), 7: line(9, 12) },
      y: { 5: line(0), 6: line(0), 7: line(0) },
    };
    const leaders = buildOpportunityLeaders({
      poolPlayers: [noTeam, zeroTeam],
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    expect(leaders.has('RB')).toBe(false);
  });
});
