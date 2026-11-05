// TargetVolumeLeadersPage (backlog item 155): the /target-volume
// board renders per-position target leaders from mocked Sleeper
// usage, with tab swaps, loading / error-with-retry / empty states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TargetVolumeLeadersPage } from './TargetVolumeLeadersPage';
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

function line(targets: number, receptions = 5) {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets,
    rushAtt: 10,
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
    passTd: 0, rushFd: 0, recFd: 0,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TargetVolumeLeadersPage pool={pool} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is weeks 5–7. Alpha: 30 targets (10.0/gm, 23 receptions,
  // 76.7% catch); Beta: 18 (6.0/gm); Gamma: 12 (4.0/gm).
  mockFetchUsage.mockResolvedValue({
    season: 2026,
    weeks: [5, 6, 7],
    usageBySleeperId: {
      alpha: { 5: line(12, 9), 6: line(9, 6), 7: line(9, 8) },
      beta: { 5: line(6, 4), 6: line(5, 3), 7: line(7, 5) },
      gamma: { 5: line(4, 3), 6: line(5, 4), 7: line(3, 2) },
    },
  });
});

describe('TargetVolumeLeadersPage', () => {
  it('ranks WRs by targets per game with receptions and catch rate', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /Target Volume leaders at WR/ });
    const rows = within(table).getAllByRole('row');
    // Header + 2 WR rows.
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Alpha Receiver');
    const alphaCells = within(rows[1]).getAllByRole('cell');
    expect(alphaCells[2].textContent).toBe('30');
    expect(alphaCells[3].textContent).toBe('10.0');
    expect(alphaCells[4].textContent).toBe('23');
    expect(alphaCells[5].textContent).toBe('76.7%');
    expect(within(rows[2]).getByRole('rowheader').textContent).toContain('Beta Receiver');
    const betaCells = within(rows[2]).getAllByRole('cell');
    expect(betaCells[2].textContent).toBe('18');
    expect(betaCells[3].textContent).toBe('6.0');
  });

  it('swaps to the RB tab in place', async () => {
    renderPage();
    await screen.findByRole('table', { name: /Target Volume leaders at WR/ });
    fireEvent.click(screen.getByRole('button', { name: 'RB' }));
    const table = await screen.findByRole('table', { name: /Target Volume leaders at RB/ });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Gamma Back');
    const gammaCells = within(rows[1]).getAllByRole('cell');
    expect(gammaCells[2].textContent).toBe('12');
    expect(gammaCells[3].textContent).toBe('4.0');
    expect(gammaCells[4].textContent).toBe('9');
    expect(gammaCells[5].textContent).toBe('75.0%');
  });

  it('shows a loading state, then an error with retry', async () => {
    mockFetchUsage.mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(screen.getByText(/Loading Target Volume leaders/)).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load Target Volume data/)).toBeInTheDocument();
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        alpha: { 5: line(12, 9), 6: line(9, 6), 7: line(9, 8) },
        beta: { 5: line(6, 4), 6: line(5, 3), 7: line(7, 5) },
        gamma: { 5: line(4, 3), 6: line(5, 4), 7: line(3, 2) },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('table', { name: /Target Volume leaders at WR/ });
  });

  it('shows an empty state when no player has targets', async () => {
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
      expect(screen.getByText(/No WR Target Volume leaders for weeks 5–7 yet/)).toBeInTheDocument(),
    );
  });
});
