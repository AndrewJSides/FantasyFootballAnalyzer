import { beforeEach, describe, expect, it } from 'vitest';
import type { League, Team } from '@/types';
import { getPlayoffRace, __resetPlayoffRaceCache } from './sharedPlayoffRace';

function team(id: string, wins: number, pointsFor: number): Team {
  return { id, name: id, wins, losses: 0, ties: 0, pointsFor } as Team;
}

function league(teams: Team[], schedule: { week: number; team1Id: string; team2Id: string }[]): League {
  return {
    teams,
    futureSchedule: schedule,
    playoffTeams: 1,
    currentWeek: 9,
  } as League;
}

beforeEach(() => __resetPlayoffRaceCache());

describe('getPlayoffRace', () => {
  it('returns the same array for the same league snapshot (one sim run)', () => {
    const l = league(
      [team('A', 6, 900), team('B', 3, 700)],
      [{ week: 9, team1Id: 'A', team2Id: 'B' }],
    );
    expect(getPlayoffRace(l)).toBe(getPlayoffRace(l));
  });

  it('returns the same empty array for a league with no future schedule', () => {
    const l = league([team('A', 6, 900), team('B', 3, 700)], []);
    const race = getPlayoffRace(l);
    expect(race).toEqual([]);
    expect(getPlayoffRace(l)).toBe(race);
  });

  it('re-sims when a team record changes', () => {
    const l = league(
      [team('A', 6, 900), team('B', 3, 700)],
      [{ week: 9, team1Id: 'A', team2Id: 'B' }],
    );
    const first = getPlayoffRace(l);
    const changed = league(
      [team('A', 5, 900), team('B', 3, 700)],
      [{ week: 9, team1Id: 'A', team2Id: 'B' }],
    );
    const second = getPlayoffRace(changed);
    expect(second).not.toBe(first);
    expect(second.find(e => e.teamId === 'A')?.wins).toBe(5);
  });

  it('re-sims when the future schedule changes', () => {
    const l = league(
      [team('A', 6, 900), team('B', 3, 700)],
      [{ week: 9, team1Id: 'A', team2Id: 'B' }],
    );
    const first = getPlayoffRace(l);
    const changed = league(
      [team('A', 6, 900), team('B', 3, 700)],
      [
        { week: 9, team1Id: 'A', team2Id: 'B' },
        { week: 10, team1Id: 'A', team2Id: 'B' },
      ],
    );
    expect(getPlayoffRace(changed)).not.toBe(first);
  });

  it('re-sims when a team name changes, so the shared entries stay fresh', () => {
    const l = league(
      [team('A', 6, 900), team('B', 3, 700)],
      [{ week: 9, team1Id: 'A', team2Id: 'B' }],
    );
    const first = getPlayoffRace(l);
    const renamed = league(
      [{ ...team('A', 6, 900), name: 'Renamed' }, team('B', 3, 700)],
      [{ week: 9, team1Id: 'A', team2Id: 'B' }],
    );
    const second = getPlayoffRace(renamed);
    expect(second).not.toBe(first);
    expect(second.find(e => e.teamId === 'A')?.teamName).toBe('Renamed');
  });
});
