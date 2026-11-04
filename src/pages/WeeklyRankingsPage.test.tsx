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
  // Alpha scores 25/week, Charlie 18/week; Beta is on bye in week 8 and
  // Delta has no stats (unprojected). Each week fetch returns the same map.
  vi.stubGlobal('fetch', vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          'sid-a1': { pts_ppr: 25, gp: 1 },
          'sid-c1': { pts_ppr: 18, gp: 1 },
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
    expect(names).toEqual(['Alpha Aardvark', 'Charlie Cheetah', 'Delta Dolphin']);
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
