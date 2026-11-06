// FantasyPointsLeadersPage (backlog item 158): the /fantasy-points
// board renders per-position PPR fantasy-points leaders from mocked
// Sleeper usage, with tab swaps, loading / error-with-retry / empty
// states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FantasyPointsLeadersPage } from './FantasyPointsLeadersPage';
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
    pl('alpha', 'Alpha Passer', 'QB'),
    pl('beta', 'Beta Passer', 'QB'),
    pl('gamma', 'Gamma Back', 'RB'),
  ],
};

function line(ptsPpr: number) {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets: 0,
    rushAtt: 0,
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
    passAtt: 0,
    passCmp: 0,
    rushFd: 0,
    recFd: 0,
    ptsPpr,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <FantasyPointsLeadersPage pool={pool} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is weeks 5–7. Alpha: 83 pts (27.7/gm); Beta: 60 (20.0/gm);
  // Gamma: 45 (15.0/gm).
  mockFetchUsage.mockResolvedValue({
    season: 2026,
    weeks: [5, 6, 7],
    usageBySleeperId: {
      alpha: { 5: line(30), 6: line(25), 7: line(28) },
      beta: { 5: line(20), 6: line(22), 7: line(18) },
      gamma: { 5: line(15), 6: line(18), 7: line(12) },
    },
  });
});

describe('FantasyPointsLeadersPage', () => {
  it('ranks QBs by PPR points per game on the default tab', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /Fantasy Points leaders at QB/ });
    const rows = within(table).getAllByRole('row');
    // Header + 2 QB rows.
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Alpha Passer');
    const alphaCells = within(rows[1]).getAllByRole('cell');
    expect(alphaCells[2].textContent).toBe('83.0');
    expect(alphaCells[3].textContent).toBe('27.7');
    expect(alphaCells[4].textContent).toBe('3');
    expect(within(rows[2]).getByRole('rowheader').textContent).toContain('Beta Passer');
    const betaCells = within(rows[2]).getAllByRole('cell');
    expect(betaCells[2].textContent).toBe('60.0');
    expect(betaCells[3].textContent).toBe('20.0');
  });

  it('swaps to the RB tab in place', async () => {
    renderPage();
    await screen.findByRole('table', { name: /Fantasy Points leaders at QB/ });
    fireEvent.click(screen.getByRole('button', { name: 'RB' }));
    const table = await screen.findByRole('table', { name: /Fantasy Points leaders at RB/ });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Gamma Back');
    const gammaCells = within(rows[1]).getAllByRole('cell');
    expect(gammaCells[2].textContent).toBe('45.0');
    expect(gammaCells[3].textContent).toBe('15.0');
    expect(gammaCells[4].textContent).toBe('3');
  });

  it('shows a loading state, then an error with retry', async () => {
    mockFetchUsage.mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(screen.getByText(/Loading Fantasy Points leaders/)).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load Fantasy Points data/)).toBeInTheDocument();
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        alpha: { 5: line(30), 6: line(25), 7: line(28) },
        beta: { 5: line(20), 6: line(22), 7: line(18) },
        gamma: { 5: line(15), 6: line(18), 7: line(12) },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('table', { name: /Fantasy Points leaders at QB/ });
  });

  it('shows an empty state when no player has points', async () => {
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        alpha: { 5: line(0), 6: line(0), 7: line(0) },
        beta: { 5: line(0), 6: line(0), 7: line(0) },
        gamma: { 5: line(0), 6: line(0), 7: line(0) },
      },
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/No QB Fantasy Points leaders for weeks 5–7 yet/)).toBeInTheDocument(),
    );
  });
});
