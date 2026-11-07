// WeeklyRankingsPage rendering: the board ranks startable players by this
// week's TraderApe projection, excludes bye-week players, and the position
// filter swaps the board in place. The bundled pool and Sleeper's weekly
// stats are mocked.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League } from '@/types';
import type { PoolPlayer } from '@/types/draft';

const h = vi.hoisted(() => {
  const players: PoolPlayer[] = [];
  const add = (id: string, name: string, pos: string, team: string, bye: number | null) => {
    players.push({
      id,
      name,
      team,
      pos,
      posRank: players.length + 1,
      overallRank: players.length + 1,
      tier: 1,
      bye,
      baseValue: null,
      sleeperId: `sid-${id}`,
      projPtsPpr: 250,
      projPts: 240,
      projPtsStd: 230,
    } as PoolPlayer);
  };
  add('a1', 'Alpha Aardvark', 'RB', 'FA', null);
  add('b1', 'Beta Badger', 'RB', 'FA', 8);
  add('c1', 'Charlie Cheetah', 'WR', 'FA', null);
  add('d1', 'Delta Dolphin', 'QB', 'FA', null);
  // Echo is on bye in week 9 only: on this week's board, off next week's.
  add('e1', 'Echo Eagle', 'WR', 'FA', 9);
  return { players };
});

vi.mock('@/data/draftPool', () => ({
  POOL: { players: h.players, season: 2026 },
}));

// Imported after the mock so the page binds the mocked pool.
import { WeeklyRankingsPage } from './WeeklyRankingsPage';

const league: League = {
  id: 'test',
  name: 'Test League',
  platform: 'sleeper',
  season: 2026,
  draftType: 'snake',
  teams: [],
  scoringType: 'ppr',
  totalTeams: 10,
  currentWeek: 8,
  isLoaded: true,
  status: 'offseason',
  rosterSlots: {
    QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, K: 1, DST: 1, BENCH: 6, IR: 1,
  },
} as League;

