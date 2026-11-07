// TradeValuesPage rendering: the chart ranks pool players by trade value,
// the position filter swaps rows in place, the owner column only appears in
// league mode, and the package evaluator weighs both sides.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League, Player } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { TradeValuesPage } from './TradeValuesPage';

function poolPlayer(over: Partial<PoolPlayer>): PoolPlayer {
  return {
    id: 'p1',
    name: 'Test Player',
    team: 'KC',
    pos: 'RB',
    posRank: 1,
    overallRank: 1,
    tier: 1,
    bye: 8,
    baseValue: null,
    ...over,
  };
}

// Enough RBs to push replacement levels down so the top ones earn value.
const POOL: DraftPoolFile = {
  season: 2026,
  generatedAt: '2026-10-30',
  baseline: { budget: 200, teams: 10, rounds: 16 },
  players: [
    poolPlayer({ id: 'qb1', name: 'Elite QB', pos: 'QB', overallRank: 5, projPtsPpr: 330 }),
    poolPlayer({ id: 'rb1', name: 'Lead Back', pos: 'RB', overallRank: 10, projPtsPpr: 240 }),
    poolPlayer({ id: 'wr1', name: 'Top Wideout', pos: 'WR', overallRank: 8, projPtsPpr: 250 }),
    ...Array.from({ length: 60 }, (_, i) =>
      poolPlayer({
        id: `rbdepth${i}`,
        name: `Depth Back ${i}`,
        pos: 'RB',
        overallRank: 100 + i,
        projPtsPpr: 120 - i,
      }),
    ),
    ...Array.from({ length: 60 }, (_, i) =>
      poolPlayer({
        id: `wrdepth${i}`,
        name: `Depth Wideout ${i}`,
        pos: 'WR',
        overallRank: 150 + i,
        projPtsPpr: 110 - i,
      }),
    ),
    ...Array.from({ length: 20 }, (_, i) =>
      poolPlayer({
        id: `qbdepth${i}`,
        name: `Depth QB ${i}`,
        pos: 'QB',
        overallRank: 200 + i,
        projPtsPpr: 200 - i * 3,
      }),
    ),
  ],
};

const guestLeague: League = {
  id: 'guest',
  name: 'Guest draft prep',
  platform: 'sleeper',
  season: 2026,
  draftType: 'snake',
  teams: [],
  scoringType: 'ppr',
  totalTeams: 10,
  isLoaded: true,
  isGuest: true,
  status: 'preseason',
  rosterSlots: {
    QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, K: 1, DST: 1, BENCH: 6, IR: 1,
  },
} as League;

function leagueWithRoster(): League {
  const rosterPlayer = {
    id: 'rb1',
    platformId: '',
    name: 'Lead Back',
    position: 'RB',
    team: 'KC',
  } as Player;
  return {
    ...guestLeague,
    id: 'live',
    isGuest: false,
    status: 'live',
    currentWeek: 9,
    teams: [
      {
        id: 't1',
        name: 'Motha Puka',
        roster: [rosterPlayer],
        draftPicks: [],
      },
    ],
  } as unknown as League;
}

function renderPage(league: League) {
  return render(
    <MemoryRouter>
      <TradeValuesPage league={league} pool={POOL} />
    </MemoryRouter>,
  );
}

