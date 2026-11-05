// YpcLeadersPage (backlog item 151): the /ypc board renders
// per-position YPC leaders from mocked Sleeper usage, with tab swaps,
// loading / error-with-retry / empty states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { YpcLeadersPage } from './YpcLeadersPage';
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

function line(rushYards: number, carries = 10) {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets: 8,
    rushAtt: carries,
    receptions: 0,
    rzOpps: 0,
    airYards: 0,
    deepRec: 0,
    longRec: 0,
    yac: 0,
    recYards: 0,
    rushYards,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <YpcLeadersPage pool={pool} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is weeks 5–7. Alpha: 300 yards on 30 carries (10.0 YPC,
  // 100.0/gm); Beta: 180 (6.0 YPC, 60.0/gm); Gamma: 270 (9.0 YPC,
  // 90.0/gm).
  mockFetchUsage.mockResolvedValue({
    season: 2026,
    weeks: [5, 6, 7],
    usageBySleeperId: {
      alpha: { 5: line(100), 6: line(60), 7: line(140) },
      beta: { 5: line(60), 6: line(60), 7: line(60) },
      gamma: { 5: line(90), 6: line(90), 7: line(90) },
    },
  });
});

describe('YpcLeadersPage', () => {
  it('ranks RBs by yards per carry with yards and per-game', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /YPC leaders at RB/ });
    const rows = within(table).getAllByRole('row');
    // Header + 2 RB rows.
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Alpha Back');
    expect(rows[1].textContent).toContain('300');
    expect(rows[1].textContent).toContain('10.0');
    expect(rows[1].textContent).toContain('100.0');
    expect(within(rows[2]).getByRole('rowheader').textContent).toContain('Beta Back');
    expect(rows[2].textContent).toContain('180');
    expect(rows[2].textContent).toContain('6.0');
    expect(rows[2].textContent).toContain('60.0');
  });

  it('swaps to the WR tab in place', async () => {
    renderPage();
    await screen.findByRole('table', { name: /YPC leaders at RB/ });
    fireEvent.click(screen.getByRole('button', { name: 'WR' }));
    const table = await screen.findByRole('table', { name: /YPC leaders at WR/ });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Gamma Receiver');
    expect(rows[1].textContent).toContain('270');
    expect(rows[1].textContent).toContain('9.0');
    expect(rows[1].textContent).toContain('90.0');
  });

  it('shows a loading state, then an error with retry', async () => {
    mockFetchUsage.mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(screen.getByText(/Loading YPC leaders/)).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load YPC data/)).toBeInTheDocument();
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        alpha: { 5: line(100), 6: line(60), 7: line(140) },
        beta: { 5: line(60), 6: line(60), 7: line(60) },
        gamma: { 5: line(90), 6: line(90), 7: line(90) },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('table', { name: /YPC leaders at RB/ });
  });

  it('shows an empty state when no player has rushing yards', async () => {
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
      expect(screen.getByText(/No RB YPC leaders for weeks 5–7 yet/)).toBeInTheDocument(),
    );
  });
});
