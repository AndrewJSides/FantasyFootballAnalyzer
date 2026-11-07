// TdRegressionPage (backlog item 179): the /td-regression board renders
// per-position due/cooling lists from mocked Sleeper usage, with tab
// swaps, loading / error-with-retry / empty states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TdRegressionPage } from './TdRegressionPage';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

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

function line(rzOpps: number, rushTd = 0, recTd = 0): WeeklyUsageLine {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets: 0,
    rushAtt: 0,
    receptions: 0,
    rzOpps,
    airYards: 0,
    deepRec: 0,
    longRec: 0,
    yac: 0,
    recYards: 0,
    rushYards: 0,
    rushTd,
    recTd,
    passYards: 0,
    passTd: 0,
    passAtt: 0,
    passCmp: 0,
    rushFd: 0,
    recFd: 0,
    ptsPpr: 0,
  };
}

/** Three completed weeks (5, 6, 7) of the same per-week line. */
function threeWeeks(
  rzOpps: number,
  rushTd: number,
  recTd = 0,
): Record<number, WeeklyUsageLine> {
  const perWeekRz = Math.floor(rzOpps / 3);
  const perWeekTd = Math.floor(rushTd / 3);
  return {
    5: line(perWeekRz, perWeekTd, Math.floor(recTd / 3)),
    6: line(perWeekRz, perWeekTd, Math.floor(recTd / 3)),
    7: line(
      rzOpps - 2 * perWeekRz,
      rushTd - 2 * perWeekTd,
      recTd - 2 * Math.floor(recTd / 3),
    ),
  };
}

const pool: DraftPoolFile = {
  season: 2026,
  generatedAt: 'test',
  baseline: { budget: 200, teams: 10, rounds: 15 },
  players: [
    pl('alpha', 'Alpha Back', 'RB'),
    pl('beta', 'Beta Back', 'RB'),
    pl('gamma', 'Gamma Back', 'RB'),
    pl('delta', 'Delta Receiver', 'WR'),
    pl('epsilon', 'Epsilon Receiver', 'WR'),
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <TdRegressionPage pool={pool} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is completed weeks 1–7. RB rate 0.2: Alpha (12 RZ, 4 TDs)
  // cools at +1.6, Beta (12 RZ, 0 TDs) is due at -2.4, Gamma (6 RZ,
  // 2 TDs) is neither. WR rate 1/9: Delta (18 RZ, 0 TDs) is due at
  // -2.0, Epsilon (9 RZ, 3 rec TDs) cools at +2.0.
  mockFetchUsage.mockResolvedValue({
    season: 2026,
    weeks: [5, 6, 7],
    usageBySleeperId: {
      alpha: threeWeeks(12, 4),
      beta: threeWeeks(12, 0),
      gamma: threeWeeks(6, 2),
      delta: threeWeeks(18, 0),
      epsilon: threeWeeks(9, 0, 3),
    },
  });
});

describe('TdRegressionPage', () => {
  it('renders the RB due and cooling tables with xTD gaps', async () => {
    renderPage();
    const cooling = await screen.findByRole('table', {
      name: /RBs due for fewer touchdowns/,
    });
    const coolingRows = within(cooling).getAllByRole('row');
    expect(coolingRows).toHaveLength(2);
    expect(within(coolingRows[1]).getByRole('rowheader').textContent).toContain('Alpha Back');
    expect(coolingRows[1].textContent).toContain('4');
    expect(coolingRows[1].textContent).toContain('2.4');
    expect(coolingRows[1].textContent).toContain('+1.6');

    const due = screen.getByRole('table', {
      name: /RBs due for more touchdowns/,
    });
    const dueRows = within(due).getAllByRole('row');
    expect(dueRows).toHaveLength(2);
    expect(within(dueRows[1]).getByRole('rowheader').textContent).toContain('Beta Back');
    expect(dueRows[1].textContent).toContain('2.4');
    expect(dueRows[1].textContent).toContain('-2.4');
  });

  it('swaps to the WR tab in place', async () => {
    renderPage();
    await screen.findByRole('table', { name: /RBs due for fewer touchdowns/ });
    fireEvent.click(screen.getByRole('button', { name: 'WR' }));
    const due = await screen.findByRole('table', {
      name: /WRs due for more touchdowns/,
    });
    const dueRows = within(due).getAllByRole('row');
    expect(dueRows).toHaveLength(2);
    expect(within(dueRows[1]).getByRole('rowheader').textContent).toContain('Delta Receiver');
    expect(dueRows[1].textContent).toContain('-2.0');
    const cooling = screen.getByRole('table', {
      name: /WRs due for fewer touchdowns/,
    });
    expect(
      within(within(cooling).getAllByRole('row')[1]).getByRole('rowheader').textContent,
    ).toContain('Epsilon Receiver');
  });

  it('shows a loading state, then an error with retry', async () => {
    mockFetchUsage.mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(screen.getByText(/Loading TD regression candidates/)).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load TD regression data/)).toBeInTheDocument();
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        alpha: threeWeeks(12, 4),
        beta: threeWeeks(12, 0),
        gamma: threeWeeks(6, 2),
        delta: threeWeeks(18, 0),
        epsilon: threeWeeks(9, 0, 3),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('table', { name: /RBs due for fewer touchdowns/ });
  });

  it('shows an empty state when no player clears the gap threshold', async () => {
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        // One RB scoring exactly at expectation (2 TDs on 10 RZ opps,
        // rate 0.2, gap 0) — neither list, so the position is empty.
        alpha: threeWeeks(10, 2),
      },
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/No RB regression candidates for weeks 1–7 yet/)).toBeInTheDocument(),
    );
  });
});
