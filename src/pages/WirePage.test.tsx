import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { League, Player, Trade, Transaction } from '@/types';
import { WirePage } from './WirePage';

function player(name: string, position = 'RB', team = 'SF'): Player {
  return { id: name, platformId: name, name, position, team };
}

function tx(
  id: string,
  type: Transaction['type'],
  timestamp: number,
  week: number,
  teamId: string,
  teamName: string,
  adds: Player[] = [],
  drops: Player[] = [],
): Transaction {
  return { id, type, timestamp, week, teamId, teamName, adds, drops };
}

function trade(
  id: string,
  status: Trade['status'],
  timestamp: number,
  week: number,
  sides: {
    teamId: string;
    teamName: string;
    received: Player[];
    picksReceived?: { season: number; round: number }[];
    faabReceived?: number;
  }[],
): Trade {
  return {
    id,
    status,
    timestamp,
    week,
    teams: sides.map(s => ({
      teamId: s.teamId,
      teamName: s.teamName,
      playersReceived: s.received,
      playersSent: [],
      draftPicksReceived: s.picksReceived,
      faabReceived: s.faabReceived,
    })),
  } as unknown as Trade;
}

function league(
  transactionsByTeam: Record<string, Transaction[]>,
  trades: Trade[] = [],
): League {
  const teams = Object.entries(transactionsByTeam).map(([id, transactions]) => ({
    id,
    name: `Team ${id}`,
    transactions,
  }));
  return { id: 'L1', name: 'Wire Test League', season: 2026, teams, trades } as unknown as League;
}

describe('WirePage', () => {
  it('renders waiver and free-agent moves newest first', () => {
    render(
      <WirePage
        league={league({
          t1: [
            tx('old', 'waiver', 1_000, 3, 't1', 'Team t1', [player('Kareem Hunt')], [player('Jaylen Warren')]),
            tx('mid', 'free_agent', 2_000, 4, 't1', 'Team t1', [player('Bucky Irving')]),
          ],
          t2: [
            tx('new', 'waiver', 3_000, 5, 't2', 'Team t2', [player('Emeka Egbuka')], [], undefined),
          ],
        })}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Emeka Egbuka');
    expect(items[1]).toHaveTextContent('Bucky Irving');
    expect(items[2]).toHaveTextContent('Kareem Hunt');
    expect(items[2]).toHaveTextContent('Jaylen Warren');
  });

  it('excludes trades and shows the empty state when nothing synced', () => {
    render(
      <WirePage
        league={league({ t1: [tx('t', 'trade', 1_000, 3, 't1', 'Team t1', [player('JaMarr Chase')])] })}
      />,
    );
    expect(screen.getByText('No transactions yet')).toBeInTheDocument();
  });

  it('filters by team and by move type', () => {
    render(
      <WirePage
        league={league({
          t1: [tx('a', 'waiver', 1_000, 3, 't1', 'Team t1', [player('Kareem Hunt')])],
          t2: [tx('b', 'free_agent', 2_000, 4, 't2', 'Team t2', [player('Bucky Irving')])],
        })}
      />,
    );
    expect(screen.getByText('2 moves')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Team'), { target: { value: 't2' } });
    expect(screen.getByText('1 move')).toBeInTheDocument();
    expect(screen.getByText('Bucky Irving')).toBeInTheDocument();
    expect(screen.queryByText('Kareem Hunt')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Team'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Move type'), { target: { value: 'free_agent' } });
    expect(screen.getByText('1 move')).toBeInTheDocument();
    expect(screen.getByText('Bucky Irving')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Move type'), { target: { value: 'waiver' } });
    expect(screen.getByText('1 move')).toBeInTheDocument();
    expect(screen.getByText('Kareem Hunt')).toBeInTheDocument();
  });

  it('renders completed trades on the wire, newest first', () => {
    render(
      <WirePage
        league={league(
          {
            t1: [tx('a', 'waiver', 1_000, 3, 't1', 'Team t1', [player('Kareem Hunt')])],
            t2: [],
          },
          [
            trade('x', 'completed', 2_000, 4, [
              { teamId: 't1', teamName: 'Team t1', received: [player('JaMarr Chase', 'WR')] },
              { teamId: 't2', teamName: 'Team t2', received: [player('Amon-Ra St. Brown', 'WR')] },
            ]),
          ],
        )}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Team t1 ⇄ Team t2');
    expect(items[0]).toHaveTextContent('Team t1 received');
    expect(items[0]).toHaveTextContent('JaMarr Chase');
    expect(items[0]).toHaveTextContent('Team t2 received');
    expect(items[0]).toHaveTextContent('Amon-Ra St. Brown');
    expect(items[1]).toHaveTextContent('Kareem Hunt');
  });

  it('filters by move type to trades only, and by either trade side', () => {
    render(
      <WirePage
        league={league(
          {
            t1: [tx('a', 'waiver', 1_000, 3, 't1', 'Team t1', [player('Kareem Hunt')])],
            t2: [],
          },
          [
            trade('x', 'completed', 2_000, 4, [
              { teamId: 't1', teamName: 'Team t1', received: [player('JaMarr Chase', 'WR')] },
              { teamId: 't2', teamName: 'Team t2', received: [player('Amon-Ra St. Brown', 'WR')] },
            ]),
          ],
        )}
      />,
    );
    expect(screen.getByText('2 moves')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Move type'), { target: { value: 'trade' } });
    expect(screen.getByText('1 move')).toBeInTheDocument();
    expect(screen.getByText('JaMarr Chase')).toBeInTheDocument();
    expect(screen.queryByText('Kareem Hunt')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Move type'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Team'), { target: { value: 't2' } });
    expect(screen.getByText('1 move')).toBeInTheDocument();
    expect(screen.getByText('Amon-Ra St. Brown')).toBeInTheDocument();
  });

  it('renders draft picks and FAAB received on trade rows', () => {
    render(
      <WirePage
        league={league(
          { t1: [], t2: [] },
          [
            trade('x', 'completed', 2_000, 4, [
              {
                teamId: 't1',
                teamName: 'Team t1',
                received: [player('JaMarr Chase', 'WR')],
                picksReceived: [{ season: 2027, round: 2 }],
                faabReceived: 15,
              },
              { teamId: 't2', teamName: 'Team t2', received: [] },
            ]),
          ],
        )}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('JaMarr Chase');
    expect(items[0]).toHaveTextContent('2027 Round 2 pick');
    expect(items[0]).toHaveTextContent('draft pick');
    expect(items[0]).toHaveTextContent('$15 FAAB');
    expect(items[0]).toHaveTextContent('waiver budget');
    // A side that received nothing at all reads "nothing", not the old
    // "no players (picks or FAAB)" fallback.
    expect(items[0]).toHaveTextContent('Team t2 received');
    expect(items[0]).toHaveTextContent('nothing');
    expect(items[0]).not.toHaveTextContent('picks or FAAB');
    expect(screen.getByText(/Draft picks and FAAB that changed hands are shown/)).toBeInTheDocument();
  });

  it('announces the move count in a live region', () => {
    render(
      <WirePage
        league={league({
          t1: [tx('a', 'waiver', 1_000, 3, 't1', 'Team t1', [player('Kareem Hunt')])],
        })}
      />,
    );
    const live = screen.getByText('1 move');
    expect(live).toHaveAttribute('aria-live', 'polite');
  });
});
