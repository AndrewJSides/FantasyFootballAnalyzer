// PassAttemptsLeadersPage (backlog item 167): the /pass-attempts
// board renders quarterback pass-attempt leaders from mocked Sleeper
// usage, with loading / error-with-retry / empty states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PassAttemptsLeadersPage } from './PassAttemptsLeadersPage';
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

function line(passAtt: number, passCmp: number, passYards = 250) {
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
    passTd: 0,
    passAtt,
    passCmp,
    rushFd: 0,
    recFd: 0,
    ptsPpr: 0,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <PassAttemptsLeadersPage pool={pool} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is weeks 5–7. Alpha: 120 att (40.0/gm, 78 cmp, 65.0%);
  // Beta: 90 (30.0/gm, 60 cmp, 66.7%); Gamma: 105 (35.0/gm, 70 cmp, 66.7%).
  mockFetchUsage.mockResolvedValue({
    season: 2026,
    weeks: [5, 6, 7],
    usageBySleeperId: {
      alpha: { 5: line(40, 26), 6: line(40, 26), 7: line(40, 26) },
      beta: { 5: line(30, 20), 6: line(30, 20), 7: line(30, 20) },
      gamma: { 5: line(35, 24), 6: line(35, 23), 7: line(35, 23) },
    },
  });
});

describe('PassAttemptsLeadersPage', () => {
  it('ranks QBs by pass attempts per game with the completion split', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /Pass-attempts leaders at QB/ });
    const rows = within(table).getAllByRole('row');
    // Header + 3 QB rows.
    expect(rows).toHaveLength(4);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Alpha Passer');
    const alphaCells = within(rows[1]).getAllByRole('cell');
    expect(alphaCells[2].textContent).toBe('120');
    expect(alphaCells[3].textContent).toBe('40.0');
    expect(alphaCells[4].textContent).toBe('78');
    expect(alphaCells[5].textContent).toBe('65.0%');
    expect(alphaCells[6].textContent).toBe('750');
    expect(within(rows[2]).getByRole('rowheader').textContent).toContain('Gamma Passer');
    const gammaCells = within(rows[2]).getAllByRole('cell');
    expect(gammaCells[2].textContent).toBe('105');
    expect(gammaCells[3].textContent).toBe('35.0');
    expect(within(rows[3]).getByRole('rowheader').textContent).toContain('Beta Passer');
  });

  it('shows a loading state, then an error with retry', async () => {
    mockFetchUsage.mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(screen.getByText(/Loading pass-attempts leaders/)).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load pass-attempts data/)).toBeInTheDocument();
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        alpha: { 5: line(40, 26), 6: line(40, 26), 7: line(40, 26) },
        beta: { 5: line(30, 20), 6: line(30, 20), 7: line(30, 20) },
        gamma: { 5: line(35, 24), 6: line(35, 23), 7: line(35, 23) },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('table', { name: /Pass-attempts leaders at QB/ });
  });

  it('shows an empty state when no QB has pass attempts', async () => {
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
      expect(screen.getByText(/No QB pass-attempts leaders for weeks 5–7 yet/)).toBeInTheDocument(),
    );
  });

  it('announces each row as a plain-language summary', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /Pass-attempts leaders at QB/ });
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]).getByRole('rowheader').getAttribute('aria-label')).toContain(
      'Alpha Passer (QB, DAL): 120 pass attempts over his last 3 games (40 attempts per game, 78 completions, 65% completion, 750 passing yards)',
    );
  });
});
