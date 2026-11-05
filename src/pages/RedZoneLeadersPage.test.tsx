// RedZoneLeadersPage (backlog item 145): the /red-zone board renders
// per-position red-zone opportunity leaders from mocked Sleeper usage,
// with tab swaps, loading / error-with-retry / empty states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RedZoneLeadersPage } from './RedZoneLeadersPage';
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

function line(rzOpps: number) {
  return { offSnaps: 50, teamSnaps: 70, targets: 0, rushAtt: 0, receptions: 0, rzOpps, airYards: 0, deepRec: 0, longRec: 0, yac: 0 };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <RedZoneLeadersPage pool={pool} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is weeks 5–7. Alpha: 18 RZ opps (6/gm); Beta: 9 (3/gm);
  // Gamma: 15 (5/gm). Team DAL weeks 5–7 total 42.
  mockFetchUsage.mockResolvedValue({
    season: 2026,
    weeks: [5, 6, 7],
    usageBySleeperId: {
      alpha: { 5: line(6), 6: line(6), 7: line(6) },
      beta: { 5: line(2), 6: line(4), 7: line(3) },
      gamma: { 5: line(5), 6: line(5), 7: line(5) },
    },
  });
});

describe('RedZoneLeadersPage', () => {
  it('ranks RBs by red-zone opps per game with share', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /Red-zone opportunity leaders at RB/ });
    const rows = within(table).getAllByRole('row');
    // Header + 2 RB rows.
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Alpha Back');
    expect(rows[1].textContent).toContain('18');
    expect(rows[1].textContent).toContain('6.0');
    expect(rows[1].textContent).toContain('43%');
    expect(within(rows[2]).getByRole('rowheader').textContent).toContain('Beta Back');
    expect(rows[2].textContent).toContain('9');
    expect(rows[2].textContent).toContain('3.0');
  });

  it('swaps to the WR tab in place', async () => {
    renderPage();
    await screen.findByRole('table', { name: /Red-zone opportunity leaders at RB/ });
    fireEvent.click(screen.getByRole('button', { name: 'WR' }));
    const table = await screen.findByRole('table', { name: /Red-zone opportunity leaders at WR/ });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Gamma Receiver');
    expect(rows[1].textContent).toContain('15');
    expect(rows[1].textContent).toContain('5.0');
  });

  it('shows a loading state, then an error with retry', async () => {
    mockFetchUsage.mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(screen.getByText(/Loading red-zone leaders/)).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load red-zone data/)).toBeInTheDocument();
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        alpha: { 5: line(6), 6: line(6), 7: line(6) },
        beta: { 5: line(2), 6: line(4), 7: line(3) },
        gamma: { 5: line(5), 6: line(5), 7: line(5) },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('table', { name: /Red-zone opportunity leaders at RB/ });
  });

  it('shows an empty state when no player has red-zone work', async () => {
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
      expect(screen.getByText(/No RB red-zone leaders for weeks 5–7 yet/)).toBeInTheDocument(),
    );
  });
});
