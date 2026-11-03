// TargetLeadersPage (backlog item 107): the /targets board renders
// per-position target-share leaders from mocked Sleeper usage, with tab
// swaps, loading / error-with-retry / empty states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TargetLeadersPage } from './TargetLeadersPage';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

vi.mock('@/api/sleeperUsage', () => ({ fetchWeeklyUsage: vi.fn() }));
const mockFetchUsage = vi.mocked(fetchWeeklyUsage);

function pl(id: string, name: string, pos: string, team = 'DAL'): PoolPlayer {
  return {
    id,
    name,
    team,
    pos,
    posRank: 10,
    overallRank: 50,
    tier: 2,
    bye: 7,
    baseValue: null,
    projPtsPpr: 120,
    sleeperId: id,
  } as PoolPlayer;
}

const pool: DraftPoolFile = {
  season: 2026,
  generatedAt: 'test',
  baseline: { budget: 200, teams: 10, rounds: 15 },
  players: [
    pl('alpha', 'Alpha Back', 'RB'),
    pl('beta', 'Beta Back', 'RB'),
    pl('gamma', 'Gamma Receiver', 'WR'),
  ],
};

function line(targets: number, receptions = 0) {
  return { offSnaps: 70, teamSnaps: 70, targets, rushAtt: 0, receptions };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TargetLeadersPage pool={pool} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is weeks 5–7. Team targets/week: 4 + 2 + 9 = 15.
  // Alpha: 12/45 = 27%; Beta: 6/45 = 13%; Gamma: 27/45 = 60%.
  mockFetchUsage.mockResolvedValue({
    season: 2026,
    weeks: [5, 6, 7],
    usageBySleeperId: {
      alpha: { 5: line(4, 3), 6: line(4, 3), 7: line(4, 3) },
      beta: { 5: line(2, 1), 6: line(2, 1), 7: line(2, 1) },
      gamma: { 5: line(9, 7), 6: line(9, 7), 7: line(9, 7) },
    },
  });
});

describe('TargetLeadersPage', () => {
  it('renders the RB board by default, target-share ranked', async () => {
    renderPage();
    const table = await screen.findByRole('table', {
      name: /target share leaders at rb/i,
    });
    const rows = within(table).getAllByRole('row');
    // Header + 2 RB leaders.
    expect(rows).toHaveLength(3);
    const firstCells = within(rows[1]).getAllByRole('cell');
    expect(within(rows[1]).getByRole('rowheader')).toHaveTextContent(
      'Alpha Back',
    );
    expect(firstCells[0]).toHaveTextContent('1');
    expect(firstCells[2]).toHaveTextContent('27%');
  });

  it('swaps to the WR board on tab click with aria-pressed state', async () => {
    renderPage();
    await screen.findByRole('table', { name: /target share leaders at rb/i });
    const wrTab = screen.getByRole('button', { name: 'WR' });
    expect(wrTab).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(wrTab);
    expect(wrTab).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('table', { name: /target share leaders at wr/i }),
    ).toBeInTheDocument();
  });

  it('labels rows with a plain-language accessible name', async () => {
    renderPage();
    const table = await screen.findByRole('table', {
      name: /target share leaders at rb/i,
    });
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]).getByRole('rowheader')).toHaveAttribute(
      'aria-label',
      expect.stringContaining("27% of his team's targets"),
    );
  });

  it('shows an error with a working retry button', async () => {
    mockFetchUsage.mockRejectedValueOnce(new Error('boom'));
    renderPage();
    await screen.findByText(/couldn't load target data/i);
    const retry = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(retry);
    // The retry re-fetches and the board renders.
    await screen.findByRole('table', { name: /target share leaders at rb/i });
    expect(mockFetchUsage).toHaveBeenCalledTimes(2);
  });

  it('names the opportunity-map basis in the method footnote', async () => {
    renderPage();
    await screen.findByRole('table', { name: /target share leaders at rb/i });
    expect(
      screen.getByText(/an opportunity map, not a forecast/i),
    ).toBeInTheDocument();
  });

  it('shows an empty state when no position has leaders', async () => {
    mockFetchUsage.mockResolvedValueOnce({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {},
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/no rb target leaders/i)).toBeInTheDocument(),
    );
  });
});
