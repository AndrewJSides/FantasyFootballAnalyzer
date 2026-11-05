// PassingLeadersPage (backlog item 154): the /passing board
// renders quarterback passing leaders from mocked Sleeper usage,
// with loading / error-with-retry / empty states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PassingLeadersPage } from './PassingLeadersPage';
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
    pl('alpha', 'Alpha Passer', 'QB'),
    pl('beta', 'Beta Passer', 'QB'),
    pl('gamma', 'Gamma Passer', 'QB'),
  ],
};

function line(passYards: number, passTd: number) {
  return {
    offSnaps: 60,
    teamSnaps: 70,
    targets: 0,
    rushAtt: 2,
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
    passYards,
    passTd,
    rushFd: 0,
    recFd: 0,
    ptsPpr: 0,
    ptsPpr: 0,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <PassingLeadersPage pool={pool} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is weeks 5–7. Alpha: 900 yards (300.0/gm, 6 TDs);
  // Beta: 600 (200.0/gm, 2 TDs); Gamma: 840 (280.0/gm, 5 TDs).
  mockFetchUsage.mockResolvedValue({
    season: 2026,
    weeks: [5, 6, 7],
    usageBySleeperId: {
      alpha: { 5: line(300, 2), 6: line(250, 1), 7: line(350, 3) },
      beta: { 5: line(200, 1), 6: line(220, 0), 7: line(180, 1) },
      gamma: { 5: line(280, 2), 6: line(290, 2), 7: line(270, 1) },
    },
  });
});

describe('PassingLeadersPage', () => {
  it('ranks QBs by passing yards per game with the TD split', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /Passing leaders at QB/ });
    const rows = within(table).getAllByRole('row');
    // Header + 3 QB rows.
    expect(rows).toHaveLength(4);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Alpha Passer');
    const alphaCells = within(rows[1]).getAllByRole('cell');
    expect(alphaCells[2].textContent).toBe('900');
    expect(alphaCells[3].textContent).toBe('300.0');
    expect(alphaCells[4].textContent).toBe('6');
    expect(alphaCells[5].textContent).toBe('2.0');
    expect(within(rows[2]).getByRole('rowheader').textContent).toContain('Gamma Passer');
    const gammaCells = within(rows[2]).getAllByRole('cell');
    expect(gammaCells[2].textContent).toBe('840');
    expect(gammaCells[3].textContent).toBe('280.0');
    expect(within(rows[3]).getByRole('rowheader').textContent).toContain('Beta Passer');
  });

  it('shows a loading state, then an error with retry', async () => {
    mockFetchUsage.mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(screen.getByText(/Loading Passing leaders/)).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load Passing data/)).toBeInTheDocument();
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        alpha: { 5: line(300, 2), 6: line(250, 1), 7: line(350, 3) },
        beta: { 5: line(200, 1), 6: line(220, 0), 7: line(180, 1) },
        gamma: { 5: line(280, 2), 6: line(290, 2), 7: line(270, 1) },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('table', { name: /Passing leaders at QB/ });
  });

  it('shows an empty state when no QB has passing yards', async () => {
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
      expect(screen.getByText(/No QB Passing leaders for weeks 5–7 yet/)).toBeInTheDocument(),
    );
  });

  it('announces each row as a plain-language summary', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /Passing leaders at QB/ });
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]).getByRole('rowheader').getAttribute('aria-label')).toContain(
      'Alpha Passer (QB, DAL): 900 passing yards over his last 3 games (300 yards per game, 6 passing touchdowns, 2 touchdowns per game)',
    );
  });
});
