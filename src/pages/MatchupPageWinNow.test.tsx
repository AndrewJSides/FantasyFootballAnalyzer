// MatchupPage "Win-now trades" section: the all-clear when no swap
// raises the focus team's win chance, cards with deep links when one
// does, and re-orientation when the focus team changes.

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League, Team, WeeklyMatchup } from '@/types';
import type { PoolPlayer } from '@/types/draft';

// Same synthetic-pool trick as TradeFinderPage.test.tsx.
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

// Imported after the mock so the page binds the mocked pool.
import MatchupPage from './MatchupPage';

function team(id: string, name: string, rosterIds: string[], isMyTeam: boolean): Team {
  return {
    id,
    name,
    isMyTeam,
    roster: rosterIds.map(rid => ({
      id: rid,
      platformId: rid,
      name: rid,
      position: rid.replace(/[0-9]+$/, ''),
      team: 'FA',
    })),
  } as Team;
}

function weekly(entries: Record<string, number[]>): Record<string, Record<number, number>> {
  const out: Record<string, Record<number, number>> = {};
  for (const [id, scores] of Object.entries(entries)) {
    out[id] = {};
    scores.forEach((s, i) => {
      out[id][i + 1] = s;
    });
  }
  return out;
}

// Team A (my team, the favorite) has no win-win swap that raises its own
// win chance; Team B (the underdog) does — WR1/RB1 style need swaps.
function league(): League {
  const teams = [
    team('a', 'Team A', ['QB1', 'RB1', 'RB2', 'RB3', 'RB4', 'WR40', 'TE20'], true),
    team('b', 'Team B', ['QB2', 'RB40', 'WR1', 'WR2', 'WR3', 'WR4', 'TE25'], false),
  ];
  return {
    id: 'test',
    name: 'Test League',
    platform: 'sleeper',
    season: 2026,
    currentWeek: 4,
    totalTeams: teams.length,
    rosterSlots: {
      QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, K: 1, DST: 1, BENCH: 6, IR: 1,
    },
    scoringType: 'ppr',
    teams,
    // Varied weekly scores so the Monte Carlo win probability has real
    // volatility — flat lines would make every sim deterministic.
    playerWeeklyPoints: weekly({
      QB1: [18, 20, 22],
      RB1: [14, 16, 18], RB2: [13, 15, 17], RB3: [12, 14, 16], RB4: [11, 13, 15],
      WR40: [4, 6, 8], TE20: [6, 8, 10],
      QB2: [18, 20, 22], RB40: [6, 8, 10],
      WR1: [12, 14, 16], WR2: [11, 13, 15], WR3: [10, 12, 14], WR4: [9, 11, 13],
      TE25: [6, 8, 10],
    }),
    futureSchedule: [{ week: 4, team1Id: 'a', team2Id: 'b' } as WeeklyMatchup],
  } as League;
}

function renderPage(l: League) {
  return render(
    <MemoryRouter>
      <MatchupPage league={l} />
    </MemoryRouter>,
  );
}

describe('MatchupPage win-now trades', () => {
  it('shows the all-clear when no swap raises the focus team\'s win chance', () => {
    renderPage(league());
    expect(
      screen.getByRole('heading', { name: 'Win-now trades' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No Trade Finder swap raises Team A's win chance this week/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: /Trades that raise/ }),
    ).not.toBeInTheDocument();
  });

  it('renders win-now cards with a deep link when the focus team switches', () => {
    renderPage(league());
    fireEvent.click(screen.getByRole('button', { name: 'Team B' }));
    const list = screen.getByRole('list', {
      name: /Trades that raise Team B's win chance this week/,
    });
    expect(list).toBeInTheDocument();
    const cards = within(list).getAllByRole('listitem');
    expect(cards.length).toBeGreaterThan(0);
    expect(
      within(list).getAllByText(/Give .+, get .+ — win chance/).length,
    ).toBeGreaterThan(0);
    const link = within(list).getAllByRole('link', { name: 'Analyze this trade' })[0];
    const href = link.getAttribute('href') ?? '';
    expect(href).toMatch(/^\/trade-analyzer#trade=/);
    const decoded = decodeURIComponent(href);
    expect(decoded).toContain('"ta":');
    expect(decoded).toContain('"tb":');
  });
});
