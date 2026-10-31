// WaiverPriority rendering: ranked table renders for the selected team,
// with a Bid column only when the league has recorded bids.
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WaiverPriority } from './WaiverPriority';
import type { League, Team, Transaction } from '@/types';

function waiverTx(teamId: string, bid: number): Transaction {
  return {
    id: `${teamId}-${bid}`,
    type: 'waiver',
    timestamp: 1,
    week: 2,
    teamId,
    teamName: teamId,
    adds: [],
    drops: [],
    waiverBudgetSpent: bid,
  } as Transaction;
}

function mkTeam(id: string, name: string, bids: number[]): Team {
  return {
    id,
    name,
    isMyTeam: id === 'a',
    roster: [],
    transactions: bids.map(b => waiverTx(id, b)),
  } as Team;
}

function leagueOf(teams: Team[]): League {
  return {
    id: 'test',
    name: 'Test League',
    platform: 'sleeper',
    totalTeams: teams.length,
    rosterSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, K: 1, DST: 1, BENCH: 5, IR: 0 },
    scoringType: 'ppr',
    season: 2026,
    currentWeek: 8,
    teams,
  } as League;
}

describe('WaiverPriority', () => {
  it('renders a ranked table of 8 claim targets for the selected team', () => {
    render(<WaiverPriority league={leagueOf([mkTeam('a', 'Alpha', []), mkTeam('b', 'Beta', [])])} />);
    expect(screen.getByRole('heading', { name: 'Waiver Priority Queue' })).toBeDefined();
    // 8 data rows + 1 header row.
    expect(screen.getAllByRole('row')).toHaveLength(9);
    expect(screen.getByLabelText('Ranking for')).toBeDefined();
  });

  it('shows the Bid column when the league has recorded bids', () => {
    render(<WaiverPriority league={leagueOf([mkTeam('a', 'Alpha', [5]), mkTeam('b', 'Beta', [])])} />);
    expect(screen.getByRole('columnheader', { name: 'Bid' })).toBeDefined();
  });

  it('hides the Bid column when the league has no bid data', () => {
    render(<WaiverPriority league={leagueOf([mkTeam('a', 'Alpha', []), mkTeam('b', 'Beta', [])])} />);
    expect(screen.queryByRole('columnheader', { name: 'Bid' })).toBeNull();
  });

  it('re-ranks when the team picker changes', () => {
    render(<WaiverPriority league={leagueOf([mkTeam('a', 'Alpha', []), mkTeam('b', 'Beta', [])])} />);
    const select = screen.getByLabelText('Ranking for') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'b' } });
    expect(select.value).toBe('b');
    expect(screen.getAllByRole('row')).toHaveLength(9);
  });
});
