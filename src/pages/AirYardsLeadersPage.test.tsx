// AirYardsLeadersPage (backlog item 146): the /air-yards board renders
// per-position air-yards leaders from mocked Sleeper usage, with tab
// swaps, loading / error-with-retry / empty states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AirYardsLeadersPage } from './AirYardsLeadersPage';
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

function line(airYards: number, targets = 10) {
  return { offSnaps: 50, teamSnaps: 70, targets, rushAtt: 0, receptions: 0, rzOpps: 0, airYards, deepRec: 0, longRec: 0, yac: 0, recYards: 0, rushYards: 0, rushTd: 0, recTd: 0, passYards: 0, passTd: 0, rushFd: 0, recFd: 0, ptsPpr: 0, ptsPpr: 0 };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AirYardsLeadersPage pool={pool} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is weeks 5–7. Alpha: 180 air yards (60/gm); Beta: 90 (30/gm);
  // Gamma: 150 (50/gm, aDOT 5.0). Team DAL weeks 5–7 total 420.
  mockFetchUsage.mockResolvedValue({
    season: 2026,
    weeks: [5, 6, 7],
    usageBySleeperId: {
      alpha: { 5: line(60), 6: line(60), 7: line(60) },
      beta: { 5: line(20), 6: line(40), 7: line(30) },
      gamma: { 5: line(50), 6: line(50), 7: line(50) },
    },
  });
});

describe('AirYardsLeadersPage', () => {
  it('ranks WRs by air yards per game with share and aDOT', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /Air-yards leaders at WR/ });
    const rows = within(table).getAllByRole('row');
    // Header + 1 WR row.
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Gamma Receiver');
    expect(rows[1].textContent).toContain('150');
    expect(rows[1].textContent).toContain('50.0');
    expect(rows[1].textContent).toContain('36%');
    expect(rows[1].textContent).toContain('5.0');
  });

  it('swaps to the RB tab in place', async () => {
    renderPage();
    await screen.findByRole('table', { name: /Air-yards leaders at WR/ });
    fireEvent.click(screen.getByRole('button', { name: 'RB' }));
    const table = await screen.findByRole('table', { name: /Air-yards leaders at RB/ });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Alpha Back');
    expect(rows[1].textContent).toContain('180');
    expect(rows[1].textContent).toContain('60.0');
    expect(rows[1].textContent).toContain('43%');
    expect(within(rows[2]).getByRole('rowheader').textContent).toContain('Beta Back');
    expect(rows[2].textContent).toContain('90');
    expect(rows[2].textContent).toContain('30.0');
  });

  it('shows a loading state, then an error with retry', async () => {
    mockFetchUsage.mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(screen.getByText(/Loading air-yards leaders/)).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load air-yards data/)).toBeInTheDocument();
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        alpha: { 5: line(60), 6: line(60), 7: line(60) },
        beta: { 5: line(20), 6: line(40), 7: line(30) },
        gamma: { 5: line(50), 6: line(50), 7: line(50) },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('table', { name: /Air-yards leaders at WR/ });
  });

  it('shows an empty state when no player has downfield work', async () => {
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        alpha: { 5: line(0), 6: line(0), 7: line(0) },
        beta: { 5: line(-4), 6: line(2), 7: line(2) },
        gamma: { 5: line(0), 6: line(0), 7: line(0) },
      },
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/No WR air-yards leaders for weeks 5–7 yet/)).toBeInTheDocument(),
    );
  });
});
