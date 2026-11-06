// SnapCountLeadersPage (backlog item 159): the /snap-counts board
// renders per-position snap-share leaders from mocked Sleeper usage,
// with tab swaps, loading / error-with-retry / empty states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SnapCountLeadersPage } from './SnapCountLeadersPage';
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

function line(offSnaps: number, teamSnaps = 70) {
  return {
    offSnaps,
    teamSnaps,
    targets: 0,
    rushAtt: 0,
    receptions: 0,
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
    passTd: 0,
    passAtt: 0,
    passCmp: 0,
    rushFd: 0,
    recFd: 0,
    ptsPpr: 0,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SnapCountLeadersPage pool={pool} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is weeks 5–7. Alpha: 180 snaps (85.7%); Beta: 150 (71.4%);
  // Gamma: 200 (95.2%).
  mockFetchUsage.mockResolvedValue({
    season: 2026,
    weeks: [5, 6, 7],
    usageBySleeperId: {
      alpha: { 5: line(60), 6: line(60), 7: line(60) },
      beta: { 5: line(50), 6: line(50), 7: line(50) },
      gamma: { 5: line(65), 6: line(70), 7: line(65) },
    },
  });
});

describe('SnapCountLeadersPage', () => {
  it('ranks RBs by snap share on the default tab', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /Snap Count leaders at RB/ });
    const rows = within(table).getAllByRole('row');
    // Header + 2 RB rows.
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Alpha Back');
    const alphaCells = within(rows[1]).getAllByRole('cell');
    expect(alphaCells[2].textContent).toBe('180');
    expect(alphaCells[3].textContent).toBe('85.7%');
    expect(alphaCells[4].textContent).toBe('60.0');
    expect(alphaCells[5].textContent).toBe('3');
    expect(within(rows[2]).getByRole('rowheader').textContent).toContain('Beta Back');
    const betaCells = within(rows[2]).getAllByRole('cell');
    expect(betaCells[2].textContent).toBe('150');
    expect(betaCells[3].textContent).toBe('71.4%');
  });

  it('swaps to the WR tab in place', async () => {
    renderPage();
    await screen.findByRole('table', { name: /Snap Count leaders at RB/ });
    fireEvent.click(screen.getByRole('button', { name: 'WR' }));
    const table = await screen.findByRole('table', { name: /Snap Count leaders at WR/ });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Gamma Receiver');
    const gammaCells = within(rows[1]).getAllByRole('cell');
    expect(gammaCells[2].textContent).toBe('200');
    expect(gammaCells[3].textContent).toBe('95.2%');
    expect(gammaCells[4].textContent).toBe('66.7');
    expect(gammaCells[5].textContent).toBe('3');
  });

  it('shows a loading state, then an error with retry', async () => {
    mockFetchUsage.mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(screen.getByText(/Loading Snap Count leaders/)).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load Snap Count data/)).toBeInTheDocument();
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        alpha: { 5: line(60), 6: line(60), 7: line(60) },
        beta: { 5: line(50), 6: line(50), 7: line(50) },
        gamma: { 5: line(65), 6: line(70), 7: line(65) },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('table', { name: /Snap Count leaders at RB/ });
  });

  it('shows an empty state when no player has snaps', async () => {
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
      expect(screen.getByText(/No RB Snap Count leaders for weeks 5–7 yet/)).toBeInTheDocument(),
    );
  });
});
