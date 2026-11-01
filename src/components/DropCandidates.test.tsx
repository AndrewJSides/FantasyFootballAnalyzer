// DropCandidates rendering: a mocked verdict list renders the team picker +
// verdict rows; switching teams re-prices; empty roster and all-hold states
// render their notes.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DropCandidates } from './DropCandidates';
import { dropOrHoldVerdicts } from '@/utils/dropOrHold';
import type { League, Team } from '@/types';

vi.mock('@/utils/dropOrHold', () => ({
  dropOrHoldVerdicts: vi.fn(),
  MAX_DROP_ROWS: 6,
}));
const mockVerdicts = vi.mocked(dropOrHoldVerdicts);

function rosterPlayer(id: string, pos: string) {
  return { id, platformId: id, name: id, position: pos, team: 'FA' };
}

function mkTeam(id: string, name: string, opts: { mine?: boolean; roster?: string[] } = {}): Team {
  return {
    id,
    name,
    isMyTeam: opts.mine ?? false,
    roster: (opts.roster ?? ['a', 'b']).map(rid => rosterPlayer(rid, 'RB')),
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

const rowFor = (name: string, verdict: 'drop' | 'regret' | 'hold') => ({
  player: { id: `p-${name}`, name, pos: 'RB', team: 'DAL' },
  vor: verdict === 'drop' ? 0 : 10,
  verdict,
  score: verdict === 'drop' ? 75 : 10,
  reasons: verdict === 'drop' ? ['Designated out — not scoring any time soon.'] : [],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DropCandidates', () => {
  it('renders the team picker and verdict rows for the default team', () => {
    const me = mkTeam('t1', 'My Team', { mine: true });
    const other = mkTeam('t2', 'Rival');
    mockVerdicts.mockReturnValue([
      rowFor('Washed Vet', 'drop'),
      rowFor('Steady Hand', 'hold'),
    ]);
    render(<DropCandidates league={leagueOf([me, other])} />);

    expect(screen.getByLabelText('Verdicts for')).toBeDefined();
    expect(screen.getByText('Washed Vet')).toBeDefined();
    expect(screen.getByText('Safe to drop')).toBeDefined();
    expect(screen.getByText('Hold for now')).toBeDefined();
    // Called once for the default (my) team.
    expect(mockVerdicts.mock.calls[0][1].id).toBe('t1');
  });

  it('re-prices when the team picker changes', () => {
    const me = mkTeam('t1', 'My Team', { mine: true });
    const other = mkTeam('t2', 'Rival');
    mockVerdicts.mockReturnValue([rowFor('Washed Vet', 'drop')]);
    render(<DropCandidates league={leagueOf([me, other])} />);

    fireEvent.change(screen.getByLabelText('Verdicts for'), {
      target: { value: 't2' },
    });
    const lastCall = mockVerdicts.mock.calls[mockVerdicts.mock.calls.length - 1];
    expect(lastCall[1].id).toBe('t2');
  });

  it('renders the all-clear note when nobody is droppable', () => {
    const me = mkTeam('t1', 'My Team', { mine: true });
    mockVerdicts.mockReturnValue([rowFor('Steady Hand', 'hold')]);
    render(<DropCandidates league={leagueOf([me])} />);

    expect(screen.getByText(/hold everyone/)).toBeDefined();
  });

  it('renders the no-roster note for a team with no roster data', () => {
    const me = mkTeam('t1', 'My Team', { mine: true, roster: [] });
    mockVerdicts.mockReturnValue([]);
    render(<DropCandidates league={leagueOf([me])} />);

    expect(screen.getByText(/No roster data/)).toBeDefined();
  });
});
