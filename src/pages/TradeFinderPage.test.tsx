// TradeFinderPage rendering against a synthetic pool: a complementary
// team pair produces a proposed swap card with a working deep link, and a
// balanced league renders the empty state. The bundled pool is mocked so
// the test never depends on the live player data.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League, Team } from '@/types';
import type { PoolPlayer } from '@/types/draft';

const h = vi.hoisted(() => {
  const players: PoolPlayer[] = [];
  const add = (pos: string, count: number, base: number, step: number) => {
    for (let i = 0; i < count; i++) {
      const pts = base - i * step;
      players.push({
        id: `${pos}${i + 1}`,
        name: `${pos}${i + 1}`,
        team: 'FA',
        pos,
        posRank: i + 1,
        overallRank: players.length + 1,
        tier: 1,
        bye: null,
        baseValue: null,
        projPts: pts,
        projPtsPpr: pts,
        projPtsStd: pts,
      } as PoolPlayer);
    }
  };
  add('QB', 20, 380, 8);
  add('RB', 60, 300, 4);
  add('WR', 60, 280, 4);
  add('TE', 30, 220, 5);
  return { players };
});

vi.mock('@/data/draftPool', () => ({
  POOL: { players: h.players, season: 2026 },
}));

function team(id: string, name: string, rosterIds: string[]): Team {
  return {
    id,
    name,
    roster: rosterIds.map(rid => ({
      id: rid,
      platformId: rid,
      name: rid,
      position: rid.replace(/[0-9]+$/, ''),
      team: 'FA',
    })),
  } as Team;
}

function league(teams: Team[]): League {
  return {
    id: 'test',
    name: 'Test League',
    platform: 'sleeper',
    totalTeams: teams.length,
    rosterSlots: {
      QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, K: 1, DST: 1, BENCH: 6, IR: 1,
    },
    scoringType: 'ppr',
    teams,
  } as League;
}

function renderPage(leagueArg: League) {
  return render(
    <MemoryRouter>
      <TradeFinderPage league={leagueArg} />
    </MemoryRouter>,
  );
}

// Imported after the mock so the page binds the mocked pool.
import { TradeFinderPage } from './TradeFinderPage';
import { fireEvent } from '@testing-library/react';

function renderGuest() {
  return render(
    <MemoryRouter>
      <TradeFinderPage league={null} />
    </MemoryRouter>,
  );
}

// Type a query into one roster's search box and click the matching add
// button (the two builders disambiguate by roster title).
function addToRoster(rosterTitle: string, query: string, playerName: string) {
  const input = screen.getByLabelText(
    `Add players to ${rosterTitle.toLowerCase()}`,
  );
  fireEvent.change(input, { target: { value: query } });
  fireEvent.click(
    screen.getByRole('button', {
      name: `Add ${playerName} to ${rosterTitle}`,
    }),
  );
}

describe('TradeFinderPage guest mode', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('renders two roster builders and prompts for both rosters', () => {
    renderGuest();
    expect(screen.getByLabelText('Add players to your team')).toBeInTheDocument();
    expect(screen.getByLabelText('Add players to trade partner')).toBeInTheDocument();
    expect(screen.getByText(/Add players to both rosters/)).toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: 'Proposed trades' }),
    ).not.toBeInTheDocument();
  });

  it('proposes a swap card between complementary manually entered rosters', () => {
    renderGuest();
    for (const [q, name] of [
      ['RB1', 'RB1'],
      ['RB2', 'RB2'],
      ['RB3', 'RB3'],
      ['RB4', 'RB4'],
      ['WR40', 'WR40'],
      ['TE20', 'TE20'],
    ] as const) {
      addToRoster('Your team', q, name);
    }
    for (const [q, name] of [
      ['WR1', 'WR1'],
      ['WR2', 'WR2'],
      ['WR3', 'WR3'],
      ['WR4', 'WR4'],
      ['RB40', 'RB40'],
      ['TE25', 'TE25'],
    ] as const) {
      addToRoster('Trade partner', q, name);
    }

    const cards = screen.getByRole('list', { name: 'Proposed trades' });
    expect(cards).toBeInTheDocument();
    expect(
      screen.getAllByRole('article', {
        name: /Your team and Trade partner proposed trade/,
      }).length,
    ).toBeGreaterThan(0);
    // A win-win reason names the new positional best.
    expect(screen.getAllByText(/becomes its best/).length).toBeGreaterThan(0);
    // The guest deep link carries player names only — no ta/tb team ids.
    const link = screen.getAllByRole('link', {
      name: /Analyze Your team and Trade partner trade/,
    })[0];
    const href = link.getAttribute('href') ?? '';
    expect(href).toMatch(/^\/trade-analyzer#trade=/);
    const decoded = decodeURIComponent(href);
    expect(decoded).toContain('"a":');
    expect(decoded).not.toContain('"ta"');
    expect(decoded).not.toContain('"tb"');
  });

  it('pre-fills your team from the Start/Sit guest roster', () => {
    sessionStorage.setItem(
      'guest-start-sit-roster',
      JSON.stringify(['RB1', 'WR1']),
    );
    renderGuest();
    expect(
      screen.getByRole('list', { name: 'Your team' }),
    ).toBeInTheDocument();
    const roster = screen.getByRole('list', { name: 'Your team' });
    expect(roster).toHaveTextContent('RB1');
    expect(roster).toHaveTextContent('WR1');
  });
});

