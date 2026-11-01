import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League, Team, WeeklyMatchup } from '@/types';
import TeamComparePage from './TeamComparePage';

function mkTeam(id: string, name: string, wins: number, losses: number, isMyTeam = false): Team {
  return {
    id,
    name,
    wins,
    losses,
    ties: 0,
    pointsFor: wins * 130 + 100,
    pointsAgainst: losses * 130 + 100,
    isMyTeam,
  } as Team;
}

function matchup(week: number, a: string, b: string, aPts: number, bPts: number): WeeklyMatchup {
  return { week, team1Id: a, team2Id: b, team1Points: aPts, team2Points: bPts } as WeeklyMatchup;
}

function league(): League {
  return {
    id: 'L',
    platform: 'sleeper',
    name: 'Test League',
    season: 2026,
    draftType: 'snake',
    scoringType: 'ppr',
    totalTeams: 3,
    currentWeek: 3,
    isLoaded: true,
    teams: [
      mkTeam('a', 'Alpha', 2, 0, true),
      mkTeam('b', 'Beta', 1, 1),
      mkTeam('c', 'Gamma', 0, 2),
    ],
    matchups: [
      matchup(1, 'a', 'b', 140, 120),
      matchup(1, 'b', 'c', 110, 100),
      matchup(2, 'a', 'c', 135, 105),
      matchup(2, 'b', 'a', 115, 125),
    ],
  } as League;
}

function renderPage(l: League = league()) {
  return render(
    <MemoryRouter>
      <TeamComparePage league={l} pool={undefined} />
    </MemoryRouter>,
  );
}

describe('TeamComparePage', () => {
  it('defaults to my team vs another team and renders the comparison table', () => {
    renderPage();
    const table = screen.getByRole('table', { name: /team comparison, alpha vs/i });
    expect(within(table).getByRole('rowheader', { name: 'Record' })).toBeInTheDocument();
    // Alpha 2-0, Beta 1-1.
    const recordRow = within(table).getByRole('rowheader', { name: 'Record' }).closest('tr')!;
    expect(within(recordRow).getByText('2-0')).toBeInTheDocument();
    expect(within(recordRow).getByText('1-1')).toBeInTheDocument();
  });

  it('announces the edge summary', () => {
    renderPage();
    expect(screen.getByText(/alpha leads beta/i)).toBeInTheDocument();
  });

  it('swaps the comparison when Team B changes', () => {
    renderPage();
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1], { target: { value: 'c' } });
    const table = screen.getByRole('table', { name: /team comparison, alpha vs gamma/i });
    const recordRow = within(table).getByRole('rowheader', { name: 'Record' }).closest('tr')!;
    expect(within(recordRow).getByText('2-0')).toBeInTheDocument();
    expect(within(recordRow).getByText('0-2')).toBeInTheDocument();
  });

  it('shows the same-team notice when both pickers pick one team', () => {
    renderPage();
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1], { target: { value: 'a' } });
    expect(
      screen.getByText(/pick two different teams to see the side-by-side comparison/i),
    ).toBeInTheDocument();
  });

  it('shows an accessible-name fallback when fewer than two teams exist', () => {
    const oneTeam = { ...league(), teams: [mkTeam('a', 'Alpha', 2, 0, true)] };
    render(<MemoryRouter><TeamComparePage league={oneTeam as League} /></MemoryRouter>);
    expect(screen.getByText(/at least two teams/i)).toBeInTheDocument();
  });
});
