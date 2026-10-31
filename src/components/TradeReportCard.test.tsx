// TradeReportCard rendering: rows render best-grade first with trade PAR,
// W-L-F, best/worst trades, and grades; the section hides with no completed
// trades.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TradeReportCard } from './TradeReportCard';
import type { League, Trade, Team } from '@/types';

function side(teamId: string, teamName: string, netPar: number): Trade['teams'][number] {
  return {
    teamId,
    teamName,
    playersReceived: [],
    playersSent: [],
    parGained: 0,
    parLost: 0,
    netPAR: netPar,
    pointsGained: 0,
    pointsLost: 0,
    netValue: 0,
  };
}

function trade(id: string, week: number, teams: Trade['teams'], winner?: string): Trade {
  return { id, timestamp: 1, week, status: 'completed', teams, winner };
}

function mkTeam(id: string, name: string): Team {
  return { id, name, roster: [] } as Team;
}

function leagueOf(teams: Team[], trades: Trade[]): League {
  return {
    id: 'test',
    name: 'Test League',
    platform: 'sleeper',
    totalTeams: teams.length,
    rosterSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1 },
    scoringType: 'ppr',
    teams,
    trades,
  } as League;
}

describe('TradeReportCard', () => {
  it('renders rows best first with trade PAR, W-L-F, best/worst trades, and grades', () => {
    const league = leagueOf(
      [mkTeam('a', 'Alpha'), mkTeam('b', 'Beta')],
      [
        trade('t1', 3, [side('a', 'Alpha', 12.5), side('b', 'Beta', -12.5)], 'a'),
        trade('t2', 5, [side('a', 'Alpha', -4), side('b', 'Beta', 4)], 'b'),
      ],
    );
    render(<TradeReportCard league={league} />);
    const rows = screen.getAllByRole('row');
    // header + 2 team rows
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('Alpha');
    expect(rows[1]).toHaveTextContent('+8.5');
    expect(rows[1]).toHaveTextContent('1-1-0');
    expect(rows[1]).toHaveTextContent('W3 vs Beta (+12.5)');
    expect(rows[1]).toHaveTextContent('W5 vs Beta (-4)');
    expect(rows[1]).toHaveTextContent('A+');
    expect(rows[2]).toHaveTextContent('Beta');
    expect(rows[2]).toHaveTextContent('C+');
  });

  it('hides when the league has no completed trades', () => {
    const league = leagueOf([mkTeam('a', 'Alpha')], []);
    const { container } = render(<TradeReportCard league={league} />);
    expect(container.firstChild).toBeNull();
  });
});
