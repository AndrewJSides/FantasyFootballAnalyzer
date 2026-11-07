// PtsPerSnapLeadersPage (backlog item 189): the /pts-per-snap board
// renders per-position points-per-snap leaders from mocked Sleeper
// usage, with tab swaps, loading / error-with-retry / empty states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PtsPerSnapLeadersPage } from './PtsPerSnapLeadersPage';
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

function line(ptsPpr: number, offSnaps = 50) {
  return {
    offSnaps,
    teamSnaps: 70,
    targets: 8,
    rushAtt: 0,
    receptions: 5,
    rzOpps: 0,
    airYards: 0,
    deepRec: 0,
    longRec: 0,
    yac: 0,
    recYards: 0,
    rushYards: 0, rushTd: 0, recTd: 0, passYards: 0, passTd: 0, passAtt: 0, passCmp: 0, rushFd: 0, recFd: 0, ptsPpr,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <PtsPerSnapLeadersPage pool={pool} />
    </MemoryRouter>,
  );
}

const usage = {
  season: 2026,
  weeks: [5, 6, 7],
  usageBySleeperId: {
    alpha: { 5: line(15), 6: line(15), 7: line(15) },
    beta: { 5: line(10), 6: line(10), 7: line(10) },
    gamma: { 5: line(12, 30), 6: line(12, 30), 7: line(12, 30) },
  },
};

beforeEach(() => {
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is weeks 5–7. Alpha: 45 points on 150 snaps (0.30 per snap,
  // 15.0 per game); Beta: 30 (0.20); Gamma: 36 on 90 snaps (0.40).
  mockFetchUsage.mockResolvedValue(usage);
});

describe('PtsPerSnapLeadersPage', () => {
  it('ranks WRs by points per snap with points, snaps, and points per game', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /Points-per-snap leaders at WR/ });
    const rows = within(table).getAllByRole('row');
    // Header + 1 WR row.
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Gamma Receiver');
    expect(rows[1].textContent).toContain('36.0');
    expect(rows[1].textContent).toContain('0.40');
    expect(rows[1].textContent).toContain('90');
    expect(rows[1].textContent).toContain('12.0');
  });

  it('swaps to the RB tab in place', async () => {
    renderPage();
    await screen.findByRole('table', { name: /Points-per-snap leaders at WR/ });
    fireEvent.click(screen.getByRole('button', { name: 'RB' }));
    const table = await screen.findByRole('table', { name: /Points-per-snap leaders at RB/ });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Alpha Back');
    expect(rows[1].textContent).toContain('45.0');
    expect(rows[1].textContent).toContain('0.30');
    expect(rows[1].textContent).toContain('150');
    expect(rows[1].textContent).toContain('15.0');
    expect(within(rows[2]).getByRole('rowheader').textContent).toContain('Beta Back');
    expect(rows[2].textContent).toContain('30.0');
    expect(rows[2].textContent).toContain('0.20');
    expect(rows[2].textContent).toContain('150');
    expect(rows[2].textContent).toContain('10.0');
  });

  it('shows a loading state, then an error with retry', async () => {
    mockFetchUsage.mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(screen.getByText(/Loading points-per-snap leaders/)).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load points-per-snap data/)).toBeInTheDocument();
    mockFetchUsage.mockResolvedValue(usage);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('table', { name: /Points-per-snap leaders at WR/ });
  });

  it('shows an empty state when no player has points', async () => {
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        alpha: { 5: line(0), 6: line(0), 7: line(0) },
        beta: { 5: line(0), 6: line(0), 7: line(0) },
        gamma: { 5: line(0, 30), 6: line(0, 30), 7: line(0, 30) },
      },
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/No WR points-per-snap leaders for weeks 5–7 yet/)).toBeInTheDocument(),
    );
  });
});
