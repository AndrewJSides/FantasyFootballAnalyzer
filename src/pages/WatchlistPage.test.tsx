// WatchlistPage rendering: an empty list shows the empty state, searching
// and adding a player renders the outlook table and persists to
// localStorage, and removing clears the row. The bundled pool and
// Sleeper's weekly stats are mocked.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import { WATCHLIST_KEY } from '../utils/watchlist';

const h = vi.hoisted(() => {
  const players: PoolPlayer[] = [];
  const add = (id: string, name: string, pos: string, team: string) => {
    players.push({
      id,
      name,
      team,
      pos,
      posRank: 1,
      overallRank: players.length + 1,
      tier: 1,
      bye: null,
      baseValue: null,
      sleeperId: `sid-${id}`,
      projPtsPpr: 250,
      projPts: 240,
      projPtsStd: 230,
    } as PoolPlayer);
  };
  add('a1', 'Alpha Aardvark', 'QB', 'BUF');
  add('b1', 'Beta Badger', 'RB', 'KC');
  add('c1', 'Charlie Cheetah', 'WR', 'WAS');
  return { players };
});

vi.mock('@/data/draftPool', () => ({
  POOL: { players: h.players, season: 2026 },
}));

// Imported after the mock so the page binds the mocked pool.
import { WatchlistPage } from './WatchlistPage';

function makeLeague(overrides: Partial<League> = {}): League {
  return {
    id: 'test',
    name: 'Test League',
    platform: 'sleeper',
    season: 2026,
    draftType: 'snake',
    teams: [],
    scoringType: 'ppr',
    totalTeams: 10,
    currentWeek: 5,
    isLoaded: true,
    status: 'live',
    rosterSlots: {
      QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, K: 1, DST: 1, BENCH: 6, IR: 1,
    },
    ...overrides,
  } as League;
}

function renderPage(league: League) {
  return render(
    <MemoryRouter>
      <WatchlistPage league={league} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // Four completed weeks: Alpha scores 25/week, Beta 15/week.
  vi.stubGlobal('fetch', vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          'sid-a1': { pts_ppr: 25, gp: 1 },
          'sid-b1': { pts_ppr: 15, gp: 1 },
          'sid-c1': { pts_ppr: 20, gp: 1 },
        }),
    }),
  ));
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function addViaSearch(name: string) {
  const input = screen.getByLabelText('Add a player');
  fireEvent.change(input, { target: { value: name.slice(0, 6) } });
  const button = screen.getByRole('button', { name: new RegExp(`Add ${name}`) });
  fireEvent.click(button);
}

describe('WatchlistPage', () => {
  it('shows the empty state when nothing is watched', async () => {
    renderPage(makeLeague());
    await waitFor(() => {
      expect(screen.getByText(/Your watchlist is empty/)).toBeInTheDocument();
    });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('adds a player from search, renders the outlook row, and persists it', async () => {
    renderPage(makeLeague());
    await waitFor(() => {
      expect(screen.getByText(/Your watchlist is empty/)).toBeInTheDocument();
    });

    addViaSearch('Alpha Aardvark');

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
    const table = screen.getByRole('table');
    const row = within(table).getByRole('row', { name: /Alpha Aardvark/ });
    // Alpha scored 25/week for 4 weeks: the projection prices on real data
    // (25.0 — the numeric matchup blend is off after the Nov 1, 2026
    // re-price, so no adjustment applies).
    expect(within(row).getByText('25.0')).toBeInTheDocument();
    // Free agent in live league mode with no rosters synced.
    expect(within(row).getByText('Free agent')).toBeInTheDocument();

    // Persisted to localStorage in add order.
    expect(JSON.parse(localStorage.getItem(WATCHLIST_KEY)!)).toEqual(['a1']);

    // Player Journey deep-link on the name.
    const link = within(row).getByRole('link', { name: 'Alpha Aardvark' });
    expect(link.getAttribute('href')).toBe('/players?player=a1');
  });

  it('removes a player and restores the empty state', async () => {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(['a1', 'b1']));
    renderPage(makeLeague());

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove Alpha Aardvark from watchlist' }));
    await waitFor(() => {
      expect(screen.queryByRole('row', { name: /Alpha Aardvark/ })).not.toBeInTheDocument();
    });
    expect(JSON.parse(localStorage.getItem(WATCHLIST_KEY)!)).toEqual(['b1']);
    expect(screen.getByRole('row', { name: /Beta Badger/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Beta Badger from watchlist' }));
    await waitFor(() => {
      expect(screen.getByText(/Your watchlist is empty/)).toBeInTheDocument();
    });
  });

  it('hides the Owner column outside live leagues', async () => {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(['a1']));
    renderPage(makeLeague({ status: 'final', currentWeek: undefined }));

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
    const table = screen.getByRole('table');
    expect(
      within(table).queryByRole('columnheader', { name: 'Owner' }),
    ).not.toBeInTheDocument();
  });

  it('names the owning team in live league mode', async () => {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(['a1']));
    renderPage(
      makeLeague({
        teams: [
          {
            id: 't1',
            name: 'Marauders',
            roster: [{ id: 'sid-a1', name: 'Alpha Aardvark', position: 'QB' }],
          },
        ],
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
    const table = screen.getByRole('table');
    const row = within(table).getByRole('row', { name: /Alpha Aardvark/ });
    expect(within(row).getByText('Marauders')).toBeInTheDocument();
  });
});
