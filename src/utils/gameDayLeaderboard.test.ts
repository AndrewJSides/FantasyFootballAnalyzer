// Game Day Live Leaderboard (backlog item 171): league-wide live
// ranking + top live scorers, built on the live-matchup engine.

import { describe, it, expect } from 'vitest';
import type { League, Team, WeeklyMatchup } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import type { WeekPprStats } from '@/api/sleeperWeeklyPoints';
import {
  buildGameDayBoard,
  topLiveScorersFromStats,
} from './gameDayLeaderboard';

function team(
  id: string,
  name: string,
  rosterIds: string[],
  isMyTeam: boolean,
): Team {
  return {
    id,
    name,
    isMyTeam,
    roster: rosterIds.map(rid => ({
      id: rid,
      platformId: `sl-${rid}`,
      name: rid,
      position: rid.replace(/[0-9]+$/, ''),
      team: 'FA',
    })),
  } as Team;
}

function weekly(
  entries: Record<string, number[]>,
): Record<string, Record<number, number>> {
  const out: Record<string, Record<number, number>> = {};
  for (const [id, scores] of Object.entries(entries)) {
    out[id] = {};
    scores.forEach((s, i) => {
      out[id][i + 1] = s;
    });
  }
  return out;
}

function league(bScores?: number[]): League {
  const teams = [
    team('a', 'Team A', ['QB1', 'RB1', 'RB2', 'WR1', 'WR2', 'TE1'], true),
    team('b', 'Team B', ['QB2', 'RB3', 'RB4', 'WR3', 'WR4', 'TE2'], false),
  ];
  const scores: Record<string, number[]> = {};
  for (const t of teams) {
    for (const p of t.roster!) {
      scores[p.platformId] =
        p.id.startsWith('QB2') || t.id === 'b'
          ? (bScores ?? [14, 16, 18, 15, 17, 19, 16])
          : [14, 16, 18, 15, 17, 19, 16];
    }
  }
  return {
    id: 'test',
    name: 'Test League',
    platform: 'sleeper',
    season: 2026,
    currentWeek: 8,
    totalTeams: teams.length,
    rosterSlots: {
      QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, K: 0, DST: 0, BENCH: 6, IR: 1,
    },
    scoringType: 'ppr',
    teams,
    playerWeeklyPoints: weekly(scores),
    futureSchedule: [{ week: 8, team1Id: 'a', team2Id: 'b' } as WeeklyMatchup],
  } as League;
}

function weekStats(points: Record<string, number>, week = 8): WeekPprStats {
  return {
    season: 2026,
    week,
    pointsBySleeperId: points,
    playedSleeperIds: new Set(Object.keys(points)),
    tdPtsBySleeperId: {},
    usageBySleeperId: {},
  };
}

describe('buildGameDayBoard', () => {
  it('ranks teams by banked live points with complementary win probabilities', () => {
    const board = buildGameDayBoard(
      league(),
      weekStats({ 'sl-QB1': 30, 'sl-RB3': 2 }),
    );
    expect(board).not.toBeNull();
    expect(board!.week).toBe(8);
    expect(board!.anyPlayed).toBe(true);
    expect(board!.teams[0].teamName).toBe('Team A');
    expect(board!.teams[0].actualSoFar).toBe(30);
    expect(board!.teams[0].opponentName).toBe('Team B');
    expect(board!.teams[1].teamName).toBe('Team B');
    expect(board!.teams[1].actualSoFar).toBe(2);
    expect(board!.teams[0].rank).toBe(1);
    expect(board!.teams[1].rank).toBe(2);
    expect(board!.teams[0].winProb + board!.teams[1].winProb).toBe(100);
    expect(board!.teams[0].played).toBe(1);
    expect(board!.topScorers).toEqual([
      { name: 'QB1', position: 'QB', nflTeam: null, fantasyTeam: 'Team A', points: 30 },
      { name: 'RB3', position: 'RB', nflTeam: null, fantasyTeam: 'Team B', points: 2 },
    ]);
  });

  it('ranks by projected final before kickoff and reports no scorers', () => {
    const board = buildGameDayBoard(league(), weekStats({}));
    expect(board).not.toBeNull();
    expect(board!.anyPlayed).toBe(false);
    expect(board!.topScorers).toEqual([]);
    // Identical weekly series → identical projected finals → name order.
    expect(board!.teams[0].teamName).toBe('Team A');
    expect(board!.teams[0].projectedFinal).toBeGreaterThan(0);
    expect(board!.teams[0].actualSoFar).toBe(0);
  });

  it('breaks a live-points tie on the projected final', () => {
    const board = buildGameDayBoard(
      league([20, 22, 24, 21, 23, 25, 22]),
      weekStats({ 'sl-QB1': 20, 'sl-QB2': 20 }),
    );
    expect(board).not.toBeNull();
    // Team B prices higher on the stronger weekly series, so it wins
    // the tie despite the identical 20 banked points.
    expect(board!.teams[0].teamName).toBe('Team B');
    expect(board!.teams[0].actualSoFar).toBe(20);
    expect(board!.teams[1].actualSoFar).toBe(20);
  });

  it('returns null when the stats are for another week', () => {
    expect(
      buildGameDayBoard(league(), weekStats({ 'sl-QB1': 30 }, 9)),
    ).toBeNull();
  });
});

describe('topLiveScorersFromStats', () => {
  const pool = [
    { name: 'Alpha', pos: 'WR', team: 'FA', sleeperId: 'sl-alpha' },
    { name: 'Beta', pos: 'RB', team: 'FA', sleeperId: 'sl-beta' },
    { name: 'Gamma', pos: 'QB', team: 'FA', sleeperId: 'sl-gamma' },
    { name: 'Delta', pos: 'TE', team: 'FA' },
    { name: 'Epsilon', pos: 'WR', team: 'FA', sleeperId: 'sl-epsilon' },
  ] as PoolPlayer[];

  it('ranks played pool players by live points, ties by name, and respects the limit', () => {
    const stats = weekStats({
      'sl-alpha': 12,
      'sl-beta': 12,
      'sl-gamma': 25,
      'sl-epsilon': 4,
    });
    const out = topLiveScorersFromStats(stats, pool, 3);
    expect(out).toEqual([
      { name: 'Gamma', position: 'QB', nflTeam: 'FA', fantasyTeam: null, points: 25 },
      { name: 'Alpha', position: 'WR', nflTeam: 'FA', fantasyTeam: null, points: 12 },
      { name: 'Beta', position: 'RB', nflTeam: 'FA', fantasyTeam: null, points: 12 },
    ]);
  });

  it('skips players without a Sleeper id and players who have not played', () => {
    // Delta has no sleeperId; Epsilon has one but no stat line.
    const stats = weekStats({ 'sl-alpha': 9 });
    expect(topLiveScorersFromStats(stats, pool)).toEqual([
      { name: 'Alpha', position: 'WR', nflTeam: 'FA', fantasyTeam: null, points: 9 },
    ]);
  });
});
