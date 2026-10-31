// FaabBudgets rendering: budget rows render poorest-first with remaining
// estimates; the section hides when the league has no recorded bids.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FaabBudgets } from './FaabBudgets';
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
    rosterSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1 },
    scoringType: 'ppr',
    teams,
  } as League;
}

describe('FaabBudgets', () => {
  it('renders budget rows poorest first with spent and remaining', () => {
    const league = leagueOf([
      mkTeam('a', 'Alpha', [5]),
      mkTeam('b', 'Beta', [60, 40]),
    ]);
    render(<FaabBudgets league={league} />);
    const rows = screen.getAllByRole('row');
    // header + 2 team rows
    expect(rows).toHaveLength(3);
    // Beta spent 100 (poorest) comes first.
    expect(rows[1]).toHaveTextContent('Beta');
    expect(rows[1]).toHaveTextContent('$100');
    expect(rows[2]).toHaveTextContent('Alpha');
    // A zero-remaining team is marked broke in its accessible label.
    expect(screen.getByText('$0')).toBeTruthy();
  });

  it('hides the section when no bids are recorded', () => {
    const league = leagueOf([mkTeam('a', 'Alpha', [])]);
    const { container } = render(<FaabBudgets league={league} />);
    expect(container.firstChild).toBeNull();
  });
});
