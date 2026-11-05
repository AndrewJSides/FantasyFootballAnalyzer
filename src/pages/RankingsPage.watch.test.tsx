// Item-140 watchlist toggles on the Rankings page: each row gets a star
// toggle wired to the same localStorage list the /watchlist page reads,
// with an aria-live announcement on toggle. Mirrors
// WeeklyRankingsPage.watch.test.tsx.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
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
      baseValue: 20,
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
  POOL: {
    players: h.players,
    season: 2026,
    baseline: { budget: 200, teams: 10, rounds: 16 },
    generatedAt: '2026-11-01T00:00:00.000Z',
  },
}));

import { RankingsPage } from './RankingsPage';

const league: League = {
  id: 'test',
  name: 'Test League',
  platform: 'sleeper',
  season: 2026,
  draftType: 'snake',
  teams: [],
  scoringType: 'ppr',
  totalTeams: 10,
  currentWeek: 9,
  isLoaded: true,
  status: 'live',
  rosterSlots: {
    QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, K: 1, DST: 1, BENCH: 6, IR: 1,
  },
} as League;

function renderPage() {
  return render(
    <MemoryRouter>
      <RankingsPage league={league} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('RankingsPage watchlist toggles', () => {
  it('renders an unpressed add toggle per row', () => {
    renderPage();
    const table = screen.getByRole('table', { name: 'Player rankings' });
    expect(
      within(table).getByRole('button', { name: 'Add Charlie Cheetah to watchlist' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('adds on click, persists to localStorage, and announces it', () => {
    renderPage();
    const table = screen.getByRole('table', { name: 'Player rankings' });
    const button = within(table).getByRole('button', { name: 'Add Charlie Cheetah to watchlist' });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAccessibleName('Remove Charlie Cheetah from watchlist');
    expect(JSON.parse(window.localStorage.getItem(WATCHLIST_KEY) ?? '[]')).toEqual(['c1']);
    expect(screen.getByText('Added Charlie Cheetah to your watchlist.')).toBeInTheDocument();
  });

  it('removes on a second click', () => {
    renderPage();
    const table = screen.getByRole('table', { name: 'Player rankings' });
    const button = within(table).getByRole('button', { name: 'Add Alpha Aardvark to watchlist' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(JSON.parse(window.localStorage.getItem(WATCHLIST_KEY) ?? '[]')).toEqual([]);
    expect(screen.getByText('Removed Alpha Aardvark from your watchlist.')).toBeInTheDocument();
  });

  it('renders pre-seeded watchlist entries as pressed', () => {
    window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(['d1']));
    renderPage();
    const table = screen.getByRole('table', { name: 'Player rankings' });
    expect(
      within(table).getByRole('button', { name: 'Remove Delta Dolphin from watchlist' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});