describe('TradeValuesPage', () => {
  it('ranks the top player at 100 and labels the Elite tier', () => {
    renderPage(guestLeague);
    const table = screen.getByRole('table', { name: /trade value chart/i });
    // Resolve columns by header so a future Δ column between Value and Tier
    // can't shift the indices.
    const headers = within(table)
      .getAllByRole('columnheader')
      .map(h => h.textContent ?? '');
    const valueIdx = headers.findIndex(h => h === 'Value');
    const tierIdx = headers.findIndex(h => h === 'Tier');
    expect(valueIdx).toBeGreaterThan(-1);
    expect(tierIdx).toBeGreaterThan(-1);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.length).toBeGreaterThan(0);
    const firstCells = within(rows[0]).getAllByRole('cell');
    expect(firstCells[valueIdx]).toHaveTextContent('100.0');
    expect(firstCells[tierIdx]).toHaveTextContent('Elite');
  });

  it('filters to one position in place', () => {
    renderPage(guestLeague);
    fireEvent.click(screen.getByRole('button', { name: 'QB', exact: true }));
    const table = screen.getByRole('table', { name: /trade value chart — qb/i });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const cells = within(row).getAllByRole('cell');
      expect(cells[1]).toHaveTextContent(/QB/);
    }
  });

  it('shows the owner column only in league mode', () => {
    renderPage(guestLeague);
    expect(
      screen.queryByRole('columnheader', { name: 'Owner' }),
    ).not.toBeInTheDocument();
    renderPage(leagueWithRoster());
    expect(screen.getByRole('columnheader', { name: 'Owner' })).toBeInTheDocument();
    expect(screen.getByText('Motha Puka')).toBeInTheDocument();
  });

  it('weighs both sides of a package deal', () => {
    renderPage(guestLeague);
    const addA = screen.getByLabelText('Add a player to side a');
    fireEvent.change(addA, { target: { value: 'Lead Back' } });
    fireEvent.click(screen.getByRole('button', { name: /add lead back/i }));
    const addB = screen.getByLabelText('Add a player to side b');
    fireEvent.change(addB, { target: { value: 'Elite QB' } });
    fireEvent.click(screen.getByRole('button', { name: /add elite qb/i }));
    const verdict = screen.getByRole('status');
    expect(verdict).toHaveTextContent(/value points/);
  });

  it('shows the Auction $ column in guest mode on the $2,000 default budget', () => {
    renderPage(guestLeague);
    const table = screen.getByRole('table', { name: /trade value chart/i });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map(h => h.textContent ?? '');
    const auctionIdx = headers.findIndex(h => h === 'Auction $');
    expect(auctionIdx).toBeGreaterThan(-1);
    const firstCells = within(within(table).getAllByRole('row')[1]).getAllByRole('cell');
    expect(firstCells[auctionIdx].textContent).toMatch(/^\$\d+$/);
  });

  it('prices auction dollars on the league\u2019s real draft spend in auction leagues', () => {
    const auctionLeague = {
      ...leagueWithRoster(),
      draftType: 'auction',
      teams: [
        {
          id: 't1',
          name: 'Motha Puka',
          roster: [],
          draftPicks: [
            { player: { name: 'Lead Back' }, auctionValue: 1200 },
            { player: { name: 'Elite QB' }, auctionValue: 800 },
          ],
        },
      ],
    } as unknown as League;
    renderPage(auctionLeague);
    const table = screen.getByRole('table', { name: /trade value chart/i });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map(h => h.textContent ?? '');
    expect(headers).toContain('Auction $');
  });

  it('hides the Auction $ column in live snake leagues', () => {
    renderPage(leagueWithRoster());
    const table = screen.getByRole('table', { name: /trade value chart/i });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map(h => h.textContent ?? '');
    expect(headers).not.toContain('Auction $');
  });

  it('adds auction-dollar totals to the package verdict', () => {
    renderPage(guestLeague);
    const addA = screen.getByLabelText('Add a player to side a');
    fireEvent.change(addA, { target: { value: 'Lead Back' } });
    fireEvent.click(screen.getByRole('button', { name: /add lead back/i }));
    const addB = screen.getByLabelText('Add a player to side b');
    fireEvent.change(addB, { target: { value: 'Elite QB' } });
    fireEvent.click(screen.getByRole('button', { name: /add elite qb/i }));
    expect(screen.getByRole('status')).toHaveTextContent(/in auction dollars/);
  });
});

describe('TradeValuesPage Next 3 column (backlog item 101)', () => {
  function chartCellText(rowName: string, pool: DraftPoolFile, league: League): string {
    render(
      <MemoryRouter>
        <TradeValuesPage league={league} pool={pool} />
      </MemoryRouter>,
    );
    const table = screen.getByRole('table', { name: /trade value chart/i });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map(h => h.textContent ?? '');
    const next3Idx = headers.findIndex(h => h === 'Next 3');
    expect(next3Idx).toBeGreaterThan(-1);
    const row = within(table)
      .getAllByRole('row')
      .find(r => {
        const cells = within(r).queryAllByRole('cell');
        return cells.length > 0 && (cells[1].textContent ?? '').includes(rowName);
      });
    expect(row).toBeDefined();
    return within(row!).getAllByRole('cell')[next3Idx].textContent ?? '';
  }

  it('renders a Next 3 header with an accessible name', () => {
    renderPage(guestLeague);
    const table = screen.getByRole('table', { name: /trade value chart/i });
    expect(
      within(table).getByRole('columnheader', {
        name: /next 3 played weeks, matchup difficulty/i,
      }),
    ).toBeDefined();
  });

  it("shows the player's next 3 played weeks as chips", () => {
    // Bundled 2026 schedule: KC plays NYJ (W9), @ATL (W10), ARI (W11);
    // guest mode prices the current-week estimate (week 8).
    expect(chartCellText('Elite QB', POOL, guestLeague)).toBe(
      'W9 NYJW10 ATLW11 ARI',
    );
  });

  it('names the full rating in the chip hover title and aria label', () => {
    renderPage(guestLeague);
    const table = screen.getByRole('table', { name: /trade value chart/i });
    expect(
      within(table).getAllByTitle(/vs NYJ · /).length,
    ).toBeGreaterThan(0);
    expect(
      within(table).getAllByLabelText(/^Week 9: vs NYJ · /).length,
    ).toBeGreaterThan(0);
  });

  it('renders a dim dash when the team has no schedule data', () => {
    const mystery = poolPlayer({
      id: 'zz1',
      name: 'Mystery Man',
      team: 'ZZZ',
      pos: 'QB',
      overallRank: 3,
      projPtsPpr: 340,
    });
    const customPool: DraftPoolFile = {
      ...POOL,
      players: [mystery, ...POOL.players],
    };
    expect(chartCellText('Mystery Man', customPool, guestLeague)).toBe('—');
  });

  it('lists draft picks on the same 0–100 scale as the player chart', () => {
    renderPage(guestLeague);
    const table = screen.getByRole('table', {
      name: /draft pick trade values/i,
    });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map(r => within(r).getAllByRole('cell')[0].textContent)).toEqual([
      // Value-sorted: a 2028 1st prices exactly like a 2027 2nd (same slot
      // after the one-round-per-year discount), so the years interleave.
      '2027 Round 1 pick',
      '2027 Round 2 pick',
      '2028 Round 1 pick',
      '2027 Round 3 pick',
      '2028 Round 2 pick',
    ]);
    const values = rows.map(
      r => Number(within(r).getAllByRole('cell')[1].textContent),
    );
    for (const v of values) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(100);
    }
    for (let i = 1; i < values.length; i++) {
      expect(values[i - 1]).toBeGreaterThanOrEqual(values[i]);
    }
  });

  it('names the expected-VOR basis on each pick row', () => {
    renderPage(guestLeague);
    const table = screen.getByRole('table', {
      name: /draft pick trade values/i,
    });
    expect(
      within(table).getAllByLabelText(/expected .* VOR points/).length,
    ).toBe(5);
  });
});

