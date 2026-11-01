// BidWarWatch rendering: rival demand rows with remaining FAAB, the
// contested/clear read, and bidding advice — nothing when no targets.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BidWarWatch } from './BidWarWatch';
import type { League, Player, RosterSlots, Team, Transaction } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import type { WaiverPriorityTarget } from '@/utils/waiverPriority';

const SLOTS: RosterSlots = {
  QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, K: 1, DST: 1, BENCH: 5, IR: 0,
};

function rosterPlayer(id: string, name: string): Player {
  return { id, platformId: '', name, position: 'WR', team: 'FA' };
}

function waiverTx(teamId: string, teamName: string, bid: number): Transaction {
  return {
    id: `tx-${teamId}-${bid}`, type: 'waiver', timestamp: 1, week: 1,
    teamId, teamName, waiverBudgetSpent: bid, adds: [], drops: [],
  } as Transaction;
}

function mkTeam(id: string, name: string, wrId: string, wrName: string, spent: number): Team {
  return {
    id,
    name,
    isMyTeam: id === 'mine',
    roster: [rosterPlayer(wrId, wrName)],
    transactions: spent > 0 ? [waiverTx(id, name, spent)] : [],
  } as Team;
}

function leagueOf(teams: Team[]): League {
  return {
    id: 'test', name: 'Test League', platform: 'sleeper', totalTeams: 10,
    rosterSlots: SLOTS, scoringType: 'ppr', season: 2026, currentWeek: 8,
    teams, isLoaded: true,
  } as League;
}

const CHASE = {
  id: 'jamarr-chase-wr', name: "Ja'Marr Chase", pos: 'WR', team: 'CIN',
} as PoolPlayer;

function target(): WaiverPriorityTarget {
  return {
    player: CHASE, score: 1, gapWeeks: [], need: false, surplus: false,
    bid: { low: 5, high: 12 }, reasons: [],
  };
}

// Rival A (Hollywood Brown, VOR 0) and Rival B (Jonathan Mingo, VOR 0)
// both need at WR vs my Puka Nacua (83) and C's Jaylen Waddle (28).
// A spent all $100 (broke); B spent $10 ($90 left).
function setup() {
  const mine = mkTeam('mine', 'Mine', 'puka-nacua-wr', 'Puka Nacua', 0);
  const a = mkTeam('a', 'Rival A', 'hollywood-brown-wr', 'Hollywood Brown', 100);
  const b = mkTeam('b', 'Rival B', 'jonathan-mingo-wr', 'Jonathan Mingo', 10);
  const c = mkTeam('c', 'Rival C', 'jaylen-waddle-wr', 'Jaylen Waddle', 0);
  const league = leagueOf([mine, a, b, c]);
  return { league, mine };
}

describe('BidWarWatch', () => {
  it('names the needy rivals with remaining FAAB and a warm read', () => {
    const { league, mine } = setup();
    render(<BidWarWatch league={league} team={mine} targets={[target()]} />);

    expect(screen.getByRole('heading', { name: 'Bid War Watch' })).toBeDefined();
    // Rival B can bid ($90 left); Rival A needs a WR too but is broke.
    expect(screen.getByText('Rival B')).toBeDefined();
    expect(screen.getByText(/\$90 left/)).toBeDefined();
    // The broke badge plus the advice line both name the spent rival.
    expect(screen.getByText('— out of FAAB')).toBeDefined();
    expect(screen.getByText(/no bidding threat/)).toBeDefined();
    // One effective bidder → warm read.
    expect(screen.getByText('1 rival')).toBeDefined();
    expect(screen.getByText(/stay above \$5/)).toBeDefined();
    // My own team and the non-needy Rival C are never listed.
    expect(screen.queryByText('Rival C')).toBeNull();
  });

  it('renders nothing when there are no targets', () => {
    const { league, mine } = setup();
    const { container } = render(
      <BidWarWatch league={league} team={mine} targets={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
