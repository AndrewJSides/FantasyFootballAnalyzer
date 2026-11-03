// PeakWeeksPage (backlog item 106): the /peak-weeks board renders
// per-position best single weeks from mocked Sleeper points, with tab
// swaps, loading / error-with-retry / empty states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PeakWeeksPage } from './PeakWeeksPage';
import { fetchWeeklyPprPoints } from '@/api/sleeperWeeklyPoints';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

vi.mock('@/api/sleeperWeeklyPoints', () => ({ fetchWeeklyPprPoints: vi.fn() }));
const mockFetchPoints = vi.mocked(fetchWeeklyPprPoints);

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
    pl('alpha', 'Alpha Passer', 'QB'),
    pl('beta', 'Beta Passer', 'QB'),
    pl('gamma', 'Gamma Back', 'RB'),
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <PeakWeeksPage pool={pool} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetchPoints.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so weeks
  // 1–7 count and week 8 never does. Alpha's week-6 explosion tops QB.
  mockFetchPoints.mockResolvedValue({
    season: 2026,
    weeks: [5, 6, 7],
    pointsBySleeperId: {
      alpha: { 5: 30, 6: 42.4, 8: 99 },
      beta: { 5: 38, 6: 20 },
      gamma: { 5: 25, 6: 12 },
    },
    gamesBySleeperId: {
      alpha: [5, 6, 8],
      beta: [5, 6],
      gamma: [5, 6],
    },
  });
});

describe('PeakWeeksPage', () => {
  it('renders QB peaks ranked by points, in-progress week excluded', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /Peak weeks at QB/ });
    const rows = within(table).getAllByRole('row');
    // Header + 4 QB weeks (Alpha x2, Beta x2); the 99-pt week 8 is excluded.
    expect(rows).toHaveLength(5);
    expect(within(rows[1]).getByRole('rowheader').textContent).toBe('Alpha Passer');
    expect(rows[1].textContent).toContain('42.4');
    expect(rows[1].textContent).not.toContain('99');
  });

  it('swaps position tabs in place', async () => {
    renderPage();
    await screen.findByRole('table', { name: /Peak weeks at QB/ });
    fireEvent.click(screen.getByRole('button', { name: 'RB' }));
    const table = await screen.findByRole('table', { name: /Peak weeks at RB/ });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByRole('rowheader').textContent).toBe('Gamma Back');
  });

  it('shows an error with retry when the fetch fails', async () => {
    mockFetchPoints.mockRejectedValueOnce(new Error('Sleeper down'));
    renderPage();
    await screen.findByText(/Couldn't load peak weeks/);
    mockFetchPoints.mockResolvedValue({
      season: 2026,
      weeks: [5],
      pointsBySleeperId: { alpha: { 5: 30 } },
      gamesBySleeperId: { alpha: [5] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('table', { name: /Peak weeks at QB/ });
  });

  it('shows an empty state when the position has no peaks', async () => {
    mockFetchPoints.mockResolvedValue({
      season: 2026,
      weeks: [5],
      pointsBySleeperId: {},
      gamesBySleeperId: {},
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/No QB peak weeks/)).toBeInTheDocument(),
    );
  });
});
