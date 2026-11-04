// MatchupPage: Sleeper projection column on the game-plan lineup table
// (backlog item 125). Focus-team rows resolve to Sleeper ids through the
// pool join; the column never blocks the table — a pending or failed
// fetch just leaves dashes.

import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

// Star Quarterback and Bench Runner resolve by name to Sleeper ids 9001 /
// 9002; every other roster player has no pool match, so no Sleeper line.
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

describe('MatchupPage Sleeper column (item 125)', () => {
  it('shows Sleeper values for resolved players and dashes for missing lines in the game-plan table', async () => {
    mockedProjections.mockResolvedValue({ '9001': 18.4, '9002': 6.2 });
    renderPage();
    expect(mockedProjections).toHaveBeenCalledTimes(1);
    expect(mockedProjections).toHaveBeenCalledWith(2026, 9);

    // Game plan defaults to my team (My Squad).
    const table = screen.getByRole('table', {
      name: 'Projected optimal lineup for My Squad',
    });
    expect(within(table).getByRole('columnheader', { name: 'Sleeper' })).toBeInTheDocument();
    await screen.findByLabelText('Sleeper projection 18.4');
    expect(
      within(table).getByLabelText('Sleeper projection 18.4'),
    ).toBeInTheDocument();
    expect(
      within(table).getByLabelText('Sleeper projection 6.2'),
    ).toBeInTheDocument();
    expect(
      within(table).getAllByLabelText('No Sleeper projection for this player')
        .length,
    ).toBeGreaterThan(0);
  });

  it('leaves the game-plan table dashed and intact when the Sleeper fetch fails', async () => {
    mockedProjections.mockRejectedValue(new Error('down'));
    renderPage();
    const table = screen.getByRole('table', {
      name: 'Projected optimal lineup for My Squad',
    });
    expect(within(table).getByText('Star Quarterback')).toBeInTheDocument();
    expect(
      within(table).getAllByLabelText('Sleeper projection not loaded').length,
    ).toBeGreaterThan(0);
  });
});
