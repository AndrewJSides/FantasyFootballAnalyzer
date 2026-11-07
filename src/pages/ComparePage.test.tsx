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
  // Item-173 remainder: Charlie's ruled-out backfield mate, so the page's
  // sole-back fold has a real vacancy to price in the new test below.
  players.push({
    id: 'd1',
    name: 'Delta Deer',
    team: 'WAS',
    pos: 'RB',
    posRank: 2,
    overallRank: players.length + 1,
    tier: 1,
    bye: null,
    baseValue: null,
    sleeperId: 'sid-d1',
    projPtsPpr: 50,
    projPts: 45,
    projPtsStd: 40,
    injuryStatus: 'Out',
  } as PoolPlayer);
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

function renderPage(leagueOverride?: League) {
  return render(
    <MemoryRouter>
      <ComparePage league={leagueOverride ?? league} />
    </MemoryRouter>,
  );
}

// Item-138 remainder: a windy/wet Open-Meteo body for every venue the
// page's week-9 weather fetch asks about — hourly rows across the
// weekend so nearestHourAt always lands within 90 minutes of kickoff.
const openMeteoBodies = (() => {
  const times: string[] = [];
  const start = Date.UTC(2026, 10, 7, 0);
  for (let i = 0; i < 79; i++) {
    times.push(new Date(start + i * 3600_000).toISOString().slice(0, 16));
  }
  const body = {
    hourly: {
      time: times,
      temperature_2m: times.map(() => 55),
      precipitation_probability: times.map(() => 90),
      wind_speed_10m: times.map(() => 20),
      wind_gusts_10m: times.map(() => 30),
    },
  };
  return Array.from({ length: 32 }, () => body);
})();

// Imported after the mock so the page binds the mocked pool.
import { ComparePage } from './ComparePage';

beforeEach(() => {
  // Four completed weeks: Alpha scores 25/week, Beta scores 15/week.
  // Routed by URL: the weekly-stats endpoint returns the map, the
  // Sleeper projections endpoint returns rows (none for Charlie), and
  // the Open-Meteo forecast endpoint returns windy/wet bodies for the
  // week-9 weather fetch in the new test below.
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (String(url).includes('open-meteo')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(openMeteoBodies) });
    }
    return Promise.resolve({
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
              // Charlie: 20 pts on 20 opps/week (1.0 pts/opp); Delta: 12
              // opps/week, ruled out — a 12-pt vacancy capped at +10.
              'sid-c1': { pts_ppr: 20, gp: 1, rush_att: 15, rec_tgt: 5 },
              'sid-d1': { pts_ppr: 5, gp: 1, rush_att: 12 },
            }),
    });
  }));
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

  it('folds a sole-back vacancy into the week projection and tags the row', async () => {
    renderPage();
    pickPlayer('Player A', 'Charlie Cheetah');
    pickPlayer('Player B', 'Beta Badger');
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

    const table = screen.getByRole('table');
    const projRow = within(table).getByRole('row', { name: /Week 5 projection/ });
    const cells = within(projRow).getAllByRole('cell');
    // Charlie: 20-pt base + 10-pt capped vacancy = 30.0 pts, tagged.
    expect(cells[0]).toHaveTextContent('30 pts');
    expect(cells[0]).toHaveTextContent('Sole back +10.0');
    expect(cells[1]).not.toHaveTextContent('Sole back');

    const verdict = screen.getByText(/sole back in his backfield/);
    expect(verdict).toBeInTheDocument();
  });

  it('folds the -25% weather downgrade into the week projection and tags the row', async () => {
    // Week 9: KC hosts NYJ Sunday in the open, so the stubbed forecast
    // flags Beta's game — while BUF plays at MIN under a roof, so Alpha
    // correctly carries no downgrade.
    renderPage({ ...league, currentWeek: 9 });
    pickPlayer('Player A', 'Alpha Aardvark');
    pickPlayer('Player B', 'Beta Badger');
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

    // The forecast fetch lands after the table's first render, so the
    // folded numbers arrive on a re-render — wait for them.
    await waitFor(() => {
      const table = screen.getByRole('table');
      const projRow = within(table).getByRole('row', { name: /Week 9 projection/ });
      const cells = within(projRow).getAllByRole('cell');
      // Beta: 15-pt base − 25% = 11.2 pts, tagged. Alpha's game is
      // under a roof: 25 pts, untagged.
      expect(cells[1]).toHaveTextContent('11.2 pts');
      expect(cells[1]).toHaveTextContent('Weather -3.8');
      expect(cells[0]).toHaveTextContent('25 pts');
      expect(cells[0]).not.toHaveTextContent('Weather');
    });

    const verdict = screen.getByText(/Beta Badger plays in a windy or wet outdoor game/);
    expect(verdict).toBeInTheDocument();
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
