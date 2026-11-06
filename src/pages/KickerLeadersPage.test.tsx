// KickerLeadersPage (backlog item 170): the /kicker-leaders
// board renders kickers by standard kicker fantasy points per
// game from mocked Sleeper usage, with loading / error-with-retry /
// empty states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KickerLeadersPage } from './KickerLeadersPage';
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
    overallRank: 179,
    tier: 8,
    bye: 8,
    baseValue: null,
    projPtsPpr: 104,
    sleeperId: id,
  } as PoolPlayer;
}

const pool: DraftPoolFile = {
  season: 2026,
  generatedAt: 'test',
  baseline: { budget: 200, teams: 10, rounds: 15 },
  players: [
    pl('k1', 'Tyler Bass', 'K', 'BUF'),
    pl('k2', 'Brandon Aubrey', 'K', 'DAL'),
  ],
};

function line(fgm = 0, fga = 0, xpm = 0) {
  return {
    offSnaps: 0,
    teamSnaps: 0,
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
    fgm, fga, xpm,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <KickerLeadersPage pool={pool} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is weeks 5–7. Bass: 36 points (12.0/gm); Aubrey: 21 (7.0/gm).
  mockFetchUsage.mockResolvedValue({
    season: 2026,
    weeks: [5, 6, 7],
    usageBySleeperId: {
      k1: {
        5: line(3, 3, 2),
        6: line(2, 2, 3),
        7: line(4, 4, 4),
      },
      k2: {
        5: line(2, 3, 1),
        6: line(3, 3, 2),
        7: line(1, 2, 2),
      },
    },
  });
});

describe('KickerLeadersPage', () => {
  it('ranks kickers by fantasy points per game with FGs and PATs', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /Kicker leaders, weeks 5 through 7/ });
    const rows = within(table).getAllByRole('row');
    // Header + 2 kicker rows.
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Tyler Bass');
    expect(rows[1].textContent).toContain('36');
    expect(rows[1].textContent).toContain('12.0');
    expect(rows[1].textContent).toContain('9/9');
    expect(rows[1].textContent).toContain('100.0%');
    expect(within(rows[2]).getByRole('rowheader').textContent).toContain('Brandon Aubrey');
    expect(rows[2].textContent).toContain('21');
    expect(rows[2].textContent).toContain('7.0');
    expect(rows[2].textContent).toContain('6/8');
    expect(rows[2].textContent).toContain('75.0%');
  });

  it('shows a loading state, then an error with retry', async () => {
    mockFetchUsage.mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(screen.getByText(/Loading kicker leaders/)).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load kicker data/)).toBeInTheDocument();
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        k1: {
          5: line(3, 3, 2),
          6: line(2, 2, 3),
          7: line(4, 4, 4),
        },
        k2: {
          5: line(2, 3, 1),
          6: line(3, 3, 2),
          7: line(1, 2, 2),
        },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('table', { name: /Kicker leaders, weeks 5 through 7/ });
  });

  it('shows an empty state when no kicker scores in the window', async () => {
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        // 0/1 + 0 PAT every week = -1 a week.
        k1: {
          5: line(0, 1, 0),
          6: line(0, 1, 0),
          7: line(0, 1, 0),
        },
        k2: {
          5: line(0, 1, 0),
          6: line(0, 1, 0),
          7: line(0, 1, 0),
        },
      },
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/No kicker leaders for weeks 5–7 yet/)).toBeInTheDocument(),
    );
  });
});
