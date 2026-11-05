// Item-140 watchlist toggles on the Compare page: each picked player and
// each search result gets a star toggle wired to the same localStorage list
// the /watchlist page reads, with an aria-live announcement on toggle.
// Mirrors RankingsPage.watch.test.tsx.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import { WATCHLIST_KEY } from '@/utils/watchlist';

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
  add('b1', 'Beta Badger', 'QB', 'KC');
  add('c1', 'Charlie Cheetah', 'RB', 'WAS');
  return { players };
});

vi.mock('@/data/draftPool', () => ({
  POOL: { players: h.players, season: 2026 },
}));

import { ComparePage } from './ComparePage';

const league: League = {
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
  rosterSlots: {
    QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, K: 1, DST: 1, BENCH: 6, IR: 1,
  },
} as League;

function renderPage() {
  return render(
    <MemoryRouter>
      <ComparePage league={league} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
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
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  window.localStorage.clear();
});

function pickPlayer(pickerLabel: string, name: string) {
  const picker = screen.getByRole('region', { name: pickerLabel });
  const input = within(picker).getByLabelText(new RegExp(`Search for ${pickerLabel.toLowerCase()}`));
  fireEvent.change(input, { target: { value: name.slice(0, 6) } });
  const button = within(picker).getByRole('button', { name: new RegExp(`^Compare ${name}`) });
  fireEvent.click(button);
}

function searchInPicker(pickerLabel: string, query: string) {
  const picker = screen.getByRole('region', { name: pickerLabel });
  const input = within(picker).getByLabelText(new RegExp(`Search for ${pickerLabel.toLowerCase()}`));
  fireEvent.change(input, { target: { value: query } });
  return picker;
}

describe('ComparePage watchlist toggles', () => {
  it('renders an unpressed add toggle on a picked player', () => {
    renderPage();
    pickPlayer('Player A', 'Alpha Aardvark');
    const picker = screen.getByRole('region', { name: 'Player A' });
    expect(
      within(picker).getByRole('button', { name: 'Add Alpha Aardvark to watchlist' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('adds on click, persists to localStorage, and announces it', () => {
    renderPage();
    pickPlayer('Player A', 'Alpha Aardvark');
    const picker = screen.getByRole('region', { name: 'Player A' });
    const button = within(picker).getByRole('button', { name: 'Add Alpha Aardvark to watchlist' });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAccessibleName('Remove Alpha Aardvark from watchlist');
    expect(JSON.parse(window.localStorage.getItem(WATCHLIST_KEY) ?? '[]')).toEqual(['a1']);
    expect(screen.getByText('Added Alpha Aardvark to your watchlist.')).toBeInTheDocument();
  });

  it('removes on a second click', () => {
    renderPage();
    pickPlayer('Player A', 'Alpha Aardvark');
    const picker = screen.getByRole('region', { name: 'Player A' });
    const button = within(picker).getByRole('button', { name: 'Add Alpha Aardvark to watchlist' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(JSON.parse(window.localStorage.getItem(WATCHLIST_KEY) ?? '[]')).toEqual([]);
    expect(screen.getByText('Removed Alpha Aardvark from your watchlist.')).toBeInTheDocument();
  });

  it('renders pre-seeded watchlist entries as pressed', () => {
    window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(['b1']));
    renderPage();
    pickPlayer('Player B', 'Beta Badger');
    const picker = screen.getByRole('region', { name: 'Player B' });
    expect(
      within(picker).getByRole('button', { name: 'Remove Beta Badger from watchlist' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('stars a search result without picking the player', () => {
    renderPage();
    const picker = searchInPicker('Player A', 'Charlie');
    const button = within(picker).getByRole('button', { name: 'Add Charlie Cheetah to watchlist' });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(window.localStorage.getItem(WATCHLIST_KEY) ?? '[]')).toEqual(['c1']);
    expect(screen.getByText('Added Charlie Cheetah to your watchlist.')).toBeInTheDocument();
    // Still unpicked: the search box is still showing, not a picked row.
    expect(within(picker).getByLabelText(/Search for player a/)).toBeInTheDocument();
  });
});
