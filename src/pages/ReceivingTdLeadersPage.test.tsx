// ReceivingTdLeadersPage (backlog item 166): the /receiving-touchdowns
// board renders per-position receiving-touchdown leaders from mocked
// Sleeper usage, with tab swaps, loading / error-with-retry / empty
// states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReceivingTdLeadersPage } from './ReceivingTdLeadersPage';
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
    pl('gamma', 'Gamma Tight End', 'TE'),
  ],
};

function line(recTd: number, recYards = 80, receptions = 5) {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets: 0,
    rushAtt: 0,
    receptions,
    rzOpps: 0,
    airYards: 0,
    deepRec: 0,
    longRec: 0,
    yac: 0,
    recYards,
    rushYards: 0, rushTd: 0, recTd, passYards: 0, passTd: 0, passAtt: 0, passCmp: 0, rushFd: 0, recFd: 0, ptsPpr: 0,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ReceivingTdLeadersPage pool={pool} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is weeks 5–7. Alpha: 6 TDs (2.0/gm); Beta: 3 (1.0/gm);
  // Gamma: 3 (1.0/gm).
  mockFetchUsage.mockResolvedValue({
    season: 2026,
    weeks: [5, 6, 7],
    usageBySleeperId: {
      alpha: { 5: line(2), 6: line(2), 7: line(2) },
      beta: { 5: line(1), 6: line(1), 7: line(1) },
      gamma: { 5: line(1), 6: line(1), 7: line(1) },
    },
  });
});

describe('ReceivingTdLeadersPage', () => {
  it('ranks WRs by receiving touchdowns per game with yards and receptions', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /Receiving-touchdowns leaders at WR/ });
    const rows = within(table).getAllByRole('row');
    // Header + 2 WR rows.
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Alpha Receiver');
    expect(rows[1].textContent).toContain('6');
    expect(rows[1].textContent).toContain('2.0');
    expect(rows[1].textContent).toContain('240');
    expect(rows[1].textContent).toContain('15');
    expect(within(rows[2]).getByRole('rowheader').textContent).toContain('Beta Receiver');
    expect(rows[2].textContent).toContain('3');
    expect(rows[2].textContent).toContain('1.0');
  });

  it('swaps to the TE tab in place', async () => {
    renderPage();
    await screen.findByRole('table', { name: /Receiving-touchdowns leaders at WR/ });
    fireEvent.click(screen.getByRole('button', { name: 'TE' }));
    const table = await screen.findByRole('table', { name: /Receiving-touchdowns leaders at TE/ });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Gamma Tight End');
    expect(rows[1].textContent).toContain('3');
    expect(rows[1].textContent).toContain('1.0');
  });

  it('shows a loading state, then an error with retry', async () => {
    mockFetchUsage.mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(screen.getByText(/Loading receiving-touchdowns leaders/)).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load receiving-touchdowns data/)).toBeInTheDocument();
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        alpha: { 5: line(2), 6: line(2), 7: line(2) },
        beta: { 5: line(1), 6: line(1), 7: line(1) },
        gamma: { 5: line(1), 6: line(1), 7: line(1) },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('table', { name: /Receiving-touchdowns leaders at WR/ });
  });

  it('shows an empty state when no player has receiving touchdowns', async () => {
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
      expect(screen.getByText(/No WR receiving-touchdowns leaders for weeks 5–7 yet/)).toBeInTheDocument(),
    );
  });
});
