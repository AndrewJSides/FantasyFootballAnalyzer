// Depth Charts page: Sleeper week-N projection column (backlog item 143).
// The column never blocks the ladders — a pending or failed fetch just
// leaves dashes, and the season figure stays visible throughout.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League, Team, Player } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { DepthChartsPage } from './DepthChartsPage';

vi.mock('@/api/sleeperWeeklyProjections', () => ({
  fetchSleeperWeekProjections: vi.fn(),
}));

import { fetchSleeperWeekProjections } from '@/api/sleeperWeeklyProjections';

const mockedProjections = vi.mocked(fetchSleeperWeekProjections);

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
    p('dal-qb1', 'Dal Starter', 'DAL', 'QB', 10, 1, { sleeperId: '9001' }),
    p('dal-qb2', 'Dal Backup', 'DAL', 'QB', 28, 2, { sleeperId: '9002' }),
    p('dal-rb1', 'Dal Back', 'DAL', 'RB', 12, 1),
  ],
};

function league(): League {
  const teamA: Team = {
    id: 't1',
    name: 'Team A',
    roster: [
      { id: 'dal-qb1', platformId: '', name: 'Dal Starter', position: 'QB', team: '' } as Player,
    ],
  } as Team;
  return { teams: [teamA], season: 2026, currentWeek: 9 } as League;
}

function renderPage(lg?: League) {
  render(
    <MemoryRouter>
      <DepthChartsPage league={lg} pool={pool} />
    </MemoryRouter>,
  );
}

describe('DepthChartsPage Sleeper column (item 143)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows Sleeper week-9 values and dashes for missing lines, fetched once', async () => {
    mockedProjections.mockResolvedValue({ '9001': 14.2 });
    renderPage(league());
    expect(mockedProjections).toHaveBeenCalledTimes(1);
    expect(mockedProjections).toHaveBeenCalledWith(2026, 9);

    const dalTable = screen.getByRole('table', { name: /Dallas Cowboys depth chart/ });
    expect(
      within(dalTable).getByRole('columnheader', { name: 'Sleeper' }),
    ).toBeInTheDocument();
    await within(dalTable).findByLabelText('Sleeper projection 14.2 for week 9');
    expect(
      within(dalTable).getAllByLabelText('No Sleeper projection for this player')
        .length,
    ).toBeGreaterThan(0);
    // The season figure is untouched by the new column.
    expect(within(dalTable).getByText('Dal Starter')).toBeInTheDocument();
  });

  it('leaves the ladders dashed and intact when the Sleeper fetch fails', async () => {
    mockedProjections.mockRejectedValue(new Error('down'));
    renderPage(league());
    const dalTable = screen.getByRole('table', { name: /Dallas Cowboys depth chart/ });
    expect(within(dalTable).getByText('Dal Starter')).toBeInTheDocument();
    expect(
      within(dalTable).getAllByLabelText('Sleeper projection not loaded').length,
    ).toBeGreaterThan(0);
  });

  it('shows the Sleeper column in guest mode too', async () => {
    mockedProjections.mockResolvedValue({ '9001': 14.2 });
    renderPage();
    const dalTable = screen.getByRole('table', { name: /Dallas Cowboys depth chart/ });
    expect(
      within(dalTable).getByRole('columnheader', { name: 'Sleeper' }),
    ).toBeInTheDocument();
    expect(
      within(dalTable).queryByRole('columnheader', { name: 'Owner' }),
    ).not.toBeInTheDocument();
  });
});