function renderPage() {
  return render(
    <MemoryRouter>
      <WeeklyRankingsPage league={league} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // Alpha scores 25/week, Charlie 18/week, Echo 10/week; Beta is on bye
  // in week 8 and Delta has no stats (unprojected). Each week fetch
  // returns the same map.
  vi.stubGlobal('fetch', vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          'sid-a1': { pts_ppr: 25, gp: 1 },
          'sid-c1': { pts_ppr: 18, gp: 1 },
          'sid-e1': { pts_ppr: 10, gp: 1 },
        }),
    }),
  ));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WeeklyRankingsPage', () => {
  it('ranks by this-week projection and excludes bye-week players', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('table', { name: /week \d+ rankings/i })).toBeInTheDocument();
    });
    const table = screen.getByRole('table', { name: /week \d+ rankings/i });
    const names = within(table)
      .getAllByRole('rowheader')
      .map(el => el.textContent);
    // Beta is on bye in week 8: excluded. Alpha outranks Charlie on projection.
    expect(names).toEqual(['Alpha Aardvark', 'Charlie Cheetah', 'Echo Eagle', 'Delta Dolphin']);
  });

  it('shows a Consistency column with verdict chips and a dash for data-less players', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('table', { name: /week \d+ rankings/i })).toBeInTheDocument();
    });
    const table = screen.getByRole('table', { name: /week \d+ rankings/i });
    expect(
      within(table).getByRole('columnheader', { name: /consistency/i }),
    ).toBeInTheDocument();
    const rows = within(table).getAllByRole('row');
    const alpha = rows.find(r =>
      within(r).queryByRole('rowheader', { name: 'Alpha Aardvark' }),
    );
    expect(alpha).toBeDefined();
    // The mock returns 7 identical weeks at 25 pts for Alpha: Steady, with
    // the full floor/ceiling story in the hover label.
    const chip = within(alpha!).getByText('Steady');
    expect(chip).toBeInTheDocument();
    expect(chip.closest('td')).toHaveAttribute('aria-label', expect.stringContaining('Steady'));
    // Delta has no weekly stats: a dash with the no-games explanation.
    const delta = rows.find(r =>
      within(r).queryByRole('rowheader', { name: 'Delta Dolphin' }),
    );
    expect(
      within(delta!).getByLabelText('Not enough games for a consistency rating'),
    ).toBeInTheDocument();
  });

  it('filters by position with an aria-pressed button', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('table', { name: /week \d+ rankings/i })).toBeInTheDocument();
    });
    const rb = within(
      screen.getByRole('group', { name: 'Filter by position' }),
    ).getByRole('button', { name: 'RB' });
    expect(rb).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(rb);
    expect(rb).toHaveAttribute('aria-pressed', 'true');
    const table = screen.getByRole('table', { name: /week \d+ rankings/i });
    const names = within(table)
      .getAllByRole('rowheader')
      .map(el => el.textContent);
    // Charlie is a WR, Delta a QB: only Alpha remains under the RB filter.
    expect(names).toEqual(['Alpha Aardvark']);
  });

  it('shows an error state with a retry button when weekly stats fail', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('down'))));
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('shows a Sleeper column with Sleeper projections and a dash for missing lines', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/projections/')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                { player_id: 'sid-a1', stats: { pts_ppr: 22.5 } },
                { player_id: 'sid-c1', stats: { pts_ppr: 17 } },
              ]),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              'sid-a1': { pts_ppr: 25, gp: 1 },
              'sid-c1': { pts_ppr: 18, gp: 1 },
              'sid-e1': { pts_ppr: 10, gp: 1 },
            }),
        });
      }),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText('Sleeper projection 22.5')).toBeInTheDocument();
    });
    const table = screen.getByRole('table', { name: /week \d+ rankings/i });
    expect(
      within(table).getByRole('columnheader', { name: /sleeper/i }),
    ).toBeInTheDocument();
    const rows = within(table).getAllByRole('row');
    const delta = rows.find(r =>
      within(r).queryByRole('rowheader', { name: 'Delta Dolphin' }),
    );
    expect(
      within(delta!).getByLabelText('No Sleeper projection for this player'),
    ).toBeInTheDocument();
  });

  it('leaves the Sleeper column dashed and the board intact when Sleeper projections fail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/projections/')) return Promise.reject(new Error('down'));
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              'sid-a1': { pts_ppr: 25, gp: 1 },
              'sid-c1': { pts_ppr: 18, gp: 1 },
              'sid-e1': { pts_ppr: 10, gp: 1 },
            }),
        });
      }),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('table', { name: /week \d+ rankings/i })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText(/Couldn't load Sleeper's projections/)).toBeInTheDocument();
    });
    const table = screen.getByRole('table', { name: /week \d+ rankings/i });
    const rows = within(table).getAllByRole('row');
    const alpha = rows.find(r =>
      within(r).queryByRole('rowheader', { name: 'Alpha Aardvark' }),
    );
    expect(
      within(alpha!).getByLabelText('Sleeper projection not loaded'),
    ).toBeInTheDocument();
  });

  it('fetches Sleeper projections once for both the column and the disagreement section', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/projections/')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              { player_id: 'sid-a1', stats: { pts_ppr: 22.5 } },
              { player_id: 'sid-c1', stats: { pts_ppr: 17 } },
            ]),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            'sid-a1': { pts_ppr: 25, gp: 1 },
            'sid-c1': { pts_ppr: 18, gp: 1 },
            'sid-e1': { pts_ppr: 10, gp: 1 },
          }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText('Sleeper projection 22.5')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('TraderApe higher')).toBeInTheDocument();
    });
    const projectionCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/projections/'),
    );
    expect(projectionCalls).toHaveLength(1);
  });
});

