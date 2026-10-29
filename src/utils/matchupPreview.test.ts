// matchupPreview: weekly matchup projections + win probabilities.

import { describe, it, expect } from 'vitest';
import type { League, Player, Team, WeeklyMatchup } from '@/types';
import {
  previewWeeklyMatchups,
  projectTeamScore,
  winProbFromProjDiff,
} from './matchupPreview';

function player(
  id: string,
  name: string,
  position: string,
  nflTeam: string,
  seasonPoints?: number,
): Player {
  return { id, platformId: id, name, position, team: nflTeam, seasonPoints } as Player;
}

// Steady ~12 pts/week across completed weeks 1-7.
function steady(pts: number): Record<number, number> {
  const w: Record<number, number> = {};
  for (let week = 1; week <= 7; week++) w[week] = pts;
  return w;
}

const QB = () => player('qb1', 'Test Quarterback', 'QB', 'KC');
const RB = () => player('rb1', 'Test Runner', 'RB', 'SF');
const RB2 = () => player('rb2', 'Test Runner Two', 'RB', 'BUF');
const WR = () => player('wr1', 'Test Wideout', 'WR', 'DAL');
const WR2 = () => player('wr2', 'Test Wideout Two', 'WR', 'CIN');
const TE = () => player('te1', 'Test Tightend', 'TE', 'KC');

function team(id: string, roster: Player[]): Team {
  return { id, name: `Team ${id}`, roster } as Team;
}

function matchup(week: number, a: string, b: string): WeeklyMatchup {
  return { week, team1Id: a, team1Points: 0, team2Id: b, team2Points: 0 };
}

function league(overrides: Partial<League> = {}): League {
  const rosterA = [QB(), RB(), RB2(), WR(), WR2(), TE()];
  const rosterB = [QB(), RB(), RB2(), WR(), WR2(), TE()];
  return {
    id: 'test',
    name: 'Test League',
    platform: 'sleeper',
    season: 2026,
    draftType: 'snake',
    scoringType: 'ppr',
    totalTeams: 2,
    isLoaded: true,
    teams: [team('A', rosterA), team('B', rosterB)],
    currentWeek: 8,
    futureSchedule: [matchup(8, 'A', 'B')],
    playerWeeklyPoints: {
      qb1: steady(20),
      rb1: steady(12),
      rb2: steady(10),
      wr1: steady(11),
      wr2: steady(9),
      te1: steady(8),
    },
    ...overrides,
  } as League;
}

describe('winProbFromProjDiff', () => {
  it('is 50% for a dead-even projection', () => {
    expect(winProbFromProjDiff(0)).toBeCloseTo(0.5, 6);
  });

  it('gives ~91% for a 30-point gap, symmetric for underdogs', () => {
    expect(winProbFromProjDiff(30)).toBeGreaterThan(0.9);
    expect(winProbFromProjDiff(-30)).toBeCloseTo(1 - winProbFromProjDiff(30), 6);
  });
});

describe('projectTeamScore', () => {
  it('scores the optimal lineup, not the whole roster', () => {
    const l = league();
    const p = projectTeamScore(l.teams[0], l);
    expect(p).not.toBeNull();
    // 6 players fill 6 slots (QB/RB/WR/TE + 2 flex-eligibles): 20/12/10/11/9/8
    // steady weekly points, so the optimal lineup sums to ~70 before the
    // small matchup blend — well above any single player's average.
    expect(p!.projectedScore).toBeGreaterThan(60);
    expect(p!.starters).toBe(6);
  });

  it('returns null for a team with no roster', () => {
    const l = league();
    expect(projectTeamScore(team('C', []), l)).toBeNull();
    expect(projectTeamScore({ id: 'D', name: 'No Roster' } as Team, l)).toBeNull();
  });
});

describe('previewWeeklyMatchups', () => {
  it('returns a 50/50 preview for identical rosters', () => {
    const [p] = previewWeeklyMatchups(league());
    expect(p.week).toBe(8);
    expect(p.teamAId).toBe('A');
    expect(p.teamBId).toBe('B');
    expect(p.projA).toBeCloseTo(p.projB, 6);
    expect(p.winProbA).toBeCloseTo(50, 0);
  });

  it('favors the stronger team and keeps probabilities complementary', () => {
    const l = league({
      teams: [
        team('A', [player('aqb', 'A Qb', 'QB', 'KC'), player('arb', 'A Rb', 'RB', 'SF'), player('arb2', 'A Rb2', 'RB', 'BUF'), player('awr', 'A Wr', 'WR', 'DAL'), player('awr2', 'A Wr2', 'WR', 'CIN'), player('ate', 'A Te', 'TE', 'KC')]),
        team('B', [player('bqb', 'B Qb', 'QB', 'KC'), player('brb', 'B Rb', 'RB', 'SF'), player('brb2', 'B Rb2', 'RB', 'BUF'), player('bwr', 'B Wr', 'WR', 'DAL'), player('bwr2', 'B Wr2', 'WR', 'CIN'), player('bte', 'B Te', 'TE', 'KC')]),
      ],
      playerWeeklyPoints: {
        aqb: steady(15), arb: steady(8), arb2: steady(7), awr: steady(8), awr2: steady(7), ate: steady(5),
        bqb: steady(25), brb: steady(20), brb2: steady(18), bwr: steady(19), bwr2: steady(16), bte: steady(14),
      },
    });
    const [p] = previewWeeklyMatchups(l);
    expect(p.projB).toBeGreaterThan(p.projA);
    expect(p.winProbA).toBeLessThan(50);
    // Team B's probability is the complement of team A's.
    expect(100 - p.winProbA).toBeGreaterThan(50);
  });

  it('returns [] without a future schedule or current week', () => {
    expect(previewWeeklyMatchups(league({ futureSchedule: undefined }))).toEqual([]);
    expect(previewWeeklyMatchups(league({ currentWeek: undefined }))).toEqual([]);
  });

  it('only previews current-week matchups', () => {
    const l = league({
      futureSchedule: [matchup(8, 'A', 'B'), matchup(9, 'A', 'B')],
    });
    const previews = previewWeeklyMatchups(l);
    expect(previews).toHaveLength(1);
    expect(previews[0].week).toBe(8);
  });

  it('skips matchups where a team has no pricing data', () => {
    // No weekly points and no season points anywhere: every player scores
    // zero, so the matchup carries no signal and is skipped.
    const l = league({ playerWeeklyPoints: {} });
    expect(previewWeeklyMatchups(l)).toEqual([]);
  });

  it('skips teams with no roster', () => {
    const l = league({ teams: [team('A', [QB()]), team('B', [])] });
    expect(previewWeeklyMatchups(l)).toEqual([]);
  });
});
