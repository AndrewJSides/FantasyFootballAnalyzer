// YptLeadersPage (backlog item 188): the /ypt board renders
// per-position YPT leaders from mocked Sleeper usage, with tab swaps,
// loading / error-with-retry / empty states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { YptLeadersPage } from './YptLeadersPage';
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

function line(recYards: number, targets = 8, receptions = 5) {
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
    rushYards: 0, rushTd: 0, recTd: 0, passYards: 0, passTd: 0, passAtt: 0, passCmp: 0, rushFd: 0, recFd: 0, ptsPpr: 0,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <YptLeadersPage pool={pool} />
    </MemoryRouter>,
  );
}

const usage = {
  season: 2026,
  weeks: [5, 6, 7],
  usageBySleeperId: {
    alpha: { 5: line(100), 6: line(60), 7: line(140) },
    beta: { 5: line(60), 6: line(60), 7: line(60) },
    gamma: { 5: line(90), 6: line(90), 7: line(90) },
  },
};

beforeEach(() => {
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is weeks 5–7. Alpha: 300 yards on 24 targets (12.5 YPT,
  // 63% catch); Beta: 180 (7.5 YPT, 63%); Gamma: 270 (11.3 YPT, 63%).
  mockFetchUsage.mockResolvedValue(usage);
});

describe('YptLeadersPage', () => {
  it('ranks WRs by yards per target with yards, targets, and catch rate', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /YPT leaders at WR/ });
    const rows = within(table).getAllByRole('row');
    // Header + 1 WR row.
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Gamma Receiver');
    expect(rows[1].textContent).toContain('270');
    expect(rows[1].textContent).toContain('11.3');
    expect(rows[1].textContent).toContain('24');
    expect(rows[1].textContent).toContain('63%');
  });

  it('swaps to the RB tab in place', async () => {
    renderPage();
    await screen.findByRole('table', { name: /YPT leaders at WR/ });
    fireEvent.click(screen.getByRole('button', { name: 'RB' }));
    const table = await screen.findByRole('table', { name: /YPT leaders at RB/ });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Alpha Back');
    expect(rows[1].textContent).toContain('300');
    expect(rows[1].textContent).toContain('12.5');
    expect(rows[1].textContent).toContain('24');
    expect(rows[1].textContent).toContain('63%');
    expect(within(rows[2]).getByRole('rowheader').textContent).toContain('Beta Back');
    expect(rows[2].textContent).toContain('180');
    expect(rows[2].textContent).toContain('7.5');
    expect(rows[2].textContent).toContain('24');
    expect(rows[2].textContent).toContain('63%');
  });

  it('shows a loading state, then an error with retry', async () => {
    mockFetchUsage.mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(screen.getByText(/Loading YPT leaders/)).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load YPT data/)).toBeInTheDocument();
    mockFetchUsage.mockResolvedValue(usage);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('table', { name: /YPT leaders at WR/ });
  });

  it('shows an empty state when no player has receiving yards', async () => {
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
      expect(screen.getByText(/No WR YPT leaders for weeks 5–7 yet/)).toBeInTheDocument(),
    );
  });
});
