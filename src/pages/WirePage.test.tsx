import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { League, Player, Transaction } from '@/types';
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

function league(transactionsByTeam: Record<string, Transaction[]>): League {
  const teams = Object.entries(transactionsByTeam).map(([id, transactions]) => ({
    id,
    name: `Team ${id}`,
    transactions,
  }));
  return { id: 'L1', name: 'Wire Test League', season: 2026, teams } as unknown as League;
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
