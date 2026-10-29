// TradeFinderPage rendering against a synthetic pool: a complementary
// team pair produces a proposed swap card with a working deep link, and a
// balanced league renders the empty state. The bundled pool is mocked so
// the test never depends on the live player data.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
