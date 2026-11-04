// MatchupPage: Sleeper projected score line on the game card (backlog
// item 126). The totals sum Sleeper's week-N projections over each
// side's optimal starters — the same lineups the preview prices — with
// a dash where Sleeper published no line for a side's starters. The
// line never blocks the card: a failed fetch just leaves dashes.

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League, Player, Team, WeeklyMatchup } from '@/types';
import MatchupPage from './MatchupPage';

vi.mock('@/data/draftPool', () => ({
  POOL: {
    season: 2026,
    generatedAt: '2026-11-03T00:00:00Z',
    baseline: { budget: 200, teams: 10, rounds: 16 },
    players: [
      { id: 'pool-qb', name: 'Star Quarterback', pos: 'QB', sleeperId: '9001' },
      { id: 'pool-rb', name: 'Bench Runner', pos: 'RB', sleeperId: '9002' },
    ],
  },
}));

vi.mock('@/api/sleeperWeeklyProjections', () => ({
  fetchSleeperWeekProjections: vi.fn(),
}));

import { fetchSleeperWeekProjections } from '@/api/sleeperWeeklyProjections';

const mockedProjections = vi.mocked(fetchSleeperWeekProjections);

function mkPlayer(platformId: string, name: string, pos: string): Player {
  return { id: platformId, platformId, name, position: pos, team: 'XXX' } as Player;
}

function weekly(flat: number): Record<number, number> {
  const out: Record<number, number> = {};
  for (let w = 1; w <= 8; w++) out[w] = flat;
  return out;
}

// Optimal starters for My Squad: QB 25, RB 20/18, WR 19/17, TE 12, FLEX
// Bench Runner 5 (7 starters). Star Quarterback and Bench Runner resolve
// by name to Sleeper ids 9001 / 9002; every other roster player has no
// pool match, so no Sleeper line. Rivals field a lone QB with no line.
const MY_ROSTER: Array<[string, string, string, number]> = [
  ['yahoo-qb', 'Star Quarterback', 'QB', 25],
  ['yahoo-rb1', 'Workhorse', 'RB', 20],
  ['yahoo-rb2', 'Second Back', 'RB', 18],
  ['yahoo-wr1', 'Top Wideout', 'WR', 19],
  ['yahoo-wr2', 'Second Wideout', 'WR', 17],
  ['yahoo-te1', 'Top Tight', 'TE', 12],
  ['yahoo-rb3', 'Bench Runner', 'RB', 5],
  ['yahoo-rb4', 'Deep Bench', 'RB', 2],
];

function league(): League {
  const mine: Team = {
    id: 'M',
    name: 'My Squad',
    isMyTeam: true,
    roster: MY_ROSTER.map(([id, name, pos]) => mkPlayer(id, name, pos)),
  } as Team;
  const rivals: Team = {
    id: 'R',
    name: 'Rivals',
    isMyTeam: false,
    roster: [mkPlayer('r-qb', 'Rival Quarterback', 'QB')],
  } as Team;
  const pw: Record<string, Record<number, number>> = {};
  for (const [id, , , flat] of MY_ROSTER) pw[id] = weekly(flat);
  pw['r-qb'] = weekly(10);
  return {
    id: 'L',
    name: 'Test League',
    platform: 'yahoo',
    season: 2026,
    currentWeek: 9,
    rosterSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1, BENCH: 6 },
    teams: [mine, rivals],
    playerWeeklyPoints: pw,
    futureSchedule: [{ week: 9, team1Id: 'M', team2Id: 'R' } as WeeklyMatchup],
  } as League;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <MatchupPage league={league()} />
    </MemoryRouter>,
  );
}

describe('MatchupPage Sleeper totals (item 126)', () => {
  it('sums Sleeper lines over the optimal starters and dashes a lineless side', async () => {
    mockedProjections.mockResolvedValue({ '9001': 18.4, '9002': 6.2 });
    renderPage();
    // 18.4 (Star Quarterback) + 6.2 (Bench Runner, the FLEX) over 7 starters.
    await screen.findByLabelText(
      'Sleeper projected score My Squad: 24.6 over 2 of 7 starters',
    );
    expect(
      screen.getByLabelText('No Sleeper projection for Rivals starters'),
    ).toBeInTheDocument();
  });

  it('leaves the card intact with dashes when the Sleeper fetch fails', async () => {
    mockedProjections.mockRejectedValue(new Error('down'));
    renderPage();
    expect(
      await screen.findByText('Week 9: My Squad vs Rivals'),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Sleeper projected score My Squad:/),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByLabelText('Sleeper projection not loaded').length,
    ).toBeGreaterThan(0);
  });
});
