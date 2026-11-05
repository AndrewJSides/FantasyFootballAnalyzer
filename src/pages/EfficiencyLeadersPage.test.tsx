// EfficiencyLeadersPage (backlog item 105): the /efficiency board renders
// per-position points-per-touch leaders from mocked Sleeper points +
// usage, with tab swaps, loading / error-with-retry / empty states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EfficiencyLeadersPage } from './EfficiencyLeadersPage';
import { fetchWeeklyPprPoints } from '@/api/sleeperWeeklyPoints';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

vi.mock('@/api/sleeperWeeklyPoints', () => ({ fetchWeeklyPprPoints: vi.fn() }));
vi.mock('@/api/sleeperUsage', () => ({ fetchWeeklyUsage: vi.fn() }));
const mockFetchPoints = vi.mocked(fetchWeeklyPprPoints);
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

function line(rushAtt: number, receptions: number) {
  return { offSnaps: 50, teamSnaps: 70, targets: receptions, rushAtt, receptions, rzOpps: 0, airYards: 0, deepRec: 0, longRec: 0, yac: 0, recYards: 0 };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <EfficiencyLeadersPage pool={pool} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetchPoints.mockReset();
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is weeks 5–7. Alpha: 60 pts / 30 touches = 2.00; Beta: 1.00.
  mockFetchUsage.mockResolvedValue({
    season: 2026,
    weeks: [5, 6, 7],
    usageBySleeperId: {
      alpha: { 5: line(6, 4), 6: line(6, 4), 7: line(6, 4) },
      beta: { 5: line(6, 4), 6: line(6, 4), 7: line(6, 4) },
      gamma: { 5: line(2, 8), 6: line(2, 8), 7: line(2, 8) },
    },
  });
  mockFetchPoints.mockResolvedValue({
    season: 2026,
    weeks: [5, 6, 7],
    pointsBySleeperId: {
      alpha: { 5: 20, 6: 20, 7: 20 },
      beta: { 5: 10, 6: 10, 7: 10 },
      gamma: { 5: 15, 6: 15, 7: 15 },
    },
    gamesBySleeperId: {
      alpha: [5, 6, 7],
      beta: [5, 6, 7],
      gamma: [5, 6, 7],
    },
  });
});

describe('EfficiencyLeadersPage', () => {
  it('renders the RB board by default, points-per-touch ranked', async () => {
    renderPage();
    const table = await screen.findByRole('table', {
      name: /efficiency leaders at rb/i,
    });
    const rows = within(table).getAllByRole('row');
    // Header + 2 RB leaders.
    expect(rows).toHaveLength(3);
    const firstCells = within(rows[1]).getAllByRole('cell');
    expect(within(rows[1]).getByRole('rowheader')).toHaveTextContent(
      'Alpha Back',
    );
    expect(firstCells[0]).toHaveTextContent('1');
    expect(firstCells[2]).toHaveTextContent('2.00');
  });

  it('swaps to the WR board on tab click with aria-pressed state', async () => {
    renderPage();
    await screen.findByRole('table', { name: /efficiency leaders at rb/i });
    const wrTab = screen.getByRole('button', { name: 'WR' });
    expect(wrTab).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(wrTab);
    expect(wrTab).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('table', { name: /efficiency leaders at wr/i }),
    ).toBeInTheDocument();
  });

  it('labels rows with a plain-language accessible name', async () => {
    renderPage();
    const table = await screen.findByRole('table', {
      name: /efficiency leaders at rb/i,
    });
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]).getByRole('rowheader')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('2.00 fantasy points per touch'),
    );
  });

  it('shows an error with a working retry button', async () => {
    mockFetchPoints.mockRejectedValueOnce(new Error('boom'));
    renderPage();
    await screen.findByText(/couldn't load efficiency data/i);
    const retry = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(retry);
    // The retry re-fetches and the board renders.
    await screen.findByRole('table', { name: /efficiency leaders at rb/i });
    expect(mockFetchPoints).toHaveBeenCalledTimes(2);
  });

  it('names the efficiency-map basis in the method footnote', async () => {
    renderPage();
    await screen.findByRole('table', { name: /efficiency leaders at rb/i });
    expect(
      screen.getByText(/an efficiency map, not a forecast/i),
    ).toBeInTheDocument();
  });

  it('shows an empty state when no position has leaders', async () => {
    mockFetchUsage.mockResolvedValueOnce({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {},
    });
    mockFetchPoints.mockResolvedValueOnce({
      season: 2026,
      weeks: [5, 6, 7],
      pointsBySleeperId: {},
      gamesBySleeperId: {},
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/no rb efficiency leaders/i)).toBeInTheDocument(),
    );
  });
});
