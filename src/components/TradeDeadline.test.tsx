// TradeDeadline component: renders the deadline hub when the Playoff Race
// has entries, and nothing when the sync fetched no future schedule.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TradeDeadline } from './TradeDeadline';
import type { League, Team, WeeklyMatchup } from '@/types';

function team(id: string, name: string, wins: number, losses: number, pointsFor: number): Team {
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

function renderComponent(l: League) {
  return render(
    <MemoryRouter>
      <TradeDeadline league={l} />
    </MemoryRouter>,
  );
}

describe('TradeDeadline', () => {
  it('renders the stance table with contender/pretender tiers', () => {
    renderComponent(league());
    expect(screen.getByRole('heading', { name: 'Trade Deadline Hub' })).toBeTruthy();
    const table = screen.getByRole('table', { name: 'Trade deadline stances by team' });
    expect(table).toBeTruthy();
    // The runaway team buys, the doomed team sells.
    expect(screen.getAllByText('BUY').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('SELL').length).toBeGreaterThanOrEqual(1);
  });

  it('renders nothing without a future schedule', () => {
    const { container } = renderComponent(league({ futureSchedule: undefined }));
    expect(container).toBeEmptyDOMElement();
  });
});