describe('TradeValuesPage dynasty mode (backlog item 192)', () => {
  function chartHeaders(): string[] {
    const table = screen.getByRole('table', { name: /trade value chart/i });
    return within(table)
      .getAllByRole('columnheader')
      .map(h => h.textContent ?? '');
  }

  function firstRowCells(): HTMLElement[] {
    const table = screen.getByRole('table', { name: /trade value chart/i });
    return within(within(table).getAllByRole('row')[1]).getAllByRole('cell');
  }

  it('defaults to Redraft and re-prices on raw projection in Dynasty mode', () => {
    renderPage(guestLeague);
    expect(
      screen.getByRole('radio', { name: /redraft \(vor\)/i }),
    ).toBeChecked();
    // Redraft ranks on VOR: the QB's 330-point season is worth less than
    // the wideout's 250 once replacement level is priced in.
    expect(firstRowCells()[1]).toHaveTextContent('Top Wideout');

    fireEvent.click(screen.getByRole('radio', { name: /dynasty \(age-adjusted\)/i }));
    // Dynasty prices raw projection (no ages in the test pool): the QB's
    // 330 tops the board at 100, the wideout's 250 prices 75.8.
    const headers = chartHeaders();
    const valueIdx = headers.findIndex(h => h === 'Value');
    const cells = firstRowCells();
    expect(cells[1]).toHaveTextContent('Elite QB');
    expect(cells[valueIdx]).toHaveTextContent('100.0');
    const rows = within(
      screen.getByRole('table', { name: /trade value chart/i }),
    ).getAllByRole('row');
    expect(within(rows[2]).getAllByRole('cell')[valueIdx]).toHaveTextContent('75.8');
  });

  it('shows the Age column in Dynasty mode and hides the redraft-only columns', () => {
    renderPage(guestLeague);
    expect(chartHeaders()).not.toContain('Age');
    fireEvent.click(screen.getByRole('radio', { name: /dynasty \(age-adjusted\)/i }));
    const headers = chartHeaders();
    expect(headers).toContain('Age');
    expect(headers).not.toContain('Auction $');
    expect(headers.some(h => h.startsWith('Δ since'))).toBe(false);
    // No Sleeper ids in the test pool: every age reads unknown.
    expect(firstRowCells()[2]).toHaveTextContent('—');
  });

  it('hides the Draft Picks table in Dynasty mode with a note instead', () => {
    renderPage(guestLeague);
    expect(
      screen.getByRole('table', { name: /draft pick trade values/i }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /dynasty \(age-adjusted\)/i }));
    expect(
      screen.queryByRole('table', { name: /draft pick trade values/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/draft picks price on redraft value over replacement/i),
    ).toBeInTheDocument();
  });

  it('keeps the Package Evaluator pricing the displayed dynasty values', () => {
    renderPage(guestLeague);
    fireEvent.click(screen.getByRole('radio', { name: /dynasty \(age-adjusted\)/i }));
    const addA = screen.getByLabelText('Add a player to side a');
    fireEvent.change(addA, { target: { value: 'Elite QB' } });
    fireEvent.click(screen.getByRole('button', { name: /add elite qb/i }));
    const addB = screen.getByLabelText('Add a player to side b');
    fireEvent.change(addB, { target: { value: 'Lead Back' } });
    fireEvent.click(screen.getByRole('button', { name: /add lead back/i }));
    // Dynasty values: 100.0 vs 72.7 — Side A wins by 27.3, and no auction
    // dollars (redraft currency) appear in the verdict.
    expect(screen.getByRole('status')).toHaveTextContent(
      /Side A wins by 27\.3 value points \(100 vs 72\.7\)/,
    );
    expect(screen.getByRole('status')).not.toHaveTextContent(/auction dollars/);
  });
});
