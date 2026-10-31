import { describe, expect, it } from 'vitest';

import type { League, Team, WeeklyMatchup } from '@/types';
import { buildRecordBook } from './recordBook';

const team = (id: string, name: string): Team => ({ id, name });

const leagueWith = (
  teams: Team[],
  matchups: WeeklyMatchup[],
  status: League['status'] = 'live',
  currentWeek = 5,
): Pick<League, 'matchups' | 'status' | 'currentWeek' | 'teams'> => ({
  teams,
  matchups,
  status,
  currentWeek,
});

const m = (
  week: number,
  a: string,
  aPts: number,
  b: string,
  bPts: number,
): WeeklyMatchup => ({
  week,
  team1Id: a,
  team1Points: aPts,
  team2Id: b,
  team2Points: bPts,
});

const teams = [team('a', 'Alpha'), team('b', 'Beta'), team('c', 'Gamma'), team('d', 'Delta')];

const matchups: WeeklyMatchup[] = [
  // W1
  m(1, 'a', 150, 'b', 100),
  m(1, 'c', 120, 'd', 110),
  // W2
  m(2, 'a', 160, 'c', 90),
  m(2, 'b', 105, 'd', 104.5),
  // W3
  m(3, 'a', 130, 'd', 129),
  m(3, 'b', 80, 'c', 140),
  // W4
  m(4, 'a', 170, 'b', 60),
  m(4, 'c', 115, 'd', 115),
];

describe('buildRecordBook', () => {
  it('returns null with no completed matchups', () => {
    expect(buildRecordBook(leagueWith(teams, []))).toBeNull();
  });

  it('finds the highest and lowest single-week scores', () => {
    const book = buildRecordBook(leagueWith(teams, matchups))!;
    expect(book.highestWeek).toMatchObject({ teamId: 'a', teamName: 'Alpha', week: 4, points: 170 });
    expect(book.lowestWeek).toMatchObject({ teamId: 'b', teamName: 'Beta', week: 4, points: 60 });
  });

  it('finds the biggest blowout and the closest game', () => {
    const book = buildRecordBook(leagueWith(teams, matchups))!;
    expect(book.biggestBlowout).toMatchObject({
      week: 4,
      winnerName: 'Alpha',
      loserName: 'Beta',
      margin: 110,
      tie: false,
    });
    // The W4 c-vs-d tie is the closest game at 0 margin.
    expect(book.closestGame).toMatchObject({
      week: 4,
      margin: 0,
      tie: true,
    });
  });

  it('finds the longest win and losing streaks', () => {
    const book = buildRecordBook(leagueWith(teams, matchups))!;
    // Alpha won W1, W2, W3, W4: a 4-game streak.
    expect(book.longestWinStreak).toMatchObject({
      teamId: 'a',
      teamName: 'Alpha',
      length: 4,
      fromWeek: 1,
      toWeek: 4,
    });
    // Beta: W1 loss, W2 win (105-104.5), W3 loss, W4 loss -> longest loss
    // streak 2. Delta: W1 loss, W2 loss, W3 loss, W4 tie -> 3-game streak.
    expect(book.longestLossStreak).toMatchObject({
      teamId: 'd',
      teamName: 'Delta',
      length: 3,
      fromWeek: 1,
      toWeek: 3,
    });
  });

  it('breaks streaks on ties', () => {
    // Gamma: W1 win, W2 loss, W3 win, W4 tie -> longest win streak 1.
    const book = buildRecordBook(leagueWith(teams, matchups))!;
    const gammaSeq = book.longestWinStreak.teamId;
    expect(gammaSeq).toBe('a');
  });

  it('excludes the live current week', () => {
    const liveWeek: WeeklyMatchup[] = [
      ...matchups,
      m(5, 'b', 999, 'd', 1),
    ];
    const book = buildRecordBook(leagueWith(teams, liveWeek, 'live', 5))!;
    expect(book.highestWeek.points).toBe(170);
    expect(book.biggestBlowout.margin).toBe(110);
  });

  it('counts completed weeks for the footnote', () => {
    const book = buildRecordBook(leagueWith(teams, matchups))!;
    expect(book.weeks).toBe(4);
  });
});
