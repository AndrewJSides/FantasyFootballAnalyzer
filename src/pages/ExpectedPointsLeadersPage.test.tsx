// ExpectedPointsLeadersPage (backlog item 195): the /expected-points
// board renders per-position expected-points leaders from mocked
// Sleeper usage, with tab swaps, loading / error-with-retry / empty
// states, and the QB tab's pass-attempts column.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ExpectedPointsLeadersPage } from './ExpectedPointsLeadersPage';
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
    pl('delta', 'Delta Passer', 'QB'),
  ],
};

function line(over: Record<string, number> = {}) {
  return {
    offSnaps: 50,
    teamSnaps: 70,
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
    passInt: 0,
    rushFd: 0,
    recFd: 0,
    ptsPpr: 0,
    ...over,
  };
}

// Rate-clean fixture lines (window rates: RB 1.0/target + 0.4/carry,
// WR 2.0/target, QB 17/30 per pass attempt + 0.5/carry).
function rbWeek(ptsPpr: number) {
  return line({
    targets: 10,
    receptions: 5,
    recYards: 50,
    rushAtt: 10,
    rushYards: 40,
    ptsPpr,
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ExpectedPointsLeadersPage pool={pool} />
    </MemoryRouter>,
  );
}

const usage = {
  season: 2026,
  weeks: [5, 6, 7],
  usageBySleeperId: {
    alpha: { 5: rbWeek(14), 6: rbWeek(14), 7: rbWeek(14) },
    beta: { 5: rbWeek(20), 6: rbWeek(20), 7: rbWeek(20) },
    gamma: {
      5: line({ targets: 10, receptions: 6, recYards: 80, recTd: 1, ptsPpr: 20 }),
      6: line({ targets: 10, receptions: 6, recYards: 80, recTd: 1, ptsPpr: 20 }),
      7: line({ targets: 10, receptions: 6, recYards: 80, recTd: 1, ptsPpr: 20 }),
    },
    delta: {
      5: line({ passAtt: 30, passCmp: 20, passYards: 250, passTd: 2, passInt: 1, rushAtt: 5, rushYards: 25, ptsPpr: 19.5 }),
      6: line({ passAtt: 30, passCmp: 20, passYards: 250, passTd: 2, passInt: 1, rushAtt: 5, rushYards: 25, ptsPpr: 19.5 }),
      7: line({ passAtt: 30, passCmp: 20, passYards: 250, passTd: 2, passInt: 1, rushAtt: 5, rushYards: 25, ptsPpr: 19.5 }),
    },
  },
};

beforeEach(() => {
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is weeks 5–7. Alpha: 14.0 expected / 14.0 actual; Beta:
  // 14.0 expected / 20.0 actual (+6.0 FPOE); Gamma: 20.0 / 20.0;
  // Delta: 19.5 expected / 19.5 actual on 30 pass attempts a game.
  mockFetchUsage.mockResolvedValue(usage);
});

describe('ExpectedPointsLeadersPage', () => {
  it('ranks RBs by expected points with actual and the signed FPOE gap', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /Expected-points leaders at RB/ });
    const rows = within(table).getAllByRole('row');
    // Header + 2 RB rows, Beta first on the actual-points tie-break.
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Beta Back');
    expect(rows[1].textContent).toContain('14.0');
    expect(rows[1].textContent).toContain('20.0');
    expect(rows[1].textContent).toContain('+6.0');
    expect(rows[1].textContent).toContain('10.0');
    expect(within(rows[2]).getByRole('rowheader').textContent).toContain('Alpha Back');
    expect(rows[2].textContent).toContain('14.0');
    expect(rows[2].textContent).toContain('0.0');
  });

  it('swaps to the WR tab in place', async () => {
    renderPage();
    await screen.findByRole('table', { name: /Expected-points leaders at RB/ });
    fireEvent.click(screen.getByRole('button', { name: 'WR' }));
    const table = await screen.findByRole('table', { name: /Expected-points leaders at WR/ });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Gamma Receiver');
    expect(rows[1].textContent).toContain('20.0');
    expect(rows[1].textContent).toContain('0.0');
    expect(rows[1].textContent).toContain('10.0');
  });

  it('shows pass attempts per game on the QB tab', async () => {
    renderPage();
    await screen.findByRole('table', { name: /Expected-points leaders at RB/ });
    fireEvent.click(screen.getByRole('button', { name: 'QB' }));
    const table = await screen.findByRole('table', { name: /Expected-points leaders at QB/ });
    expect(within(table).getByText('Pass/gm')).toBeInTheDocument();
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Delta Passer');
    expect(rows[1].textContent).toContain('19.5');
    expect(rows[1].textContent).toContain('30.0');
    expect(rows[1].textContent).toContain('5.0');
  });

  it('shows a loading state, then an error with retry', async () => {
    mockFetchUsage.mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(screen.getByText(/Loading expected-points leaders/)).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load expected-points data/)).toBeInTheDocument();
    mockFetchUsage.mockResolvedValue(usage);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('table', { name: /Expected-points leaders at RB/ });
  });

  it('shows an empty state when no player has a workload', async () => {
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        alpha: { 5: line(), 6: line(), 7: line() },
        beta: { 5: line(), 6: line(), 7: line() },
        gamma: { 5: line(), 6: line(), 7: line() },
        delta: { 5: line(), 6: line(), 7: line() },
      },
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/No RB expected-points leaders for weeks 5–7 yet/)).toBeInTheDocument(),
    );
  });
});
