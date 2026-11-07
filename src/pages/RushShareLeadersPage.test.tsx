// RushShareLeadersPage (backlog item 184): the /rush-share board
// renders per-position rush-share leaders from mocked Sleeper usage,
// with tab swaps, loading / error-with-retry / empty states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RushShareLeadersPage } from './RushShareLeadersPage';
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
    pl('qb', 'Qb Scrambler', 'QB'),
  ],
};

function line(rushAtt: number, rushYards = 60) {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets: 0,
    rushAtt,
    receptions: 0,
    rzOpps: 0,
    airYards: 0,
    deepRec: 0,
    longRec: 0,
    yac: 0,
    recYards: 0,
    rushYards, rushTd: 0, recTd: 0, passYards: 0, passTd: 0, passAtt: 0, passCmp: 0, rushFd: 0, recFd: 0, ptsPpr: 0,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <RushShareLeadersPage pool={pool} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is weeks 5–7. Team DAL rush attempts/week: 20 (Alpha) + 10
  // (Beta) + 2 (Gamma) + 3 (QB scrambles) = 35. Alpha: 60/105 = 57%;
  // Beta: 30/105 = 29%; Gamma: 6/105 = 6%.
  mockFetchUsage.mockResolvedValue({
    season: 2026,
    weeks: [5, 6, 7],
    usageBySleeperId: {
      alpha: { 5: line(20, 100), 6: line(20, 100), 7: line(20, 100) },
      beta: { 5: line(10, 50), 6: line(10, 50), 7: line(10, 50) },
      gamma: { 5: line(2, 10), 6: line(2, 10), 7: line(2, 10) },
      qb: { 5: line(3, 15), 6: line(3, 15), 7: line(3, 15) },
    },
  });
});

describe('RushShareLeadersPage', () => {
  it('ranks RBs by rush share with attempts and yards per game', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /Rush share leaders at RB/ });
    const rows = within(table).getAllByRole('row');
    // Header + 2 RB rows.
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Alpha Back');
    expect(rows[1].textContent).toContain('57%');
    expect(rows[1].textContent).toContain('20.0');
    expect(rows[1].textContent).toContain('100.0');
    expect(within(rows[2]).getByRole('rowheader').textContent).toContain('Beta Back');
    expect(rows[2].textContent).toContain('29%');
    expect(rows[2].textContent).toContain('10.0');
    expect(rows[2].textContent).toContain('50.0');
  });

  it('swaps to the WR tab in place', async () => {
    renderPage();
    await screen.findByRole('table', { name: /Rush share leaders at RB/ });
    fireEvent.click(screen.getByRole('button', { name: 'WR' }));
    const table = await screen.findByRole('table', { name: /Rush share leaders at WR/ });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Gamma Receiver');
    expect(rows[1].textContent).toContain('6%');
    expect(rows[1].textContent).toContain('2.0');
  });

  it('shows a loading state, then an error with retry', async () => {
    mockFetchUsage.mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(screen.getByText(/Loading rush shares/)).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load rush-share data/)).toBeInTheDocument();
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        alpha: { 5: line(20, 100), 6: line(20, 100), 7: line(20, 100) },
        beta: { 5: line(10, 50), 6: line(10, 50), 7: line(10, 50) },
        gamma: { 5: line(2, 10), 6: line(2, 10), 7: line(2, 10) },
        qb: { 5: line(3, 15), 6: line(3, 15), 7: line(3, 15) },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(screen.getByRole('table', { name: /Rush share leaders at RB/ })).toBeInTheDocument(),
    );
  });

  it('shows an empty state when no player qualifies at the position', async () => {
    renderPage();
    await screen.findByRole('table', { name: /Rush share leaders at RB/ });
    fireEvent.click(screen.getByRole('button', { name: 'TE' }));
    expect(await screen.findByText(/No TE rush-share leaders/)).toBeInTheDocument();
  });
});
