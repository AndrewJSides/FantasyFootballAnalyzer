// Item-140 watchlist toggles on the Weekly Rankings board: each row gets a
// star toggle wired to the same localStorage list the /watchlist page
// reads, with an aria-live announcement on toggle. The Sleeper weekly-stats
// fetch uses the same stub as WeeklyRankingsPage.test.tsx.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import { WATCHLIST_KEY } from '@/utils/watchlist';

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
  add('c1', 'Charlie Cheetah', 'WR', 'FA', null);
  add('d1', 'Delta Dolphin', 'QB', 'FA', null);
  return { players };
});

vi.mock('@/data/draftPool', () => ({
  POOL: { players: h.players, season: 2026 },
}));

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

async function boardTable() {
  await waitFor(() => {
    expect(screen.getByRole('table', { name: /week \d+ rankings/i })).toBeInTheDocument();
  });
  return screen.getByRole('table', { name: /week \d+ rankings/i });
}

beforeEach(() => {
  window.localStorage.clear();
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
  window.localStorage.clear();
});

describe('WeeklyRankingsPage watchlist toggles', () => {
  it('renders an unpressed add toggle per row', async () => {
    renderPage();
    const table = await boardTable();
    expect(
      within(table).getByRole('button', { name: 'Add Charlie Cheetah to watchlist' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('adds on click, persists to localStorage, and announces it', async () => {
    renderPage();
    const table = await boardTable();
    const button = within(table).getByRole('button', { name: 'Add Charlie Cheetah to watchlist' });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAccessibleName('Remove Charlie Cheetah from watchlist');
    expect(JSON.parse(window.localStorage.getItem(WATCHLIST_KEY) ?? '[]')).toEqual(['c1']);
    expect(screen.getByText('Added Charlie Cheetah to your watchlist.')).toBeInTheDocument();
  });

  it('removes on a second click', async () => {
    renderPage();
    const table = await boardTable();
    const button = within(table).getByRole('button', { name: 'Add Alpha Aardvark to watchlist' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(JSON.parse(window.localStorage.getItem(WATCHLIST_KEY) ?? '[]')).toEqual([]);
    expect(screen.getByText('Removed Alpha Aardvark from your watchlist.')).toBeInTheDocument();
  });

  it('renders pre-seeded watchlist entries as pressed', async () => {
    window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(['d1']));
    renderPage();
    const table = await boardTable();
    expect(
      within(table).getByRole('button', { name: 'Remove Delta Dolphin from watchlist' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});
