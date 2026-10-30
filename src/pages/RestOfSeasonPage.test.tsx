// RestOfSeasonPage rendering: the table ranks pool players by rest-of-season
// projection, the position filter swaps the rows in place, and the owner
// column only appears in league mode.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League, Player } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { RestOfSeasonPage } from './RestOfSeasonPage';

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

const POOL: DraftPoolFile = {
  season: 2026,
  generatedAt: '2026-10-29',
  baseline: { budget: 200, teams: 10, rounds: 16 },
  players: [
    poolPlayer({ id: 'qb1', name: 'Elite QB', pos: 'QB', overallRank: 5, projPtsPpr: 330 }),
    poolPlayer({ id: 'rb1', name: 'Lead Back', pos: 'RB', overallRank: 10, projPtsPpr: 240 }),
    poolPlayer({ id: 'rb2', name: 'Hurt Back', pos: 'RB', overallRank: 12, projPtsPpr: 260,
      injuryStatus: 'IR', injuryBodyPart: 'Knee', injuryNotes: 'Torn ACL (surgery)' }),
    poolPlayer({ id: 'wr1', name: 'Top Wideout', pos: 'WR', overallRank: 8, projPtsPpr: 250 }),
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
      <RestOfSeasonPage league={league} pool={POOL} />
    </MemoryRouter>,
  );
}

describe('RestOfSeasonPage', () => {
  it('ranks all players by rest-of-season projection and marks the injured one', () => {
    renderPage(guestLeague);
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    // header + 4 players
    expect(rows).toHaveLength(5);
    const body = within(table).getAllByRole('rowheader');
    const names = body.map(r => r.textContent ?? '');
    expect(names[0]).toContain('Elite QB');
    expect(names[names.length - 1]).toContain('Hurt Back');
    // The ACL tear gets an injury tag.
    expect(screen.getByLabelText(/Injured: .*Torn ACL/)).toBeTruthy();
  });

  it('filters to one position and announces the swap', () => {
    renderPage(guestLeague);
    fireEvent.click(screen.getByRole('button', { name: 'RB' }));
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3); // header + 2 RBs
    expect(screen.getByRole('button', { name: 'RB' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(table).getByText(/rest-of-season rankings — rb/i)).toBeTruthy();
    // The hurt back ranks behind the healthy one on the same filter.
    const body = within(table).getAllByRole('rowheader');
    expect(body[0].textContent).toContain('Lead Back');
    expect(body[1].textContent).toContain('Hurt Back');
  });

  it('shows the owner column only in league mode', () => {
    const { unmount } = renderPage(guestLeague);
    expect(screen.queryByRole('columnheader', { name: 'Owner' })).toBeNull();
    unmount();
    renderPage(leagueWithRoster());
    expect(screen.getByRole('columnheader', { name: 'Owner' })).toBeTruthy();
    expect(screen.getByText('Motha Puka')).toBeTruthy();
    expect(screen.getAllByText('Free agent').length).toBeGreaterThan(0);
  });
});