describe('WeeklyRankingsPage free agents only (backlog item 176)', () => {
  const liveLeague: League = {
    ...league,
    status: 'live',
    teams: [
      {
        id: 't1',
        name: 'Alpha Team',
        roster: [{ id: 'a1', name: 'Alpha Aardvark', position: 'RB', team: 'FA' }],
      },
    ],
  } as League;

  function renderLivePage() {
    return render(
      <MemoryRouter>
        <WeeklyRankingsPage league={liveLeague} />
      </MemoryRouter>,
    );
  }

  async function rankingsTable() {
    await waitFor(() => {
      expect(screen.getByRole('table', { name: /week \d+ rankings/i })).toBeInTheDocument();
    });
    return screen.getByRole('table', { name: /week \d+ rankings/i });
  }

  function rowNames(table: HTMLElement) {
    return within(table)
      .getAllByRole('rowheader')
      .map(el => el.textContent);
  }

  it('hides rostered players when checked and restores them when unchecked', async () => {
    renderLivePage();
    let table = await rankingsTable();
    expect(rowNames(table)).toEqual(['Alpha Aardvark', 'Charlie Cheetah', 'Echo Eagle', 'Delta Dolphin']);
    const toggle = screen.getByRole('checkbox', { name: /free agents only/i });
    fireEvent.click(toggle);
    table = screen.getByRole('table', { name: /week \d+ rankings/i });
    expect(rowNames(table)).toEqual(['Charlie Cheetah', 'Echo Eagle', 'Delta Dolphin']);
    expect(
      screen.getByRole('table', { name: /free agents only/i }),
    ).toBeInTheDocument();
    fireEvent.click(toggle);
    table = screen.getByRole('table', { name: /week \d+ rankings/i });
    expect(rowNames(table)).toEqual(['Alpha Aardvark', 'Charlie Cheetah', 'Echo Eagle', 'Delta Dolphin']);
  });

  it('shows a free-agents empty state when every player at the position is rostered', async () => {
    renderLivePage();
    await rankingsTable();
    // Beta is on bye in week 8, so Alpha is the only RB on the board — and
    // he is rostered, so the toggle empties the position. Scope to the
    // board's own filter bar: League Leaders below has its own RB tab.
    fireEvent.click(
      within(screen.getByRole('group', { name: /filter by position/i })).getByRole('button', {
        name: 'RB',
      }),
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /free agents only/i }));
    expect(screen.getByText('No free agents at RB for week 8.')).toBeInTheDocument();
  });

  it('hides the toggle in guest mode', async () => {
    renderPage();
    await rankingsTable();
    expect(
      screen.queryByRole('checkbox', { name: /free agents only/i }),
    ).not.toBeInTheDocument();
  });
});

describe('WeeklyRankingsPage Next Week view (backlog item 180)', () => {
  function renderWithProjections() {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/projections/')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              { player_id: 'sid-a1', stats: { pts_ppr: 22.5 } },
              { player_id: 'sid-c1', stats: { pts_ppr: 17 } },
              { player_id: 'sid-e1', stats: { pts_ppr: 9 } },
            ]),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            'sid-a1': { pts_ppr: 25, gp: 1 },
            'sid-c1': { pts_ppr: 18, gp: 1 },
            'sid-e1': { pts_ppr: 10, gp: 1 },
          }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    return fetchMock;
  }

  it('re-prices the board for next week: bye weeks follow the target week', async () => {
    const fetchMock = renderWithProjections();
    await waitFor(() => {
      expect(screen.getByRole('table', { name: /week 8 rankings/i })).toBeInTheDocument();
    });
    const nextButton = within(
      screen.getByRole('group', { name: 'Week to rank' }),
    ).getByRole('button', { name: /next week/i });
    expect(nextButton).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(nextButton);
    expect(nextButton).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => {
      expect(screen.getByRole('table', { name: /week 9 rankings/i })).toBeInTheDocument();
    });
    const table = screen.getByRole('table', { name: /week 9 rankings/i });
    const names = within(table)
      .getAllByRole('rowheader')
      .map(el => el.textContent);
    // Beta was on bye in week 8 and returns for week 9; Echo is on bye in
    // week 9 and drops off. Alpha still outranks Charlie.
    expect(names).toEqual(['Alpha Aardvark', 'Charlie Cheetah', 'Beta Badger', 'Delta Dolphin']);
    // The Sleeper column re-fetched for week 9.
    const projectionCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/projections/'),
    );
    expect(projectionCalls.some(([url]) => String(url).includes('/2026/9?'))).toBe(true);
    // The next-week caveat names the stale injury report.
    expect(screen.getByText(/this week's injury report/i)).toBeInTheDocument();
  });

  it('switches back to this week', async () => {
    renderWithProjections();
    await waitFor(() => {
      expect(screen.getByRole('table', { name: /week 8 rankings/i })).toBeInTheDocument();
    });
    const group = screen.getByRole('group', { name: 'Week to rank' });
    fireEvent.click(within(group).getByRole('button', { name: /next week/i }));
    await waitFor(() => {
      expect(screen.getByRole('table', { name: /week 9 rankings/i })).toBeInTheDocument();
    });
    fireEvent.click(within(group).getByRole('button', { name: /this week/i }));
    await waitFor(() => {
      expect(screen.getByRole('table', { name: /week 8 rankings/i })).toBeInTheDocument();
    });
  });

  it('hides the week switcher in the final regular-season week', async () => {
    render(
      <MemoryRouter>
        <WeeklyRankingsPage league={{ ...league, currentWeek: 18 }} />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByRole('table', { name: /week 18 rankings/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole('group', { name: 'Week to rank' })).not.toBeInTheDocument();
  });
});

