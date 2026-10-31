import { describe, expect, it } from 'vitest';

import type { League, Team } from '@/types';
import { buildAllPlayRecord, formatRecord } from './allPlayRecord';

const team = (id: string, name: string, wins?: number, losses?: number, ties?: number): Team => ({
  id,
  name,
  wins,
  losses,
  ties,
});

const leagueWith = (
  teams: Team[],
  matchups: League['matchups'],
  status: League['status'] = 'live',
  currentWeek = 8,
): Pick<League, 'matchups' | 'status' | 'currentWeek' | 'teams'> => ({
  teams,
  matchups,
  status,
  currentWeek,
});

describe('buildAllPlayRecord', () => {
  it('credits every opponent beaten in the same week as a win', () => {
    const teams = [team('a', 'A', 1, 0), team('b', 'B', 0, 1), team('c', 'C', 0, 1)];
    const rows = buildAllPlayRecord(
      leagueWith(teams, [{ week: 7, team1Id: 'a', team1Points: 130, team2Id: 'b', team2Points: 100 }]),
    );
    const a = rows.find(r => r.teamId === 'a')!;
    // One completed week: A beat B (1-0), C had no game so is absent.
    expect(a.weeks).toBe(1);
    expect(a.allWins).toBe(1);
    expect(a.allLosses).toBe(0);
    expect(a.allPlayPct).toBe(100);
    expect(rows.find(r => r.teamId === 'c')).toBeUndefined();
  });

  it('counts all-play games across opponents, not just the real matchup', () => {
    const teams = [team('a', 'A', 1, 0), team('b', 'B', 0, 1), team('c', 'C', 0, 0)];
    const rows = buildAllPlayRecord(
      leagueWith(teams, [
        { week: 7, team1Id: 'a', team1Points: 100, team2Id: 'b', team2Points: 120 },
        { week: 7, team1Id: 'c', team1Points: 110, team2Id: 'a', team2Points: 100 },
      ]),
    );
    // A scored 100 twice: beat nobody in week 7 (lost to B 120, to C 110).
    const a = rows.find(r => r.teamId === 'a')!;
    expect(a.allWins).toBe(0);
    expect(a.allLosses).toBe(2);
  });

  it('counts equal scores as ties for both sides', () => {
    const teams = [team('a', 'A', 0, 0, 1), team('b', 'B', 0, 0, 1)];
    const rows = buildAllPlayRecord(
      leagueWith(teams, [{ week: 7, team1Id: 'a', team1Points: 100, team2Id: 'b', team2Points: 100 }]),
    );
    const a = rows.find(r => r.teamId === 'a')!;
    expect(a.allWins).toBe(0);
    expect(a.allTies).toBe(1);
    expect(a.allPlayPct).toBe(50);
  });

  it('excludes the live current week like completedMatchups', () => {
    const teams = [team('a', 'A'), team('b', 'B')];
    const rows = buildAllPlayRecord(
      leagueWith(teams, [{ week: 8, team1Id: 'a', team1Points: 130, team2Id: 'b', team2Points: 90 }], 'live', 8),
    );
    expect(rows).toEqual([]);
  });

  it('ranks by all-play pct and prices schedule luck vs the actual record', () => {
    const teams = [
      team('lucky', 'Lucky', 2, 0),
      team('unlucky', 'Unlucky', 0, 2),
    ];
    const rows = buildAllPlayRecord(
      leagueWith(teams, [
        { week: 6, team1Id: 'lucky', team1Points: 95, team2Id: 'unlucky', team2Points: 120 },
        { week: 7, team1Id: 'lucky', team1Points: 96, team2Id: 'unlucky', team2Points: 118 },
      ]),
    );
    // Unlucky outscored Lucky both weeks (higher all-play pct) but is 0-2.
    expect(rows[0].teamId).toBe('unlucky');
    expect(rows[0].allPlayPct).toBe(100);
    expect(rows[0].luckDiff).toBe(-100);
    expect(rows[1].teamId).toBe('lucky');
    expect(rows[1].luckDiff).toBe(100);
  });

  it('leaves the record blank when the sync reported no wins/losses', () => {
    const teams = [team('a', 'A'), team('b', 'B')];
    const rows = buildAllPlayRecord(
      leagueWith(teams, [{ week: 7, team1Id: 'a', team1Points: 100, team2Id: 'b', team2Points: 90 }]),
    );
    expect(rows[0].actualPct).toBeNull();
    expect(rows[0].luckDiff).toBeNull();
  });

  it('returns [] when no matchups are synced', () => {
    expect(buildAllPlayRecord(leagueWith([team('a', 'A')], []))).toEqual([]);
  });
});

describe('formatRecord', () => {
  it('formats W-L and W-L-T, dash when unknown', () => {
    expect(formatRecord(5, 2, 0)).toBe('5-2');
    expect(formatRecord(5, 2, 1)).toBe('5-2-1');
    expect(formatRecord(null, 2, 0)).toBe('—');
  });
});
