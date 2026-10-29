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
});

function pickPlayer(pickerLabel: string, name: string) {
  const picker = screen.getByRole('region', { name: pickerLabel });
  const input = within(picker).getByLabelText(new RegExp(`Search for ${pickerLabel.toLowerCase()}`));
  fireEvent.change(input, { target: { value: name.slice(0, 6) } });
  const button = within(picker).getByRole('button', { name: new RegExp(name) });
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