describe('WeeklyRankingsPage rank movement (backlog item 181)', () => {
  async function rankingsTable() {
    await waitFor(() => {
      expect(screen.getByRole('table', { name: /week \d+ rankings/i })).toBeInTheDocument();
    });
    return screen.getByRole('table', { name: /week \d+ rankings/i });
  }

  function rowFor(table: HTMLElement, name: string) {
    const rows = within(table).getAllByRole('row');
    const row = rows.find(r => within(r).queryByRole('rowheader', { name }));
    expect(row).toBeDefined();
    return row!;
  }

  it('shows a Move column with held marks when the order is unchanged', async () => {
    renderPage();
    const table = await rankingsTable();
    expect(
      within(table).getByRole('columnheader', { name: /move/i }),
    ).toBeInTheDocument();
    // The default mock returns identical stats every week, so last
    // week's board orders the same as this week's: every row held.
    expect(
      within(rowFor(table, 'Alpha Aardvark')).getByLabelText('Held at RB1 vs last week'),
    ).toBeInTheDocument();
    expect(
      within(rowFor(table, 'Charlie Cheetah')).getByLabelText('Held at WR1 vs last week'),
    ).toBeInTheDocument();
    expect(
      within(rowFor(table, 'Echo Eagle')).getByLabelText('Held at WR2 vs last week'),
    ).toBeInTheDocument();
  });

  it('marks a climber up and a faller down when week 7 flips the WR order', async () => {
    // Charlie and Echo have no history before week 5; Charlie is cold
    // through week 6 (5 pts) then explodes in week 7 (40), Echo the
    // reverse (25, then 2). Last week's board (form through week 6) has
    // Echo WR1; this week's board (form through week 7) flips them.
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/projections/')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([]),
          });
        }
        const weekMatch = String(url).match(/\/regular\/2026\/(\d+)$/);
        if (weekMatch) {
          const w = Number(weekMatch[1]);
          if (w < 5) {
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
          }
          const week7 = w === 7;
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                'sid-a1': { pts_ppr: 25, gp: 1 },
                'sid-c1': { pts_ppr: week7 ? 40 : 5, gp: 1 },
                'sid-e1': { pts_ppr: week7 ? 2 : 25, gp: 1 },
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              'sid-a1': { pts_ppr: 25, gp: 1 },
              'sid-c1': { pts_ppr: 18, gp: 1 },
              'sid-e1': { pts_ppr: 10, gp: 1 },
            }),
        });
      }),
    );
    renderPage();
    const table = await rankingsTable();
    expect(
      within(rowFor(table, 'Charlie Cheetah')).getByLabelText(
        'Up 1 spot at WR vs last week (was WR2, now WR1)',
      ),
    ).toBeInTheDocument();
    expect(
      within(rowFor(table, 'Echo Eagle')).getByLabelText(
        'Down 1 spot at WR vs last week (was WR1, now WR2)',
      ),
    ).toBeInTheDocument();
  });

  it('hides the Move column on the Next Week view', async () => {
    renderPage();
    const table = await rankingsTable();
    expect(
      within(table).getByRole('columnheader', { name: /move/i }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Week to rank' })).getByRole('button', {
        name: /next week/i,
      }),
    );
    await waitFor(() => {
      expect(screen.getByRole('table', { name: /week 9 rankings/i })).toBeInTheDocument();
    });
    const nextTable = screen.getByRole('table', { name: /week 9 rankings/i });
    expect(
      within(nextTable).queryByRole('columnheader', { name: /move/i }),
    ).not.toBeInTheDocument();
  });
});
