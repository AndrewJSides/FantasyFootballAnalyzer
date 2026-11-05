// YacLeadersPage (backlog item 149): the /yac board renders
// per-position YAC leaders from mocked Sleeper usage, with tab swaps,
// loading / error-with-retry / empty states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { YacLeadersPage } from './YacLeadersPage';
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

function line(yac: number, receptions = 5) {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets: 8,
    rushAtt: 0,
    receptions,
    rzOpps: 0,
    airYards: 0,
    deepRec: 0,
    longRec: 0,
    yac,
    recYards: 0, rushYards: 0, rushTd: 0, recTd: 0, passYards: 0, passTd: 0, rushFd: 0, recFd: 0, ptsPpr: 0,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <YacLeadersPage pool={pool} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is weeks 5–7. Alpha: 180 YAC (60.0/gm, 12.0/rec); Beta: 60
  // (20.0/gm); Gamma: 150 (50.0/gm, 10.0/rec). Team DAL weeks 5–7
  // total 390 YAC.
  mockFetchUsage.mockResolvedValue({
    season: 2026,
    weeks: [5, 6, 7],
    usageBySleeperId: {
      alpha: { 5: line(60), 6: line(30), 7: line(90) },
      beta: { 5: line(20), 6: line(20), 7: line(20) },
      gamma: { 5: line(50), 6: line(50), 7: line(50) },
    },
  });
});

describe('YacLeadersPage', () => {
  it('ranks WRs by YAC per game with per-reception and share', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /YAC leaders at WR/ });
    const rows = within(table).getAllByRole('row');
    // Header + 1 WR row.
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Gamma Receiver');
    expect(rows[1].textContent).toContain('150');
    expect(rows[1].textContent).toContain('50.0');
    expect(rows[1].textContent).toContain('10.0');
    expect(rows[1].textContent).toContain('39%');
  });

  it('swaps to the RB tab in place', async () => {
    renderPage();
    await screen.findByRole('table', { name: /YAC leaders at WR/ });
    fireEvent.click(screen.getByRole('button', { name: 'RB' }));
    const table = await screen.findByRole('table', { name: /YAC leaders at RB/ });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Alpha Back');
    expect(rows[1].textContent).toContain('180');
    expect(rows[1].textContent).toContain('60.0');
    expect(rows[1].textContent).toContain('12.0');
    expect(rows[1].textContent).toContain('46%');
    expect(within(rows[2]).getByRole('rowheader').textContent).toContain('Beta Back');
    expect(rows[2].textContent).toContain('60');
    expect(rows[2].textContent).toContain('20.0');
  });

  it('shows a loading state, then an error with retry', async () => {
    mockFetchUsage.mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(screen.getByText(/Loading YAC leaders/)).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load YAC data/)).toBeInTheDocument();
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        alpha: { 5: line(60), 6: line(30), 7: line(90) },
        beta: { 5: line(20), 6: line(20), 7: line(20) },
        gamma: { 5: line(50), 6: line(50), 7: line(50) },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('table', { name: /YAC leaders at WR/ });
  });

  it('shows an empty state when no player has YAC', async () => {
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
      expect(screen.getByText(/No WR YAC leaders for weeks 5–7 yet/)).toBeInTheDocument(),
    );
  });
});
