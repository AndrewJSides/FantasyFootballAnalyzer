// CatchRateLeadersPage (backlog item 148): the /catch-rate board renders
// per-position catch-rate leaders from mocked Sleeper usage, with tab
// swaps, loading / error-with-retry / empty states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CatchRateLeadersPage } from './CatchRateLeadersPage';
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

function line(targets: number, receptions: number) {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets,
    rushAtt: 0,
    receptions,
    rzOpps: 0,
    airYards: 0,
    deepRec: 0,
    longRec: 0, yac: 0, recYards: 0,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CatchRateLeadersPage pool={pool} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is weeks 5–7. Alpha: 18/20 = 90.0% (6.7 tgt/gm); Beta:
  // 12/20 = 60.0%; Gamma: 15/18 = 83.3% (6.0 tgt/gm).
  mockFetchUsage.mockResolvedValue({
    season: 2026,
    weeks: [5, 6, 7],
    usageBySleeperId: {
      alpha: { 5: line(7, 6), 6: line(6, 6), 7: line(7, 6) },
      beta: { 5: line(7, 4), 6: line(6, 4), 7: line(7, 4) },
      gamma: { 5: line(6, 5), 6: line(6, 5), 7: line(6, 5) },
    },
  });
});

describe('CatchRateLeadersPage', () => {
  it('ranks WRs by catch rate with targets, receptions, and targets per game', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /Catch-rate leaders at WR/ });
    const rows = within(table).getAllByRole('row');
    // Header + 1 WR row.
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Gamma Receiver');
    expect(rows[1].textContent).toContain('83.3%');
    expect(rows[1].textContent).toContain('18');
    expect(rows[1].textContent).toContain('15');
    expect(rows[1].textContent).toContain('6.0');
  });

  it('swaps to the RB tab in place', async () => {
    renderPage();
    await screen.findByRole('table', { name: /Catch-rate leaders at WR/ });
    fireEvent.click(screen.getByRole('button', { name: 'RB' }));
    const table = await screen.findByRole('table', { name: /Catch-rate leaders at RB/ });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Alpha Back');
    expect(rows[1].textContent).toContain('90.0%');
    expect(rows[1].textContent).toContain('20');
    expect(rows[1].textContent).toContain('18');
    expect(within(rows[2]).getByRole('rowheader').textContent).toContain('Beta Back');
    expect(rows[2].textContent).toContain('60.0%');
  });

  it('shows a loading state, then an error with retry', async () => {
    mockFetchUsage.mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(screen.getByText(/Loading catch-rate leaders/)).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load catch-rate data/)).toBeInTheDocument();
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        alpha: { 5: line(7, 6), 6: line(6, 6), 7: line(7, 6) },
        beta: { 5: line(7, 4), 6: line(6, 4), 7: line(7, 4) },
        gamma: { 5: line(6, 5), 6: line(6, 5), 7: line(6, 5) },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('table', { name: /Catch-rate leaders at WR/ });
  });

  it('shows an empty state when no player clears the target floor', async () => {
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        alpha: { 5: line(2, 2), 6: line(2, 2), 7: line(2, 2) },
        beta: { 5: line(3, 3), 6: line(3, 3), 7: line(3, 3) },
        gamma: { 5: line(3, 3), 6: line(3, 3), 7: line(3, 3) },
      },
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/No WR catch-rate leaders for weeks 5–7 yet/)).toBeInTheDocument(),
    );
  });
});
