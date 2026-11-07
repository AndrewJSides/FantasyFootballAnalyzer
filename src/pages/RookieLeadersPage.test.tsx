// RookieLeadersPage (backlog item 187): the /rookies board renders
// per-position rookie PPR fantasy-points leaders from mocked
// Sleeper usage, with tab swaps, loading / error-with-retry / empty
// states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RookieLeadersPage } from './RookieLeadersPage';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

vi.mock('@/api/sleeperUsage', () => ({ fetchWeeklyUsage: vi.fn() }));
const mockFetchUsage = vi.mocked(fetchWeeklyUsage);

function pl(
  id: string,
  name: string,
  pos: string,
  rookie = true,
  team = 'DAL',
): PoolPlayer {
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
    rookie,
  } as PoolPlayer;
}

const pool: DraftPoolFile = {
  season: 2026,
  generatedAt: 'test',
  baseline: { budget: 200, teams: 10, rounds: 15 },
  players: [
    pl('alpha', 'Alpha Rookie', 'RB'),
    pl('beta', 'Beta Rookie', 'RB'),
    pl('gamma', 'Gamma Rookie', 'WR'),
    pl('delta', 'Delta Vet', 'RB', false),
  ],
};

function line(ptsPpr: number, rushAtt = 0, receptions = 0) {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets: 0,
    rushAtt,
    receptions,
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
      <RookieLeadersPage pool={pool} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is weeks 5–7. Alpha: 83 pts (27.7/gm, 42 touches); Beta:
  // 60 (20.0/gm, 24 touches); Gamma: 45 (15.0/gm, 15 touches);
  // Delta the vet scores 120 but never leads a rookie board.
  mockFetchUsage.mockResolvedValue({
    season: 2026,
    weeks: [5, 6, 7],
    usageBySleeperId: {
      alpha: { 5: line(30, 12, 3), 6: line(25, 10, 2), 7: line(28, 11, 4) },
      beta: { 5: line(20, 8, 1), 6: line(22, 9, 2), 7: line(18, 7, 1) },
      gamma: { 5: line(15, 0, 5), 6: line(18, 0, 6), 7: line(12, 0, 4) },
      delta: { 5: line(40, 20, 0), 6: line(40, 20, 0), 7: line(40, 20, 0) },
    },
  });
});

describe('RookieLeadersPage', () => {
  it('ranks rookie RBs by PPR points per game on the default tab', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /Rookie leaders at RB/ });
    const rows = within(table).getAllByRole('row');
    // Header + 2 rookie RB rows (the vet is excluded).
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Alpha Rookie');
    const alphaCells = within(rows[1]).getAllByRole('cell');
    expect(alphaCells[2].textContent).toBe('83.0');
    expect(alphaCells[3].textContent).toBe('27.7');
    expect(alphaCells[4].textContent).toBe('42');
    expect(alphaCells[5].textContent).toBe('3');
    expect(within(rows[2]).getByRole('rowheader').textContent).toContain('Beta Rookie');
  });

  it('swaps to the WR tab in place', async () => {
    renderPage();
    await screen.findByRole('table', { name: /Rookie leaders at RB/ });
    fireEvent.click(screen.getByRole('button', { name: 'WR' }));
    const table = await screen.findByRole('table', { name: /Rookie leaders at WR/ });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Gamma Rookie');
    const gammaCells = within(rows[1]).getAllByRole('cell');
    expect(gammaCells[2].textContent).toBe('45.0');
    expect(gammaCells[3].textContent).toBe('15.0');
    expect(gammaCells[4].textContent).toBe('15');
  });

  it('shows a loading state, then an error with retry', async () => {
    mockFetchUsage.mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(screen.getByText(/Loading Rookie leaders/)).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load Rookie data/)).toBeInTheDocument();
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        alpha: { 5: line(30, 12, 3), 6: line(25, 10, 2), 7: line(28, 11, 4) },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('table', { name: /Rookie leaders at RB/ });
  });

  it('shows an empty state when no rookie has points', async () => {
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
      expect(screen.getByText(/No RB Rookie leaders for weeks 5–7 yet/)).toBeInTheDocument(),
    );
  });
});
