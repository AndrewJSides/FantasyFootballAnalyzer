// Depth Charts page rendering: all teams by default with ladder order and
// league ownership, team-select filtering announced via aria-live, and an
// owner-free table in guest mode.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DepthChartsPage } from './DepthChartsPage';
import type { League, Team, Player } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

function p(
  id: string,
  name: string,
  team: string,
  pos: string,
  posRank: number,
  depthChartOrder: number,
  extra?: Partial<PoolPlayer>,
): PoolPlayer {
  return {
    id,
    name,
    team,
    pos,
    posRank,
    overallRank: 99,
    tier: 1,
    bye: 7,
    baseValue: null,
    projPtsPpr: 100.0,
    depthChartOrder,
    ...extra,
  } as PoolPlayer;
}

const pool: DraftPoolFile = {
  season: 2026,
  generatedAt: 'test',
  baseline: { budget: 200, teams: 10, rounds: 15 },
  players: [
    p('dal-qb2', 'Dal Backup', 'DAL', 'QB', 28, 2),
    p('dal-qb1', 'Dal Starter', 'DAL', 'QB', 10, 1, { injuryStatus: 'Questionable' }),
    p('dal-rb1', 'Dal Back', 'DAL', 'RB', 12, 1),
    p('gb-qb1', 'Gb Starter', 'GB', 'QB', 8, 1),
  ],
};

function leaguePlayer(id: string, name: string): Player {
  return { id, platformId: '', name, position: 'QB', team: '' } as Player;
}

function leagueWithOwners(): League {
  const teamA: Team = {
    id: 't1',
    name: 'Team A',
    roster: [leaguePlayer('dal-qb1', 'Dal Starter')],
  } as Team;
  return { teams: [teamA], currentWeek: 9 } as League;
}

function renderPage(league?: League) {
  render(
    <MemoryRouter>
      <DepthChartsPage league={league} pool={pool} />
    </MemoryRouter>,
  );
}

describe('DepthChartsPage', () => {
  it('renders every team ladder in depth order with league ownership', () => {
    renderPage(leagueWithOwners());
    expect(screen.getByRole('heading', { name: 'Depth Charts' })).toBeInTheDocument();
    const dalTable = screen.getByRole('table', { name: /Dallas Cowboys depth chart/ });
    const rows = within(dalTable).getAllByRole('row').slice(1);
    expect(rows.map(r => r.textContent)).toEqual([
      expect.stringContaining('Dal Starter'),
      expect.stringContaining('Dal Backup'),
      expect.stringContaining('Dal Back'),
    ]);
    expect(within(dalTable).getByRole('columnheader', { name: 'Owner' })).toBeInTheDocument();
    const starterRow = rows[0];
    expect(within(starterRow).getByText('Team A')).toBeInTheDocument();
    expect(within(starterRow).getByText(/Questionable/)).toBeInTheDocument();
    expect(within(rows[1]).getByText('Free agent')).toBeInTheDocument();
  });

  it('filters to one team via the select and announces the swap', () => {
    renderPage(leagueWithOwners());
    fireEvent.change(screen.getByLabelText('NFL team'), { target: { value: 'GB' } });
    expect(screen.getByRole('heading', { name: /Packers/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Cowboys/ })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Green Bay Packers depth chart/);
  });

  it('omits the Owner column in guest mode', () => {
    renderPage();
    expect(screen.queryByRole('columnheader', { name: 'Owner' })).not.toBeInTheDocument();
    expect(screen.getByRole('table', { name: /Dallas Cowboys depth chart/ })).toBeInTheDocument();
  });
});
