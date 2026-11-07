// PasserRatingLeadersPage (backlog item 186): the /passer-rating
// board renders QB passer-rating leaders from mocked Sleeper usage,
// with loading / error-with-retry / empty states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PasserRatingLeadersPage } from './PasserRatingLeadersPage';
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

function line(
  passCmp: number,
  passAtt: number,
  passYards: number,
  passTd = 0,
  passInt = 0,
) {
  return {
    offSnaps: 70,
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
    passYards,
    passTd,
    passAtt,
    passCmp,
    passInt,
    rushFd: 0,
    recFd: 0,
    ptsPpr: 0,
  };
}

const usage = {
  season: 2026,
  weeks: [5, 6, 7],
  usageBySleeperId: {
    // Allen: 66/90, 780 yds, 6 TD, 0 INT → rating 121.5, 73.3%, 8.7 Y/A.
    allen: {
      5: line(22, 30, 260, 2, 0),
      6: line(22, 30, 260, 2, 0),
      7: line(22, 30, 260, 2, 0),
    },
    // Hurts: 60/96, 720 yds, 3 TD, 3 INT → rating 82.8, 62.5%, 7.5 Y/A.
    hurts: {
      5: line(20, 32, 240, 1, 1),
      6: line(20, 32, 240, 1, 1),
      7: line(20, 32, 240, 1, 1),
    },
    // Burrow: 84/114, 990 yds, 9 TD, 3 INT → rating 115.0, 73.7%, 8.7 Y/A.
    burrow: {
      5: line(28, 38, 330, 3, 1),
      6: line(28, 38, 330, 3, 1),
      7: line(28, 38, 330, 3, 1),
    },
    // Barkley throws efficiently too — still excluded, wrong position.
    barkley: {
      5: line(2, 2, 40, 1, 0),
      6: line(2, 2, 40, 1, 0),
      7: line(2, 2, 40, 1, 0),
    },
  },
};

function renderPage() {
  return render(
    <MemoryRouter>
      <PasserRatingLeadersPage pool={pool} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is weeks 5–7.
  mockFetchUsage.mockResolvedValue(usage);
});

describe('PasserRatingLeadersPage', () => {
  it('ranks QBs by passer rating with the efficiency components alongside', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /Passer rating leaders/ });
    const rows = within(table).getAllByRole('row');
    // Header + 3 QB rows (Barkley excluded).
    expect(rows).toHaveLength(4);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Josh Allen');
    expect(rows[1].textContent).toContain('121.5');
    expect(rows[1].textContent).toContain('73.3%');
    expect(rows[1].textContent).toContain('8.7');
    expect(within(rows[2]).getByRole('rowheader').textContent).toContain('Joe Burrow');
    expect(rows[2].textContent).toContain('115.0');
    expect(rows[2].textContent).toContain('73.7%');
    expect(within(rows[3]).getByRole('rowheader').textContent).toContain('Jalen Hurts');
    expect(rows[3].textContent).toContain('82.8');
    expect(rows[3].textContent).toContain('62.5%');
  });

  it('shows a loading state, then an error with retry', async () => {
    mockFetchUsage.mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(screen.getByText(/Loading passer ratings/)).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load passer rating data/)).toBeInTheDocument();
    mockFetchUsage.mockResolvedValue(usage);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(screen.getByRole('table', { name: /Passer rating leaders/ })).toBeInTheDocument(),
    );
  });

  it('shows an empty state when no QB qualifies', async () => {
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        allen: {
          5: line(3, 3, 45, 1, 0),
          6: line(3, 3, 45, 1, 0),
          7: line(3, 3, 45, 1, 0),
        },
      },
    });
    renderPage();
    expect(await screen.findByText(/No passer rating leaders/)).toBeInTheDocument();
  });
});
