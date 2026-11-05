// DeepPlayLeadersPage (backlog item 147): the /deep-plays board renders
// per-position deep-reception leaders from mocked Sleeper usage, with tab
// swaps, loading / error-with-retry / empty states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DeepPlayLeadersPage } from './DeepPlayLeadersPage';
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

function line(deepRec: number, longRec = 30) {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets: 10,
    rushAtt: 0,
    receptions: 0,
    rzOpps: 0,
    airYards: 0,
    deepRec,
    longRec,
    yac: 0,
    recYards: 0, rushYards: 0,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DeepPlayLeadersPage pool={pool} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is weeks 5–7. Alpha: 6 deep rec (2.0/gm, long 60); Beta: 3
  // (1.0/gm); Gamma: 6 (2.0/gm, long 30). Team DAL weeks 5–7 total 15.
  mockFetchUsage.mockResolvedValue({
    season: 2026,
    weeks: [5, 6, 7],
    usageBySleeperId: {
      alpha: { 5: line(2, 45), 6: line(1, 22), 7: line(3, 60) },
      beta: { 5: line(1), 6: line(1), 7: line(1) },
      gamma: { 5: line(2), 6: line(2), 7: line(2) },
    },
  });
});

describe('DeepPlayLeadersPage', () => {
  it('ranks WRs by deep receptions per game with share and longest catch', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /Deep-play leaders at WR/ });
    const rows = within(table).getAllByRole('row');
    // Header + 1 WR row.
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Gamma Receiver');
    expect(rows[1].textContent).toContain('6');
    expect(rows[1].textContent).toContain('2.0');
    expect(rows[1].textContent).toContain('40%');
    expect(rows[1].textContent).toContain('30');
  });

  it('swaps to the RB tab in place', async () => {
    renderPage();
    await screen.findByRole('table', { name: /Deep-play leaders at WR/ });
    fireEvent.click(screen.getByRole('button', { name: 'RB' }));
    const table = await screen.findByRole('table', { name: /Deep-play leaders at RB/ });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Alpha Back');
    expect(rows[1].textContent).toContain('6');
    expect(rows[1].textContent).toContain('2.0');
    expect(rows[1].textContent).toContain('40%');
    expect(rows[1].textContent).toContain('60');
    expect(within(rows[2]).getByRole('rowheader').textContent).toContain('Beta Back');
    expect(rows[2].textContent).toContain('3');
    expect(rows[2].textContent).toContain('1.0');
  });

  it('shows a loading state, then an error with retry', async () => {
    mockFetchUsage.mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(screen.getByText(/Loading deep-play leaders/)).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load deep-play data/)).toBeInTheDocument();
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        alpha: { 5: line(2, 45), 6: line(1, 22), 7: line(3, 60) },
        beta: { 5: line(1), 6: line(1), 7: line(1) },
        gamma: { 5: line(2), 6: line(2), 7: line(2) },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('table', { name: /Deep-play leaders at WR/ });
  });

  it('shows an empty state when no player has a deep reception', async () => {
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
      expect(screen.getByText(/No WR deep-play leaders for weeks 5–7 yet/)).toBeInTheDocument(),
    );
  });
});
