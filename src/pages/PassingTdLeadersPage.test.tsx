// PassingTdLeadersPage (backlog item 164): the /passing-touchdowns
// board renders quarterback passing-touchdown leaders from mocked
// Sleeper usage, with loading / error-with-retry / empty states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PassingTdLeadersPage } from './PassingTdLeadersPage';
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
      <PassingTdLeadersPage pool={pool} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is weeks 5–7. Alpha: 8 TDs (2.7/gm, 600 yards);
  // Beta: 3 TDs (1.0/gm, 1020 yards); Gamma: 5 TDs (1.7/gm, 840 yards).
  mockFetchUsage.mockResolvedValue({
    season: 2026,
    weeks: [5, 6, 7],
    usageBySleeperId: {
      alpha: { 5: line(200, 3), 6: line(210, 2), 7: line(190, 3) },
      beta: { 5: line(350, 1), 6: line(330, 1), 7: line(340, 1) },
      gamma: { 5: line(280, 2), 6: line(290, 1), 7: line(270, 2) },
    },
  });
});

describe('PassingTdLeadersPage', () => {
  it('ranks QBs by passing touchdowns per game with the yardage split', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /Passing Touchdowns leaders at QB/ });
    const rows = within(table).getAllByRole('row');
    // Header + 3 QB rows.
    expect(rows).toHaveLength(4);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Alpha Passer');
    const alphaCells = within(rows[1]).getAllByRole('cell');
    expect(alphaCells[2].textContent).toBe('8');
    expect(alphaCells[3].textContent).toBe('2.7');
    expect(alphaCells[4].textContent).toBe('600');
    expect(alphaCells[5].textContent).toBe('200.0');
    expect(within(rows[2]).getByRole('rowheader').textContent).toContain('Gamma Passer');
    const gammaCells = within(rows[2]).getAllByRole('cell');
    expect(gammaCells[2].textContent).toBe('5');
    expect(gammaCells[3].textContent).toBe('1.7');
    expect(within(rows[3]).getByRole('rowheader').textContent).toContain('Beta Passer');
  });

  it('shows a loading state, then an error with retry', async () => {
    mockFetchUsage.mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(screen.getByText(/Loading Passing Touchdowns leaders/)).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load Passing Touchdowns data/)).toBeInTheDocument();
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        alpha: { 5: line(200, 3), 6: line(210, 2), 7: line(190, 3) },
        beta: { 5: line(350, 1), 6: line(330, 1), 7: line(340, 1) },
        gamma: { 5: line(280, 2), 6: line(290, 1), 7: line(270, 2) },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('table', { name: /Passing Touchdowns leaders at QB/ });
  });

  it('shows an empty state when no QB has passing touchdowns', async () => {
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        alpha: { 5: line(300, 0), 6: line(300, 0), 7: line(300, 0) },
        beta: { 5: line(300, 0), 6: line(300, 0), 7: line(300, 0) },
        gamma: { 5: line(300, 0), 6: line(300, 0), 7: line(300, 0) },
      },
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/No QB Passing Touchdowns leaders for weeks 5–7 yet/)).toBeInTheDocument(),
    );
  });

  it('announces each row as a plain-language summary', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /Passing Touchdowns leaders at QB/ });
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]).getByRole('rowheader').getAttribute('aria-label')).toContain(
      'Alpha Passer (QB, DAL): 8 passing touchdowns over his last 3 games (2.7 touchdowns per game, 600 passing yards, 200 yards per game)',
    );
  });
});
