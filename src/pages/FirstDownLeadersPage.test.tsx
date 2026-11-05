// FirstDownLeadersPage (backlog item 156): the /first-downs
// board renders per-position first-down leaders from mocked Sleeper
// usage, with tab swaps, loading / error-with-retry / empty states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FirstDownLeadersPage } from './FirstDownLeadersPage';
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

function line(rushFd: number, recFd: number) {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets: 0,
    rushAtt: 10,
    receptions: 0,
    rzOpps: 0,
    airYards: 0,
    deepRec: 0,
    longRec: 0,
    yac: 0,
    recYards: 0,
    rushYards: 0,
    rushTd: 0,
    recTd: 0,
    passYards: 0,
    passTd: 0,
    rushFd,
    recFd,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <FirstDownLeadersPage pool={pool} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is weeks 5–7. Alpha: 17 first downs (5.7/gm, 12 rush, 5
  // rec); Beta: 7 (2.3/gm); Gamma: 14 (4.7/gm, 1 rush, 13 rec).
  mockFetchUsage.mockResolvedValue({
    season: 2026,
    weeks: [5, 6, 7],
    usageBySleeperId: {
      alpha: { 5: line(4, 2), 6: line(3, 2), 7: line(5, 1) },
      beta: { 5: line(2, 1), 6: line(2, 0), 7: line(1, 1) },
      gamma: { 5: line(0, 5), 6: line(0, 4), 7: line(1, 4) },
    },
  });
});

describe('FirstDownLeadersPage', () => {
  it('ranks RBs by first downs per game with the rush/rec split', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /First Downs leaders at RB/ });
    const rows = within(table).getAllByRole('row');
    // Header + 2 RB rows.
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Alpha Back');
    const alphaCells = within(rows[1]).getAllByRole('cell');
    expect(alphaCells[2].textContent).toBe('17');
    expect(alphaCells[3].textContent).toBe('5.7');
    expect(alphaCells[4].textContent).toBe('12');
    expect(alphaCells[5].textContent).toBe('5');
    expect(within(rows[2]).getByRole('rowheader').textContent).toContain('Beta Back');
    const betaCells = within(rows[2]).getAllByRole('cell');
    expect(betaCells[2].textContent).toBe('7');
    expect(betaCells[3].textContent).toBe('2.3');
  });

  it('swaps to the WR tab in place', async () => {
    renderPage();
    await screen.findByRole('table', { name: /First Downs leaders at RB/ });
    fireEvent.click(screen.getByRole('button', { name: 'WR' }));
    const table = await screen.findByRole('table', { name: /First Downs leaders at WR/ });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Gamma Receiver');
    const gammaCells = within(rows[1]).getAllByRole('cell');
    expect(gammaCells[2].textContent).toBe('14');
    expect(gammaCells[3].textContent).toBe('4.7');
    expect(gammaCells[4].textContent).toBe('1');
    expect(gammaCells[5].textContent).toBe('13');
  });

  it('shows a loading state, then an error with retry', async () => {
    mockFetchUsage.mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(screen.getByText(/Loading First Downs leaders/)).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load First Downs data/)).toBeInTheDocument();
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        alpha: { 5: line(4, 2), 6: line(3, 2), 7: line(5, 1) },
        beta: { 5: line(2, 1), 6: line(2, 0), 7: line(1, 1) },
        gamma: { 5: line(0, 5), 6: line(0, 4), 7: line(1, 4) },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('table', { name: /First Downs leaders at RB/ });
  });

  it('shows an empty state when no player has first downs', async () => {
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
      expect(screen.getByText(/No RB First Downs leaders for weeks 5–7 yet/)).toBeInTheDocument(),
    );
  });
});