describe('TradeFinderPage', () => {
  it('proposes a swap card between complementary teams', () => {
    renderPage(
      league([
        team('a', 'Team A', ['QB1', 'RB1', 'RB2', 'RB3', 'RB4', 'WR40', 'TE20']),
        team('b', 'Team B', ['QB2', 'RB40', 'WR1', 'WR2', 'WR3', 'WR4', 'TE25']),
        team('c', 'Team C', ['QB3', 'RB5', 'RB6', 'WR5', 'WR6', 'TE5']),
        team('d', 'Team D', ['QB4', 'RB7', 'RB8', 'WR7', 'WR8', 'TE6']),
      ]),
    );
    const cards = screen.getByRole('list', { name: 'Proposed trades' });
    expect(cards).toBeInTheDocument();
    const articles = screen.getAllByRole('article', { name: /Team A and Team B proposed trade/ });
    expect(articles.length).toBeGreaterThan(0);
    // A star-for-star card renders alongside the depth swap: its reasons
    // name the new positional best ("becomes its best WR/RB").
    expect(screen.getAllByText(/becomes its best/).length).toBeGreaterThan(0);
    // The card deep-links into the Trade Analyzer with the pairing pre-filled.
    const link = screen.getAllByRole('link', { name: /Analyze Team A and Team B trade/ })[0];
    const href = link.getAttribute('href') ?? '';
    expect(href).toMatch(/^\/trade-analyzer#trade=/);
    expect(decodeURIComponent(href)).toContain('"ta":"a"');
    expect(decodeURIComponent(href)).toContain('"tb":"b"');
  });

  it('renders the empty state when no pair lines up', () => {
    renderPage(
      league([
        team('a', 'Team A', ['QB1', 'RB1', 'RB2', 'RB3', 'WR1', 'WR2', 'WR3', 'TE1']),
        team('b', 'Team B', ['QB2', 'RB4', 'RB5', 'RB6', 'WR4', 'WR5', 'WR6', 'TE2']),
        team('c', 'Team C', ['QB3', 'RB7', 'RB8', 'RB9', 'WR7', 'WR8', 'WR9', 'TE3']),
        team('d', 'Team D', ['QB4', 'RB10', 'RB11', 'RB12', 'WR10', 'WR11', 'WR12', 'TE4']),
      ]),
    );
    expect(screen.queryByRole('list', { name: 'Proposed trades' })).not.toBeInTheDocument();
    expect(screen.getByText(/No win-win swaps right now/)).toBeInTheDocument();
  });

  it('renders Buy Low / Sell High targets from league weekly points, naming the owning team', () => {
    const lg = league([
      team('a', 'Team A', ['QB1', 'RB1', 'RB2', 'RB3', 'WR40', 'TE20']),
      team('b', 'Team B', ['QB2', 'RB40', 'WR1', 'WR2', 'WR3', 'TE25']),
    ]);
    lg.currentWeek = 8;
    lg.playerWeeklyPoints = {
      // Slumping: 4 strong weeks then 3 cold ones — buy low.
      RB1: { 1: 24, 2: 24, 3: 24, 4: 24, 5: 10, 6: 10, 7: 10 },
      // Surging: 4 quiet weeks then 3 hot ones — sell high.
      WR1: { 1: 8, 2: 8, 3: 8, 4: 8, 5: 24, 6: 24, 7: 24 },
    };
    renderPage(lg);
    const panel = screen.getByLabelText('Buy Low Sell High targets');
    expect(panel).toBeInTheDocument();
    expect(within(panel).getByText('RB1')).toBeInTheDocument();
    expect(within(panel).getByText('WR1')).toBeInTheDocument();
    // The owning league team is named on each target.
    expect(within(panel).getByText('Team A')).toBeInTheDocument();
    expect(within(panel).getByText('Team B')).toBeInTheDocument();
  });

  it('hides the Buy Low / Sell High panel when the league has no weekly points', () => {
    renderPage(
      league([
        team('a', 'Team A', ['QB1', 'RB1', 'RB2', 'RB3', 'WR1', 'WR2', 'WR3', 'TE1']),
        team('b', 'Team B', ['QB2', 'RB4', 'RB5', 'RB6', 'WR4', 'WR5', 'WR6', 'TE2']),
      ]),
    );
    expect(screen.queryByLabelText('Buy Low Sell High targets')).not.toBeInTheDocument();
  });

  it('announces the result count for assistive tech', () => {
    renderPage(
      league([
        team('a', 'Team A', ['QB1', 'RB1', 'RB2', 'RB3', 'WR1', 'WR2', 'WR3', 'TE1']),
        team('b', 'Team B', ['QB2', 'RB4', 'RB5', 'RB6', 'WR4', 'WR5', 'WR6', 'TE2']),
        team('c', 'Team C', ['QB3', 'RB7', 'RB8', 'RB9', 'WR7', 'WR8', 'WR9', 'TE3']),
        team('d', 'Team D', ['QB4', 'RB10', 'RB11', 'RB12', 'WR10', 'WR11', 'WR12', 'TE4']),
      ]),
    );
    expect(screen.getByText(/No win-win swaps right now/, { selector: 'p' })).toHaveAttribute(
      'aria-live',
      'polite',
    );
  });
});
