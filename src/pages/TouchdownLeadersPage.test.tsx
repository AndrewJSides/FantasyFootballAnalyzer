// TouchdownLeadersPage (backlog item 153): the /touchdowns board
// renders per-position touchdown leaders from mocked Sleeper
// usage, with tab swaps, loading / error-with-retry / empty states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TouchdownLeadersPage } from './TouchdownLeadersPage';
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

function line(rushTd: number, recTd: number, carries = 10, receptions = 5) {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets: 8,
    rushAtt: carries,
    receptions,
    rzOpps: 0,
    airYards: 0,
    deepRec: 0,
    longRec: 0,
    yac: 0,
    recYards: 0,
    rushYards: 0,
    rushTd,
    recTd,
    passYards: 0,
    passTd: 0, rushFd: 0, recFd: 0, ptsPpr: 0,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TouchdownLeadersPage pool={pool} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is weeks 5–7. Alpha: 6 touchdowns (2.0/gm, 3 rush + 3 rec);
  // Beta: 2 (0.7/gm); Gamma: 3 receiving-only (1.0/gm).
  mockFetchUsage.mockResolvedValue({
    season: 2026,
    weeks: [5, 6, 7],
    usageBySleeperId: {
      alpha: { 5: line(1, 1), 6: line(2, 0), 7: line(0, 2) },
      beta: { 5: line(1, 0), 6: line(0, 0), 7: line(1, 0) },
      gamma: { 5: line(0, 1), 6: line(0, 1), 7: line(0, 1) },
    },
  });
});

describe('TouchdownLeadersPage', () => {
  it('ranks RBs by touchdowns per game with rush/rec split', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /Touchdown leaders at RB/ });
    const rows = within(table).getAllByRole('row');
    // Header + 2 RB rows.
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Alpha Back');
    const alphaCells = within(rows[1]).getAllByRole('cell');
    expect(alphaCells[2].textContent).toBe('6');
    expect(alphaCells[3].textContent).toBe('2.0');
    expect(alphaCells[4].textContent).toBe('3');
    expect(alphaCells[5].textContent).toBe('3');
    expect(within(rows[2]).getByRole('rowheader').textContent).toContain('Beta Back');
    const betaCells = within(rows[2]).getAllByRole('cell');
    expect(betaCells[2].textContent).toBe('2');
    expect(betaCells[3].textContent).toBe('0.7');
  });

  it('swaps to the WR tab in place', async () => {
    renderPage();
    await screen.findByRole('table', { name: /Touchdown leaders at RB/ });
    fireEvent.click(screen.getByRole('button', { name: 'WR' }));
    const table = await screen.findByRole('table', { name: /Touchdown leaders at WR/ });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Gamma Receiver');
    const gammaCells = within(rows[1]).getAllByRole('cell');
    expect(gammaCells[2].textContent).toBe('3');
    expect(gammaCells[3].textContent).toBe('1.0');
    expect(gammaCells[4].textContent).toBe('0');
    expect(gammaCells[5].textContent).toBe('3');
  });

  it('shows a loading state, then an error with retry', async () => {
    mockFetchUsage.mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(screen.getByText(/Loading Touchdown leaders/)).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load Touchdown data/)).toBeInTheDocument();
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        alpha: { 5: line(1, 1), 6: line(2, 0), 7: line(0, 2) },
        beta: { 5: line(1, 0), 6: line(0, 0), 7: line(1, 0) },
        gamma: { 5: line(0, 1), 6: line(0, 1), 7: line(0, 1) },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('table', { name: /Touchdown leaders at RB/ });
  });

  it('shows an empty state when no player has touchdowns', async () => {
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        alpha: { 5: line(0, 0), 6: line(0, 0), 7: line(0, 0) },
        beta: { 5: line(0, 0), 6: line(0, 0), 7: line(0, 0) },
        gamma: { 5: line(0, 0), 6: line(0, 0), 7: line(0, 0) },
      },
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/No RB Touchdown leaders for weeks 5–7 yet/)).toBeInTheDocument(),
    );
  });
});
