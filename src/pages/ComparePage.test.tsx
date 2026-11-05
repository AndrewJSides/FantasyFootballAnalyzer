// ComparePage rendering: searching and picking two players renders the
// side-by-side comparison table with a verdict, and changing a pick clears
// it. The bundled pool and Sleeper's weekly stats are mocked.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League } from '@/types';
import type { PoolPlayer } from '@/types/draft';

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

// Imported after the mock so the page binds the mocked pool.
import { ComparePage } from './ComparePage';

beforeEach(() => {
  // Four completed weeks: Alpha scores 25/week, Beta scores 15/week.
  // Routed by URL: the weekly-stats endpoint returns the map, the
  // Sleeper projections endpoint returns rows (none for Charlie).
  vi.stubGlobal('fetch', vi.fn((url: string) =>
    Promise.resolve({
      ok: true,
      json: () =>
        String(url).includes('/projections/nfl/')
          ? Promise.resolve([
              { player_id: 'sid-a1', stats: { pts_ppr: 22.4 } },
              { player_id: 'sid-b1', stats: { pts_ppr: 18.1 } },
            ])
          : Promise.resolve({
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
});

function pickPlayer(pickerLabel: string, name: string) {
  const picker = screen.getByRole('region', { name: pickerLabel });
  const input = within(picker).getByLabelText(new RegExp(`Search for ${pickerLabel.toLowerCase()}`));
  fireEvent.change(input, { target: { value: name.slice(0, 6) } });
  // Anchored on the Compare button: search rows now also carry a watchlist
  // star whose name contains the player name (item 140).
  const button = within(picker).getByRole('button', { name: new RegExp(`^Compare ${name}`) });
  fireEvent.click(button);
}

describe('ComparePage', () => {
  it('renders the comparison table and verdict after picking two players', async () => {
    renderPage();
    pickPlayer('Player A', 'Alpha Aardvark');
    pickPlayer('Player B', 'Beta Badger');

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: /Alpha Aardvark/ })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: /Beta Badger/ })).toBeInTheDocument();
    const rows = within(table).getAllByRole('rowheader');
    expect(rows.map(r => r.textContent)).toContain('Points per game');

    // Alpha outscores Beta everywhere on stats: Alpha wins the PPG row.
    const ppgRow = within(table).getByRole('row', { name: /Points per game/ });
    const cells = within(ppgRow).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('25 pts');
    expect(cells[1]).toHaveTextContent('15 pts');

    const verdict = screen.getByText(/takes the comparison|split the comparison/);
    expect(verdict).toBeInTheDocument();
  });

  it('keeps the two pickers independent and clears on change', async () => {
    renderPage();
    pickPlayer('Player A', 'Alpha Aardvark');
    pickPlayer('Player B', 'Charlie Cheetah');
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

    // Change Player A: the picked name updates and results recompute.
    const pickerA = screen.getByRole('region', { name: 'Player A' });
    fireEvent.click(within(pickerA).getByRole('button', { name: /Clear Player A/ }));
    pickPlayer('Player A', 'Beta Badger');
    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
    const caption = screen.getByText(/Head-to-head comparison: Beta Badger vs Charlie Cheetah/);
    expect(caption).toBeInTheDocument();
  });

  it('shows Sleeper projections right after the TraderApe projection row', async () => {
    renderPage();
    pickPlayer('Player A', 'Alpha Aardvark');
    pickPlayer('Player B', 'Beta Badger');
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

    const table = screen.getByRole('table');
    const headers = within(table).getAllByRole('rowheader').map(r => r.textContent);
    expect(headers[headers.indexOf('Sleeper week 5 projection') - 1]).toMatch(/Week 5 projection/);

    // The projections fetch can land just after the table itself.
    await waitFor(() => {
      const sleeperRow = within(table).getByRole('row', { name: /Sleeper week 5 projection/ });
      const cells = within(sleeperRow).getAllByRole('cell');
      expect(cells[0]).toHaveTextContent('22.4 pts');
      expect(cells[1]).toHaveTextContent('18.1 pts');
    });
    const sleeperRow = within(table).getByRole('row', { name: /Sleeper week 5 projection/ });
    // No winner marks on a market number: the verdict counts TraderApe rows only.
    expect(within(sleeperRow).queryByText('✓')).toBeNull();
  });

  it('dashes a player with no Sleeper projection line', async () => {
    renderPage();
    pickPlayer('Player A', 'Alpha Aardvark');
    pickPlayer('Player B', 'Charlie Cheetah');
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

    // Charlie has no Sleeper projection row in the stub.
    const table = screen.getByRole('table');
    await waitFor(() => {
      const sleeperRow = within(table).getByRole('row', { name: /Sleeper week 5 projection/ });
      const cells = within(sleeperRow).getAllByRole('cell');
      expect(cells[0]).toHaveTextContent('22.4 pts');
      expect(cells[1]).toHaveTextContent('—');
    });
  });

  it('keeps the table intact when the projections fetch fails', async () => {
    // Projections down, weekly stats fine: dashes only, table still renders.
    vi.stubGlobal('fetch', vi.fn((url: string) =>
      String(url).includes('/projections/nfl/')
        ? Promise.reject(new Error('down'))
        : Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                'sid-a1': { pts_ppr: 25, gp: 1 },
                'sid-b1': { pts_ppr: 15, gp: 1 },
                'sid-c1': { pts_ppr: 20, gp: 1 },
              }),
          }),
    ));
    renderPage();
    pickPlayer('Player A', 'Alpha Aardvark');
    pickPlayer('Player B', 'Beta Badger');
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    const table = screen.getByRole('table');
    const sleeperRow = within(table).getByRole('row', { name: /Sleeper week 5 projection/ });
    within(sleeperRow).getAllByRole('cell').forEach(c => expect(c).toHaveTextContent('—'));
  });

  it('shows a retry affordance when weekly stats fail to load', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('down'))));
    renderPage();
    pickPlayer('Player A', 'Alpha Aardvark');
    pickPlayer('Player B', 'Beta Badger');
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
