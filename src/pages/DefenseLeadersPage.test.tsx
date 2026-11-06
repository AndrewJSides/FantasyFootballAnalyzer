// DefenseLeadersPage (backlog item 169): the /defense-leaders
// board renders team defenses by standard D/ST fantasy points per
// game from mocked Sleeper usage, with loading / error-with-retry /
// empty states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DefenseLeadersPage } from './DefenseLeadersPage';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

vi.mock('@/api/sleeperUsage', () => ({ fetchWeeklyUsage: vi.fn() }));
const mockFetchUsage = vi.mocked(fetchWeeklyUsage);

function pl(id: string, name: string, pos: string, team = 'HOU'): PoolPlayer {
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
    pl('HOU', 'Houston Texans', 'DST', 'HOU'),
    pl('DEN', 'Denver Broncos', 'DST', 'DEN'),
  ],
};

function line(sacks = 0, defInt = 0, fumRec = 0, defTd = 0, ptsAllow = 17) {
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
    sacks, defInt, fumRec, defTd, safeties: 0, blkKick: 0, ptsAllow,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DefenseLeadersPage pool={pool} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetchUsage.mockReset();
  // The real currentWeekEstimate (bundled data) prices week 8, so the
  // window is weeks 5–7. HOU: 28 points (9.3/gm); DEN: 10 (3.3/gm).
  mockFetchUsage.mockResolvedValue({
    season: 2026,
    weeks: [5, 6, 7],
    usageBySleeperId: {
      HOU: {
        5: line(3, 1, 0, 0, 10),
        6: line(2, 0, 1, 0, 14),
        7: line(4, 0, 0, 1, 7),
      },
      DEN: {
        5: line(1, 0, 0, 0, 20),
        6: line(1, 0, 0, 0, 13),
        7: line(2, 0, 0, 0, 17),
      },
    },
  });
});

describe('DefenseLeadersPage', () => {
  it('ranks defenses by fantasy points per game with sacks and takeaways', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /Defense leaders, weeks 5 through 7/ });
    const rows = within(table).getAllByRole('row');
    // Header + 2 defense rows.
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByRole('rowheader').textContent).toContain('Houston Texans');
    expect(rows[1].textContent).toContain('28');
    expect(rows[1].textContent).toContain('9.3');
    expect(rows[1].textContent).toContain('10.3');
    expect(within(rows[2]).getByRole('rowheader').textContent).toContain('Denver Broncos');
    expect(rows[2].textContent).toContain('10');
    expect(rows[2].textContent).toContain('3.3');
  });

  it('shows a loading state, then an error with retry', async () => {
    mockFetchUsage.mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(screen.getByText(/Loading defense leaders/)).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load defense data/)).toBeInTheDocument();
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        HOU: {
          5: line(3, 1, 0, 0, 10),
          6: line(2, 0, 1, 0, 14),
          7: line(4, 0, 0, 1, 7),
        },
        DEN: {
          5: line(1, 0, 0, 0, 20),
          6: line(1, 0, 0, 0, 13),
          7: line(2, 0, 0, 0, 17),
        },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('table', { name: /Defense leaders, weeks 5 through 7/ });
  });

  it('shows an empty state when no defense scores in the window', async () => {
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        // 0 sacks, 0 takeaways, 35 allowed every week = -4 a week.
        HOU: {
          5: line(0, 0, 0, 0, 35),
          6: line(0, 0, 0, 0, 35),
          7: line(0, 0, 0, 0, 35),
        },
        DEN: {
          5: line(0, 0, 0, 0, 35),
          6: line(0, 0, 0, 0, 35),
          7: line(0, 0, 0, 0, 35),
        },
      },
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/No defense leaders for weeks 5–7 yet/)).toBeInTheDocument(),
    );
  });
});
