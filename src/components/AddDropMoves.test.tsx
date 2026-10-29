// AddDropMoves rendering: a mocked suggestion list renders the team
// picker + move rows; switching teams re-prices; empty roster and
// no-move states render their notes.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddDropMoves } from './AddDropMoves';
import { addDropSuggestions } from '@/utils/addDropSuggest';
import type { League, Team } from '@/types';

vi.mock('@/utils/addDropSuggest', () => ({
  addDropSuggestions: vi.fn(),
  MAX_SUGGESTIONS: 3,
}));
const mockSuggest = vi.mocked(addDropSuggestions);

function rosterPlayer(id: string, pos: string) {
  return { id, platformId: id, name: id, position: pos, team: 'FA' };
}

function mkTeam(id: string, name: string, opts: { mine?: boolean; roster?: string[] } = {}): Team {
  return {
    id,
    name,
    isMyTeam: opts.mine ?? false,
    roster: (opts.roster ?? ['a', 'b']).map(rid => rosterPlayer(rid, 'QB')),
  } as Team;
}

function leagueOf(teams: Team[]): League {
  return {
    id: 'test',
    name: 'Test League',
    platform: 'sleeper',
    totalTeams: 10,
    rosterSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1 },
    scoringType: 'ppr',
    teams,
  } as League;
}

const moveFor = (addName: string, dropName: string) => ({
  add: { id: `add-${addName}`, name: addName, pos: 'QB', team: 'DAL' },
  drop: { id: `drop-${dropName}`, name: dropName, pos: 'QB', team: 'FA' },
  addVor: 30,
  dropVor: 20,
  gain: 10,
  reasons: ['+10 VOR on paper (20 → 30).'],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AddDropMoves', () => {
  it('renders the team picker and move rows for the default team', () => {
    const me = mkTeam('t1', 'My Team', { mine: true });
    const other = mkTeam('t2', 'Rival');
    mockSuggest.mockReturnValue([moveFor('Hot QB', 'Bench QB')]);
    render(<AddDropMoves league={leagueOf([me, other])} />);

    const picker = screen.getByLabelText('Moves for') as HTMLSelectElement;
    expect(picker.value).toBe('t1');
    expect(screen.getByText('Hot QB')).toBeInTheDocument();
    expect(screen.getByText('Bench QB')).toBeInTheDocument();
    expect(screen.getByLabelText(/Net value over replacement gain/)).toHaveTextContent('+10');
    expect(mockSuggest).toHaveBeenCalledTimes(1);
    expect(mockSuggest.mock.calls[0][1]).toBe(me);
  });

  it('re-prices when the team picker changes', () => {
    const me = mkTeam('t1', 'My Team', { mine: true });
    const other = mkTeam('t2', 'Rival');
    mockSuggest.mockImplementation((_lg, team) =>
      (team as Team).id === 't2' ? [moveFor('Rival Hot', 'Rival Bench')] : [moveFor('Hot QB', 'Bench QB')],
    );
    render(<AddDropMoves league={leagueOf([me, other])} />);
    expect(screen.getByText('Hot QB')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Moves for'), { target: { value: 't2' } });
    expect(screen.getByText('Rival Hot')).toBeInTheDocument();
    expect(screen.queryByText('Hot QB')).not.toBeInTheDocument();
  });

  it('shows the no-roster note for a team with no roster', () => {
    const empty = mkTeam('t1', 'Empty Team', { mine: true, roster: [] });
    mockSuggest.mockReturnValue([]);
    render(<AddDropMoves league={leagueOf([empty])} />);
    expect(screen.getByText(/No roster data for Empty Team/)).toBeInTheDocument();
  });

  it('shows the no-move note when nothing beats the bench', () => {
    const me = mkTeam('t1', 'My Team', { mine: true });
    mockSuggest.mockReturnValue([]);
    render(<AddDropMoves league={leagueOf([me])} />);
    expect(screen.getByText(/Nothing on the waiver wire beats/)).toBeInTheDocument();
  });
});
