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
});
