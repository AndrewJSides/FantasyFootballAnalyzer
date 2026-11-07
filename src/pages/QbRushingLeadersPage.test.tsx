// QbRushingLeadersPage (backlog item 185): the /qb-rushing board
// renders QB rushing leaders from mocked Sleeper usage, with loading /
// error-with-retry / empty states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QbRushingLeadersPage } from './QbRushingLeadersPage';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

vi.mock('@/api/sleeperUsage', () => ({ fetchWeeklyUsage: vi.fn() }));
const mockFetchUsage = vi.mocked(fetchWeeklyUsage);

function pl(id: string, name: string, pos: string, team = 'BUF'): PoolPlayer {
  return {
    id,
    name,
    team,
    pos,
    posRank: 1,
    overallRank: 10,
    tier: 1,
    bye: 7,
    baseValue: null,
    projPtsPpr: 300,
    sleeperId: id,
  } as PoolPlayer;
}

const pool: DraftPoolFile = {
  season: 2026,
  generatedAt: 'test',
  baseline: { budget: 200, teams: 10, rounds: 15 },
  players: [
    pl('allen', 'Josh Allen', 'QB', 'BUF'),
    pl('hurts', 'Jalen Hurts', 'QB', 'PHI'),
    pl('burrow', 'Joe Burrow', 'QB', 'CIN'),
    pl('barkley', 'Saquon Barkley', 'RB', 'PHI'),
  ],
};

function line(rushAtt: number, rushYards: number, rushTd = 0, ptsPpr = 0) {
  return {
    offSnaps: 70,
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
    rushYards,
    rushTd,
    recTd: 0,
    passYards: 250,
    passTd: 2,
    passAtt: 35,
    passCmp: 24,
    rushFd: 0,
    recFd: 0,
    ptsPpr,
  };
}

const usage = {
  season: 2026,
  weeks: [5, 6, 7],
  usageBySleeperId: {
    // Allen: 60 yds/gm, 2 TDs, 90 pts — 30 of 90 pts from rushing = 33%.
    allen: {
      5: line(8, 60, 1, 30),
      6: line(8, 60, 0, 30),
      7: line(8, 60, 1, 30),
    },
    // Hurts: 40 yds/gm, 1 TD, 75 pts — 18 of 75 = 24%.
    hurts: {
      5: line(6, 40, 0, 25),
      6: line(6, 40, 1, 25),
      7: line(6, 40, 0, 25),
    },
    // Burrow: 5 yds/gm, 84 pts — 1.5 of 84 = 2%.
    burrow: {
      5: line(2, 5, 0, 28),
      6: line(2, 5, 0, 28),
      7: line(2, 5, 0, 28),
    },
    // Barkley rushes for far more — still excluded, wrong position.
    barkley: {
      5: line(20, 120, 1, 25),
      6: line(20, 120, 1, 25),
      7: line(20, 120, 1, 25),
    },
  },
};

function renderPage() {
  return render(
    <MemoryRouter>
      <QbRushingLeadersPage pool={pool} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is weeks 5–7.
  mockFetchUsage.mockResolvedValue(usage);
});

describe('QbRushingLeadersPage', () => {
  it('ranks QBs by rush yards per game with the Konami rush-points share', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /QB rushing leaders/ });
    const rows = within(table).getAllByRole('row');
    // Header + 3 QB rows (Barkley excluded).
    expect(rows).toHaveLength(4);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Josh Allen');
    expect(rows[1].textContent).toContain('60.0');
    expect(rows[1].textContent).toContain('8.0');
    expect(rows[1].textContent).toContain('33%');
    expect(within(rows[2]).getByRole('rowheader').textContent).toContain('Jalen Hurts');
    expect(rows[2].textContent).toContain('40.0');
    expect(rows[2].textContent).toContain('24%');
    expect(within(rows[3]).getByRole('rowheader').textContent).toContain('Joe Burrow');
    expect(rows[3].textContent).toContain('5.0');
    expect(rows[3].textContent).toContain('2%');
  });

  it('shows a loading state, then an error with retry', async () => {
    mockFetchUsage.mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(screen.getByText(/Loading QB rushing/)).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load QB rushing data/)).toBeInTheDocument();
    mockFetchUsage.mockResolvedValue(usage);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(screen.getByRole('table', { name: /QB rushing leaders/ })).toBeInTheDocument(),
    );
  });

  it('shows an empty state when no QB qualifies', async () => {
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        allen: {
          5: line(0, 0, 0, 30),
          6: line(0, 0, 0, 30),
          7: line(0, 0, 0, 30),
        },
      },
    });
    renderPage();
    expect(await screen.findByText(/No QB rushing leaders/)).toBeInTheDocument();
  });
});
