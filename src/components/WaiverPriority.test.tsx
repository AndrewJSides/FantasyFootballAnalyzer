// WaiverPriority rendering: ranked table renders for the selected team,
// with a Bid column only when the league has recorded bids, and a Sleeper
// projection column (backlog item 144).
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { WaiverPriority } from './WaiverPriority';
import { fetchSleeperWeekProjections } from '@/api/sleeperWeeklyProjections';
import { POOL } from '@/data/draftPool';
import type { League, Team, Transaction } from '@/types';

vi.mock('@/api/sleeperWeeklyProjections', () => ({
  fetchSleeperWeekProjections: vi.fn(),
}));
const mockSleeper = vi.mocked(fetchSleeperWeekProjections);

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
  beforeEach(() => {
    mockSleeper.mockResolvedValue({});
  });

  it('renders a ranked table of 8 claim targets for the selected team', async () => {
    render(<WaiverPriority league={leagueOf([mkTeam('a', 'Alpha', []), mkTeam('b', 'Beta', [])])} />);
    expect(screen.getByRole('heading', { name: 'Waiver Priority Queue' })).toBeDefined();
    // 8 data rows + 1 header row in the ranked queue table (the Bid War
    // Watch section below it adds its own rows).
    const table = screen.getByRole('table', { name: /ranked waiver claims/i });
    expect(within(table).getAllByRole('row')).toHaveLength(9);
    expect(screen.getByLabelText('Ranking for')).toBeDefined();
    // Flush the async Sleeper fetch so no setState lands after the test.
    await within(table).findAllByLabelText('No Sleeper projection for this player');
  });

  it('shows the Bid column when the league has recorded bids', async () => {
    render(<WaiverPriority league={leagueOf([mkTeam('a', 'Alpha', [5]), mkTeam('b', 'Beta', [])])} />);
    expect(screen.getByRole('columnheader', { name: 'Bid' })).toBeDefined();
    const table = screen.getByRole('table', { name: /ranked waiver claims/i });
    await within(table).findAllByLabelText('No Sleeper projection for this player');
  });

  it('hides the Bid column when the league has no bid data', async () => {
    render(<WaiverPriority league={leagueOf([mkTeam('a', 'Alpha', []), mkTeam('b', 'Beta', [])])} />);
    expect(screen.queryByRole('columnheader', { name: 'Bid' })).toBeNull();
    const table = screen.getByRole('table', { name: /ranked waiver claims/i });
    await within(table).findAllByLabelText('No Sleeper projection for this player');
  });

  it('re-ranks when the team picker changes', async () => {
    render(<WaiverPriority league={leagueOf([mkTeam('a', 'Alpha', []), mkTeam('b', 'Beta', [])])} />);
    const select = screen.getByLabelText('Ranking for') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'b' } });
    expect(select.value).toBe('b');
    const table = screen.getByRole('table', { name: /ranked waiver claims/i });
    expect(within(table).getAllByRole('row')).toHaveLength(9);
    await within(table).findAllByLabelText('No Sleeper projection for this player');
  });

  it('shows Sleeper week projections on the queue rows', async () => {
    mockSleeper.mockResolvedValue(
      Object.fromEntries(
        POOL.players
          .filter(p => p.sleeperId)
          .map(p => [p.sleeperId as string, 12.3]),
      ),
    );
    render(<WaiverPriority league={leagueOf([mkTeam('a', 'Alpha', []), mkTeam('b', 'Beta', [])])} />);
    expect(mockSleeper).toHaveBeenCalledWith(2026, 8);
    const table = screen.getByRole('table', { name: /ranked waiver claims/i });
    const cells = await within(table).findAllByLabelText('Sleeper projection 12.3 for week 8');
    expect(cells).toHaveLength(8);
  });

  it('shows dashes where Sleeper published no line', async () => {
    render(<WaiverPriority league={leagueOf([mkTeam('a', 'Alpha', []), mkTeam('b', 'Beta', [])])} />);
    const table = screen.getByRole('table', { name: /ranked waiver claims/i });
    const cells = await within(table).findAllByLabelText('No Sleeper projection for this player');
    expect(cells).toHaveLength(8);
  });

  it('shows dashes when the Sleeper fetch fails', async () => {
    mockSleeper.mockRejectedValue(new Error('boom'));
    render(<WaiverPriority league={leagueOf([mkTeam('a', 'Alpha', []), mkTeam('b', 'Beta', [])])} />);
    const table = screen.getByRole('table', { name: /ranked waiver claims/i });
    const cells = await within(table).findAllByLabelText('Sleeper projection not loaded');
    expect(cells).toHaveLength(8);
  });
});
