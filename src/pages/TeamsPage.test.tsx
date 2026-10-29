// TeamsPage playoff race: the section renders with remaining schedule, SOS
// and odds when the sync fetched a future schedule, and hides without one.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TeamsPage } from './TeamsPage';
import type { League, Team, WeeklyMatchup } from '@/types';

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
    // Alpha's two remaining games are both vs Delta.
    expect(screen.getByText('W9 Delta · W10 Delta')).toBeInTheDocument();
    // Odds cells render as percentages, one per team.
    expect(screen.getAllByText(/^\d+(\.\d+)?%$/)).toHaveLength(4);
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
