// WaiverReportCard rendering: rows render best-grade first with PAR and
// pickups; the section hides with no wire activity or ungraded pickups.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WaiverReportCard } from './WaiverReportCard';
import type { League, Player, Team, Transaction } from '@/types';

function pickup(name: string, par: number | null): Player {
  return { id: name, platformId: name, name, position: 'WR', team: 'FA', pointsAboveReplacement: par ?? undefined } as Player;
}

function wireTx(teamId: string, adds: Player[]): Transaction {
  return {
    id: `${teamId}-${adds.map(a => a.name).join('+')}`,
    type: 'waiver',
    timestamp: 1,
    week: 2,
    teamId,
    teamName: teamId,
    adds,
    drops: [],
  } as Transaction;
}

function mkTeam(id: string, name: string, txs: Transaction[]): Team {
  return { id, name, roster: [], transactions: txs } as Team;
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

describe('WaiverReportCard', () => {
  it('renders rows best first with PAR, best/worst pickups, and grades', () => {
    const league = leagueOf([
      mkTeam('a', 'Alpha', [wireTx('a', [pickup('Boom', 12.5), pickup('Bust', -3)])]),
      mkTeam('b', 'Beta', [wireTx('b', [pickup('Steady', 4)])]),
    ]);
    render(<WaiverReportCard league={league} />);
    const rows = screen.getAllByRole('row');
    // header + 2 team rows
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('Alpha');
    expect(rows[1]).toHaveTextContent('+9.5');
    expect(rows[1]).toHaveTextContent('Boom (+12.5)');
    expect(rows[1]).toHaveTextContent('Bust (-3)');
    expect(rows[2]).toHaveTextContent('Beta');
  });

  it('hides when the league has no wire activity', () => {
    const league = leagueOf([mkTeam('a', 'Alpha', [])]);
    const { container } = render(<WaiverReportCard league={league} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('hides when the sync graded no pickups', () => {
    const league = leagueOf([
      mkTeam('a', 'Alpha', [wireTx('a', [pickup('X', null)])]),
    ]);
    const { container } = render(<WaiverReportCard league={league} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('WaiverReportCard FAAB efficiency columns', () => {
  function bidTx(teamId: string, adds: Player[], bid: number): Transaction {
    const tx = wireTx(teamId, adds);
    (tx as Transaction).waiverBudgetSpent = bid;
    return tx;
  }

  it('renders FAAB $ and $/pt columns when the league has recorded bids', () => {
    const league = leagueOf([
      mkTeam('a', 'Alpha', [bidTx('a', [pickup('Boom', 20)], 25)]),
      mkTeam('b', 'Beta', [bidTx('b', [pickup('Freebie', 8)], 0)]),
      mkTeam('c', 'Gamma', [bidTx('c', [pickup('Dud', -2)], 15)]),
    ]);
    render(<WaiverReportCard league={league} />);
    expect(screen.getByRole('columnheader', { name: 'FAAB $' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '$/pt' })).toBeInTheDocument();
    const rows = screen.getAllByRole('row');
    // Alpha first (20 PAR): $25 spent, $1.3/pt. Beta: $0 spent, Free.
    expect(rows[1]).toHaveTextContent('$25');
    expect(rows[1]).toHaveTextContent('$1.3');
    expect(rows[2]).toHaveTextContent('Free');
  });

  it('hides the FAAB columns when the league has no recorded bids', () => {
    const league = leagueOf([
      mkTeam('a', 'Alpha', [wireTx('a', [pickup('Boom', 12.5)])]),
    ]);
    render(<WaiverReportCard league={league} />);
    expect(screen.queryByRole('columnheader', { name: 'FAAB $' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '$/pt' })).not.toBeInTheDocument();
  });
});
