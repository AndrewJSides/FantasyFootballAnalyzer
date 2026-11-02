import { describe, it, expect } from 'vitest';
import type { League, Team, WeeklyMatchup } from '@/types';
import { buildRivalryMatrix } from './rivalryMatrix';

function team(id: string, name: string): Team {
  return { id, name, wins: 0, losses: 0, ties: 0, pointsFor: 0 } as Team;
}

function league(
  teams: Team[],
  matchups: WeeklyMatchup[],
  live = true,
): League {
  return {
    id: 'test',
    name: 'Test League',
    platform: 'yahoo',
    season: 2026,
    draftType: 'snake',
    scoringType: 'ppr',
    totalTeams: teams.length,
    isLoaded: true,
    teams,
    matchups,
    currentWeek: 9,
    status: live ? 'live' : 'complete',
  } as League;
}

describe('buildRivalryMatrix', () => {
  it('counts wins, losses, and ties per pair from completed weeks', () => {
    const teams = [team('A', 'Alpha'), team('B', 'Beta'), team('C', 'Gamma')];
    const m = buildRivalryMatrix(
      league(teams, [
        // Alpha beats Beta twice (home and away rows of the same pairing).
        { week: 6, team1Id: 'A', team1Points: 120, team2Id: 'B', team2Points: 90 },
        { week: 7, team1Id: 'B', team1Points: 100, team2Id: 'A', team2Points: 130 },
        // A tie counts, and teams that never met stay at zero games.
        { week: 8, team1Id: 'A', team1Points: 110, team2Id: 'B', team2Points: 110 },
      ]),
    );
    expect(m).not.toBeNull();
    const rows = m!.rows;
    const alphaVsBeta = rows[0].cells[1];
    expect(alphaVsBeta).toMatchObject({ games: 3, wins: 2, losses: 0, ties: 1 });
    const betaVsAlpha = rows[1].cells[0];
    expect(betaVsAlpha).toMatchObject({ games: 3, wins: 0, losses: 2, ties: 1 });
    expect(rows[0].cells[2]).toMatchObject({ games: 0, wins: 0, losses: 0, ties: 0 });
    expect(m!.weeks).toBe(3);
  });

  it('keeps rows and cells in league.teams order and leaves self cells empty', () => {
    const teams = [team('A', 'Alpha'), team('B', 'Beta')];
    const m = buildRivalryMatrix(
      league(teams, [
        { week: 6, team1Id: 'A', team1Points: 120, team2Id: 'B', team2Points: 90 },
      ]),
    );
    expect(m!.rows.map(r => r.teamName)).toEqual(['Alpha', 'Beta']);
    expect(m!.rows[0].cells.map(c => c.opponentName)).toEqual(['Alpha', 'Beta']);
    expect(m!.rows[0].cells[0].games).toBe(0);
    expect(m!.rows[1].cells[1].games).toBe(0);
  });

  it('excludes the live current week', () => {
    const teams = [team('A', 'Alpha'), team('B', 'Beta')];
    const m = buildRivalryMatrix(
      league(teams, [
        { week: 8, team1Id: 'A', team1Points: 120, team2Id: 'B', team2Points: 90 },
        // Week 9 is live: a half-played game can never count in a series.
        { week: 9, team1Id: 'A', team1Points: 999, team2Id: 'B', team2Points: 1 },
      ]),
    );
    expect(m!.rows[0].cells[1]).toMatchObject({ games: 1, wins: 1 });
    expect(m!.weeks).toBe(1);
  });

  it('returns null with no matchups or no teams', () => {
    const teams = [team('A', 'Alpha')];
    expect(buildRivalryMatrix(league(teams, []))).toBeNull();
    expect(buildRivalryMatrix(league([], []))).toBeNull();
  });
});
