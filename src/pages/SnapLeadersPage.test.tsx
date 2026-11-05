// SnapLeadersPage (backlog item 104): the /snaps board renders
// per-position snap-share leaders from mocked Sleeper usage, with tab
// swaps, loading / error-with-retry / empty states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SnapLeadersPage } from './SnapLeadersPage';
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

function line(offSnaps: number, teamSnaps: number, targets = 0) {
  return { offSnaps, teamSnaps, targets, rushAtt: 0, receptions: 0, rzOpps: 0, airYards: 0, deepRec: 0, longRec: 0, yac: 0, recYards: 0, rushYards: 0, rushTd: 0, recTd: 0, passYards: 0, passTd: 0 };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SnapLeadersPage pool={pool} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is weeks 5–7. Alpha: 100% snaps; Beta: 50%; Gamma: 86%.
  mockFetchUsage.mockResolvedValue({
    season: 2026,
    weeks: [5, 6, 7],
    usageBySleeperId: {
      alpha: { 5: line(70, 70, 4), 6: line(70, 70, 4), 7: line(70, 70, 4) },
      beta: { 5: line(35, 70, 2), 6: line(35, 70, 2), 7: line(35, 70, 2) },
      gamma: { 5: line(60, 70, 9), 6: line(60, 70, 9), 7: line(60, 70, 9) },
    },
  });
});

describe('SnapLeadersPage', () => {
  it('renders the RB board by default, snap-share ranked', async () => {
    renderPage();
    const table = await screen.findByRole('table', {
      name: /snap share leaders at rb/i,
    });
    const rows = within(table).getAllByRole('row');
    // Header + 2 RB leaders.
    expect(rows).toHaveLength(3);
    const firstCells = within(rows[1]).getAllByRole('cell');
    expect(within(rows[1]).getByRole('rowheader')).toHaveTextContent(
      'Alpha Back',
    );
    expect(firstCells[0]).toHaveTextContent('1');
    expect(firstCells[2]).toHaveTextContent('100%');
  });

  it('swaps to the WR board on tab click with aria-pressed state', async () => {
    renderPage();
    await screen.findByRole('table', { name: /snap share leaders at rb/i });
    const wrTab = screen.getByRole('button', { name: 'WR' });
    expect(wrTab).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(wrTab);
    expect(wrTab).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('table', { name: /snap share leaders at wr/i }),
    ).toBeInTheDocument();
  });

  it('labels rows with a plain-language accessible name', async () => {
    renderPage();
    const table = await screen.findByRole('table', {
      name: /snap share leaders at rb/i,
    });
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]).getByRole('rowheader')).toHaveAttribute(
      'aria-label',
      expect.stringContaining("100% of the offense's snaps"),
    );
  });

  it('shows an error with a working retry button', async () => {
    mockFetchUsage.mockRejectedValueOnce(new Error('boom'));
    renderPage();
    await screen.findByText(/couldn't load snap data/i);
    const retry = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(retry);
    // The retry re-fetches and the board renders.
    await screen.findByRole('table', { name: /snap share leaders at rb/i });
    expect(mockFetchUsage).toHaveBeenCalledTimes(2);
  });

  it('names the opportunity-map basis in the method footnote', async () => {
    renderPage();
    await screen.findByRole('table', { name: /snap share leaders at rb/i });
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
      expect(screen.getByText(/no rb snap leaders/i)).toBeInTheDocument(),
    );
  });
});
