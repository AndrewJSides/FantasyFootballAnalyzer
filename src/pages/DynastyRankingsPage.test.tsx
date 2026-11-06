// DynastyRankingsPage (backlog item 177): the /dynasty board ranks by
// age-adjusted value, filters per position with re-ranked redraft scope,
// and names owners in league mode only.
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { DynastyRankingsPage } from './DynastyRankingsPage';
import type { League, Team, Player } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

function pl(
  id: string,
  name: string,
  pos: string,
  projPtsPpr: number,
  overallRank: number,
  posRank: number,
  sleeperId?: string,
): PoolPlayer {
  return {
    id,
    name,
    team: 'DAL',
    pos,
    posRank,
    overallRank,
    tier: 1,
    bye: 7,
    baseValue: null,
    projPtsPpr,
    sleeperId,
  } as PoolPlayer;
}

const pool: DraftPoolFile = {
  season: 2026,
  generatedAt: 'test',
  baseline: { budget: 200, teams: 10, rounds: 15 },
  players: [
    pl('young-rb', 'Young Back', 'RB', 280, 8, 3, 's-young'),
    pl('old-rb', 'Old Back', 'RB', 280, 9, 4, 's-old'),
    pl('young-wr', 'Young Receiver', 'WR', 260, 15, 5, 's-wr'),
    pl('no-age', 'No Age', 'WR', 250, 20, 7),
  ],
};

const ages: Record<string, number> = { 's-young': 23, 's-old': 29, 's-wr': 22 };

function leaguePlayer(id: string, platformId: string, name: string): Player {
  return { id, platformId, name, position: 'RB', team: 'DAL' };
}

function makeLeague(isGuest: boolean, rostered: Player[] = []): League {
  const team: Team = {
    id: 't1',
    name: 'Managers',
    roster: rostered,
  } as Team;
  return {
    id: 'lg',
    name: 'Test League',
    season: 2026,
    teams: [team],
    totalTeams: 1,
    currentWeek: 9,
    isGuest,
  } as League;
}

describe('DynastyRankingsPage', () => {
  it('ranks the young RB above the old RB on equal projections, with the redraft delta', () => {
    render(<DynastyRankingsPage league={makeLeague(true)} pool={pool} ages={ages} />);
    const table = screen.getByRole('table', { name: /Dynasty rankings, all positions/ });
    const rows = within(table).getAllByRole('row');
    // Header + 4 players.
    expect(rows).toHaveLength(5);
    expect(within(rows[1]).getByText('Young Back')).toBeInTheDocument();
    expect(within(rows[4]).getByText('Old Back')).toBeInTheDocument();
    // Young Back: dynasty 1 vs redraft 8 → +7.
    expect(within(rows[1]).getByText('+7')).toBeInTheDocument();
    // No Age: unknown age shows a dash.
    expect(within(rows[2]).getByText('—')).toBeInTheDocument();
  });

  it('filters to one position, re-ranking against the redraft position rank', () => {
    render(<DynastyRankingsPage league={makeLeague(true)} pool={pool} ages={ages} />);
    fireEvent.click(screen.getByRole('button', { name: 'RB' }));
    const table = screen.getByRole('table', { name: /Dynasty rankings, RB/ });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText('Young Back')).toBeInTheDocument();
    // RB board: redraft column is the position rank (3), delta +2.
    expect(within(rows[1]).getByText('3')).toBeInTheDocument();
    expect(within(rows[1]).getByText('+2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'RB' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('names the owner in league mode and hides the column in guest mode', () => {
    const league = makeLeague(false, [leaguePlayer('young-rb', 's-young', 'Young Back')]);
    const { rerender } = render(
      <DynastyRankingsPage league={league} pool={pool} ages={ages} />,
    );
    expect(screen.getByRole('columnheader', { name: 'Owner' })).toBeInTheDocument();
    expect(screen.getByText('Managers')).toBeInTheDocument();
    expect(screen.getAllByText('Free agent')).toHaveLength(3);

    rerender(<DynastyRankingsPage league={makeLeague(true)} pool={pool} ages={ages} />);
    expect(screen.queryByRole('columnheader', { name: 'Owner' })).not.toBeInTheDocument();
  });
});
