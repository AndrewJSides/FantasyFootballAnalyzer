// ReceptionsLeadersPage (backlog item 163): the /receptions
// board renders per-position receptions leaders from mocked
// Sleeper usage, with tab swaps, loading / error-with-retry / empty
// states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReceptionsLeadersPage } from './ReceptionsLeadersPage';
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
    pl('alpha', 'Alpha Receiver', 'WR'),
    pl('beta', 'Beta Receiver', 'WR'),
    pl('gamma', 'Gamma Back', 'RB'),
  ],
};

function line(receptions: number, targets = 10, recYards = 80) {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets,
    rushAtt: 0,
    receptions,
    rzOpps: 0,
    airYards: 0,
    deepRec: 0,
    longRec: 0,
    yac: 0,
    recYards,
    rushYards: 0, rushTd: 0, recTd: 0, passYards: 0, passTd: 0, rushFd: 0, recFd: 0, ptsPpr: 0,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ReceptionsLeadersPage pool={pool} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is weeks 5–7. Alpha: 24 catches (8.0/gm); Beta: 15
  // (5.0/gm); Gamma: 12 (4.0/gm).
  mockFetchUsage.mockResolvedValue({
    season: 2026,
    weeks: [5, 6, 7],
    usageBySleeperId: {
      alpha: { 5: line(8), 6: line(8), 7: line(8) },
      beta: { 5: line(5), 6: line(5), 7: line(5) },
      gamma: { 5: line(4), 6: line(4), 7: line(4) },
    },
  });
});

describe('ReceptionsLeadersPage', () => {
  it('ranks WRs by receptions per game with targets and yards', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /Receptions leaders at WR/ });
    const rows = within(table).getAllByRole('row');
    // Header + 2 WR rows.
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Alpha Receiver');
    expect(rows[1].textContent).toContain('24');
    expect(rows[1].textContent).toContain('8.0');
    expect(rows[1].textContent).toContain('30');
    expect(rows[1].textContent).toContain('240');
    expect(within(rows[2]).getByRole('rowheader').textContent).toContain('Beta Receiver');
    expect(rows[2].textContent).toContain('15');
    expect(rows[2].textContent).toContain('5.0');
  });

  it('swaps to the RB tab in place', async () => {
    renderPage();
    await screen.findByRole('table', { name: /Receptions leaders at WR/ });
    fireEvent.click(screen.getByRole('button', { name: 'RB' }));
    const table = await screen.findByRole('table', { name: /Receptions leaders at RB/ });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Gamma Back');
    expect(rows[1].textContent).toContain('12');
    expect(rows[1].textContent).toContain('4.0');
  });

  it('shows a loading state, then an error with retry', async () => {
    mockFetchUsage.mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(screen.getByText(/Loading receptions leaders/)).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load receptions data/)).toBeInTheDocument();
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        alpha: { 5: line(8), 6: line(8), 7: line(8) },
        beta: { 5: line(5), 6: line(5), 7: line(5) },
        gamma: { 5: line(4), 6: line(4), 7: line(4) },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('table', { name: /Receptions leaders at WR/ });
  });

  it('shows an empty state when no player has receptions', async () => {
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
      expect(screen.getByText(/No WR receptions leaders for weeks 5–7 yet/)).toBeInTheDocument(),
    );
  });
});
