// TeamsPage playoff race: the section renders with remaining schedule, SOS
// and odds when the sync fetched a future schedule, and hides without one.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TeamsPage } from './TeamsPage';
import type { League, Player, Team, WeeklyMatchup } from '@/types';

function team(
  id: string,
  name: string,
  wins: number,
  losses: number,
  pointsFor: number,
): Team {
  return { id, name, wins, losses, ties: 0, pointsFor } as Team;
}

function matchup(week: number, a: string, b: string): WeeklyMatchup {
  return { week, team1Id: a, team1Points: 0, team2Id: b, team2Points: 0 };
}

function league(overrides: Partial<League> = {}): League {
  return {
    id: 'test',
    name: 'Test League',
    platform: 'yahoo',
    season: 2026,
    draftType: 'snake',
    scoringType: 'ppr',
    totalTeams: 4,
    isLoaded: true,
    teams: [
      team('A', 'Alpha', 8, 0, 1200),
      team('B', 'Beta', 6, 2, 1000),
      team('C', 'Gamma', 3, 5, 900),
      team('D', 'Delta', 1, 7, 800),
    ],
    currentWeek: 9,
    playoffTeams: 2,
    futureSchedule: [
      matchup(9, 'A', 'D'),
      matchup(9, 'B', 'C'),
      matchup(10, 'A', 'D'),
      matchup(10, 'B', 'C'),
    ],
    ...overrides,
  } as League;
}

function renderPage(leagueArg: League) {
  return render(
    <MemoryRouter>
      <TeamsPage league={leagueArg} />
    </MemoryRouter>,
  );
}

describe('TeamsPage playoff race', () => {
  it('renders remaining schedule, SOS rank, and odds when the schedule exists', () => {
    renderPage(league());
    expect(
      screen.getByRole('heading', { name: 'Playoff Race' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: /playoff race/i }),
    ).toBeInTheDocument();
    // Alpha's two remaining games are both vs Delta, each with a
    // game-by-game win probability from the same Monte Carlo.
    expect(
      screen.getByText(/W9 Delta [\d.]+% · W10 Delta [\d.]+%/),
    ).toBeInTheDocument();
    // Each row's remaining-schedule cell explains the game win
    // probabilities on hover — one such cell per team.
    expect(screen.getAllByTitle(/win probability/i)).toHaveLength(4);
    // The dominant team's row is first (sorted by odds).
    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Alpha');
  });

  it('hides the section when there is no future schedule', () => {
    renderPage(league({ futureSchedule: undefined }));
    expect(
      screen.queryByRole('heading', { name: 'Playoff Race' }),
    ).not.toBeInTheDocument();
  });
});

describe('TeamsPage matchup preview', () => {
  // Teams need rosters + weekly points for a preview; the base factory has
  // neither, so the section stays hidden there.
  function rosteredLeague(): League {
    const mkPlayer = (id: string, pos: string, nfl: string): Player =>
      ({ id, platformId: id, name: id, position: pos, team: nfl }) as Player;
    const l = league();
    const weekly: Record<string, Record<number, number>> = {};
    l.teams = l.teams.slice(0, 2).map((t, ti) => {
      const roster = [
        mkPlayer(`${t.id}-qb`, 'QB', 'KC'),
        mkPlayer(`${t.id}-rb`, 'RB', 'SF'),
        mkPlayer(`${t.id}-wr`, 'WR', 'DAL'),
        mkPlayer(`${t.id}-te`, 'TE', 'KC'),
      ];
      for (const p of roster) {
        weekly[p.id] = { 1: 10 + ti * 5, 2: 10 + ti * 5, 3: 10 + ti * 5 };
      }
      return { ...t, roster };
    });
    // Week 9 in the factory pairs A-D and B-C; with only A and B rostered,
    // preview their head-to-head instead.
    return { ...l, playerWeeklyPoints: weekly, futureSchedule: [matchup(9, 'A', 'B')] };
  }

  it('renders this week\u2019s projected scores and win probability', () => {
    renderPage(rosteredLeague());
    expect(
      screen.getByRole('heading', { name: "This Week's Matchups" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: /matchup projections/i }),
    ).toBeInTheDocument();
    // Team B's players score 15/week vs team A's 10, so B is favored
    // (getAllByText: the Playoff Race row names the same pairing too).
    expect(screen.getAllByText(/Beta [\d.]+%/).length).toBeGreaterThan(0);
  });

  it('hides the section when teams have no rosters', () => {
    renderPage(league());
    expect(
      screen.queryByRole('heading', { name: "This Week's Matchups" }),
    ).not.toBeInTheDocument();
  });

  it('hides the section when there is no future schedule', () => {
    renderPage({ ...rosteredLeague(), futureSchedule: undefined });
    expect(
      screen.queryByRole('heading', { name: "This Week's Matchups" }),
    ).not.toBeInTheDocument();
  });
});
