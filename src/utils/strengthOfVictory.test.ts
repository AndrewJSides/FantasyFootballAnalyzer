import { describe, expect, it } from 'vitest';

import type { League, Team } from '@/types';
import { buildStrengthOfVictory } from './strengthOfVictory';

const team = (id: string, name: string): Team => ({ id, name });

const leagueWith = (
  teams: Team[],
  matchups: League['matchups'],
  status: League['status'] = 'live',
  currentWeek = 9,
): Pick<League, 'matchups' | 'status' | 'currentWeek' | 'teams'> => ({
  teams,
  matchups,
  status,
  currentWeek,
});

describe('buildStrengthOfVictory', () => {
  it('averages the defeated opponents’ win % (repeat wins count twice)', () => {
    // Week 7: A beats B, C beats D. Week 8: A beats C, B beats D.
    // Records: A 2-0, B 1-1, C 1-1, D 0-2.
    const teams = [team('a', 'Alpha'), team('b', 'Beta'), team('c', 'Gamma'), team('d', 'Delta')];
    const rows = buildStrengthOfVictory(
      leagueWith(teams, [
        { week: 7, team1Id: 'a', team1Points: 130, team2Id: 'b', team2Points: 90 },
        { week: 7, team1Id: 'c', team1Points: 110, team2Id: 'd', team2Points: 100 },
        { week: 8, team1Id: 'a', team1Points: 120, team2Id: 'c', team2Points: 110 },
        { week: 8, team1Id: 'b', team1Points: 115, team2Id: 'd', team2Points: 105 },
      ]),
    );
    // A beat B (50%) and C (50%) → 50%.
    expect(rows.find(r => r.teamId === 'a')!.sovPct).toBe(50);
    expect(rows.find(r => r.teamId === 'a')!.verdict).toBe('balanced');
    // B beat only D (0%) → 0% → soft schedule.
    expect(rows.find(r => r.teamId === 'b')!.sovPct).toBe(0);
    expect(rows.find(r => r.teamId === 'b')!.verdict).toBe('soft');
    // C beat only D (0%) → 0%.
    expect(rows.find(r => r.teamId === 'c')!.sovPct).toBe(0);
    // D has no wins → null.
    const d = rows.find(r => r.teamId === 'd')!;
    expect(d.sovPct).toBeNull();
    expect(d.verdict).toBe('none');
  });

  it('counts beating the same opponent twice as two quality data points', () => {
    // A beats B twice; B beats C once. Records: A 2-0, B 1-2 (33.3%), C 0-1.
    const teams = [team('a', 'Alpha'), team('b', 'Beta'), team('c', 'Gamma')];
    const rows = buildStrengthOfVictory(
      leagueWith(teams, [
        { week: 7, team1Id: 'a', team1Points: 130, team2Id: 'b', team2Points: 90 },
        { week: 8, team1Id: 'a', team1Points: 120, team2Id: 'b', team2Points: 110 },
        { week: 8, team1Id: 'b', team1Points: 115, team2Id: 'c', team2Points: 105 },
      ]),
    );
    // A beat B (33.3%) twice → 33.3% with 2 counted wins.
    const a = rows.find(r => r.teamId === 'a')!;
    expect(a.sovPct).toBe(33.3);
    expect(a.wins).toBe(2);
    // B beat C (0%) → 0%.
    expect(rows.find(r => r.teamId === 'b')!.sovPct).toBe(0);
  });

  it('counts ties as half-wins in the defeated opponent’s record', () => {
    // Week 7: A beats B. Week 8: B ties C. Records: A 1-0, B 0-1-1 (25%), C 0-0-1.
    const teams = [team('a', 'Alpha'), team('b', 'Beta'), team('c', 'Gamma')];
    const rows = buildStrengthOfVictory(
      leagueWith(teams, [
        { week: 7, team1Id: 'a', team1Points: 130, team2Id: 'b', team2Points: 90 },
        { week: 8, team1Id: 'b', team1Points: 100, team2Id: 'c', team2Points: 100 },
      ]),
    );
    expect(rows.find(r => r.teamId === 'a')!.sovPct).toBe(25);
  });

  it('flags quality wins at 55%+ and names the combined beaten-opponent record', () => {
    // A beats B and C, who each went 2-1 (their only loss: to A) → SOV 66.7, quality.
    const teams = [
      team('a', 'Alpha'),
      team('b', 'Beta'),
      team('c', 'Gamma'),
      team('d', 'Delta'),
      team('e', 'Echo'),
    ];
    const rows = buildStrengthOfVictory(
      leagueWith(teams, [
        { week: 6, team1Id: 'b', team1Points: 120, team2Id: 'd', team2Points: 100 },
        { week: 6, team1Id: 'c', team1Points: 120, team2Id: 'e', team2Points: 100 },
        { week: 7, team1Id: 'b', team1Points: 120, team2Id: 'e', team2Points: 100 },
        { week: 7, team1Id: 'c', team1Points: 120, team2Id: 'd', team2Points: 100 },
        { week: 8, team1Id: 'a', team1Points: 130, team2Id: 'b', team2Points: 110 },
        { week: 8, team1Id: 'a', team1Points: 130, team2Id: 'c', team2Points: 110 },
      ]),
    );
    const a = rows.find(r => r.teamId === 'a')!;
    expect(a.sovPct).toBe(66.7);
    expect(a.verdict).toBe('quality');
    expect(a.opponentsCombined).toBe('4-2');
  });

  it('ranks by SOV with winless teams last', () => {
    const teams = [team('a', 'Alpha'), team('b', 'Beta')];
    const rows = buildStrengthOfVictory(
      leagueWith(teams, [{ week: 7, team1Id: 'a', team1Points: 100, team2Id: 'b', team2Points: 90 }]),
    );
    // A beat B (0%) → 0% SOV; B winless → null sorts last.
    expect(rows.map(r => r.teamId)).toEqual(['a', 'b']);
  });

  it('excludes the live current week like completedMatchups', () => {
    const teams = [team('a', 'Alpha'), team('b', 'Beta')];
    const rows = buildStrengthOfVictory(
      leagueWith(teams, [{ week: 9, team1Id: 'a', team1Points: 999, team2Id: 'b', team2Points: 1 }], 'live', 9),
    );
    expect(rows).toEqual([]);
  });

  it('returns [] when no matchups are synced', () => {
    expect(buildStrengthOfVictory(leagueWith([team('a', 'Alpha')], []))).toEqual([]);
  });
});
