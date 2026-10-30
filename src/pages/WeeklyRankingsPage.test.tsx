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
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
    const table = screen.getByRole('table');
    const names = within(table)
      .getAllByRole('rowheader')
      .map(el => el.textContent);
    // Beta is on bye in week 8: excluded. Alpha outranks Charlie on projection.
    expect(names).toEqual(['Alpha Aardvark', 'Charlie Cheetah', 'Delta Dolphin']);
  });

  it('filters by position with an aria-pressed button', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
    const rb = screen.getByRole('button', { name: 'RB' });
    expect(rb).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(rb);
    expect(rb).toHaveAttribute('aria-pressed', 'true');
    const table = screen.getByRole('table');
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
});
